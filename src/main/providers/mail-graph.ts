// Microsoft mail via Graph. Works for personal Outlook.com/Hotmail and work/school (M365) accounts.
import type { Account, Draft, MailBody, MailSummary } from '../../shared/types';
import { graph, type TokenFn } from './graph';
import { INBOX, type MailFolder, type MailProvider } from './mail-types';

interface GMsg {
  id: string;
  subject?: string;
  from?: { emailAddress: { name?: string; address: string } };
  toRecipients?: { emailAddress: { address: string } }[];
  ccRecipients?: { emailAddress: { address: string } }[];
  receivedDateTime: string;
  bodyPreview?: string;
  isRead: boolean;
  flag?: { flagStatus: 'flagged' | 'notFlagged' | 'complete' };
  body?: { contentType: 'html' | 'text'; content: string };
}

const SELECT = 'id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,flag';
const ROLE: Record<string, MailFolder['role']> = {
  inbox: 'inbox',
  sentitems: 'sent',
  drafts: 'drafts',
  deleteditems: 'trash',
  junkemail: 'junk',
  archive: 'archive'
};

export class GraphMailProvider implements MailProvider {
  constructor(
    private account: Account,
    private token: TokenFn
  ) {}

  private fid(folder: string) {
    return folder === INBOX ? 'inbox' : encodeURIComponent(folder);
  }

  private map(folder: string, m: GMsg): MailSummary {
    return {
      accountId: this.account.id,
      folder,
      id: m.id,
      from: { name: m.from?.emailAddress.name, address: m.from?.emailAddress.address ?? '' },
      to: (m.toRecipients ?? []).map((r) => r.emailAddress.address),
      subject: m.subject || '(no subject)',
      date: m.receivedDateTime,
      snippet: m.bodyPreview ?? '',
      unread: !m.isRead,
      flagged: m.flag?.flagStatus === 'flagged'
    };
  }

  async listFolders(): Promise<MailFolder[]> {
    // Well-known names let us tag roles; resolve their ids first.
    const wk = await Promise.all(
      Object.keys(ROLE).map((n) =>
        graph<{ id: string }>(this.token, `/me/mailFolders/${n}?$select=id`).then(
          (f) => [f.id, n] as const,
          () => undefined
        )
      )
    );
    const roleById = new Map(wk.filter((x): x is readonly [string, string] => !!x));
    const res = await graph<{ value: { id: string; displayName: string }[] }>(
      this.token,
      '/me/mailFolders?$top=100&$select=id,displayName'
    );
    return res.value.map((f) => {
      const wellKnown = roleById.get(f.id);
      return {
        id: wellKnown === 'inbox' ? INBOX : f.id,
        name: f.displayName,
        role: wellKnown ? ROLE[wellKnown] : undefined
      };
    });
  }

  async listMessages(folder: string, limit: number): Promise<MailSummary[]> {
    const res = await graph<{ value: GMsg[] }>(
      this.token,
      `/me/mailFolders/${this.fid(folder)}/messages?$top=${limit}&$select=${SELECT}&$orderby=receivedDateTime desc`
    );
    return res.value.map((m) => this.map(folder, m));
  }

  async getMessage(folder: string, id: string): Promise<MailBody> {
    const m = await graph<GMsg>(this.token, `/me/messages/${encodeURIComponent(id)}?$select=${SELECT},ccRecipients,body`);
    const base = this.map(folder, m);
    return {
      ...base,
      cc: (m.ccRecipients ?? []).map((r) => r.emailAddress.address),
      html: m.body?.contentType === 'html' ? m.body.content : undefined,
      text: m.body?.contentType === 'text' ? m.body.content : undefined
    };
  }

  async setFlagged(_folder: string, id: string, flagged: boolean): Promise<void> {
    await graph(this.token, `/me/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ flag: { flagStatus: flagged ? 'flagged' : 'notFlagged' } })
    });
  }

  async setRead(_folder: string, id: string, read: boolean): Promise<void> {
    await graph(this.token, `/me/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: read })
    });
  }

  async send(d: Draft): Promise<void> {
    const rcpt = (xs: string[] = []) => xs.map((address) => ({ emailAddress: { address } }));
    await graph(this.token, '/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject: d.subject,
          body: d.html ? { contentType: 'HTML', content: d.html } : { contentType: 'Text', content: d.text },
          toRecipients: rcpt(d.to),
          ccRecipients: rcpt(d.cc)
        },
        saveToSentItems: true
      })
    });
  }
}
