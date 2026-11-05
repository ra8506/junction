// Generic IMAP/SMTP provider. Also used for Gmail, with XOAUTH2 instead of a password.
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser, type AddressObject } from 'mailparser';
import type { Account, Draft, MailBody, MailSummary } from '../../shared/types';
import { INBOX, type MailFolder, type MailProvider } from './mail-types';

export type Credentials = { user: string; pass: string } | { user: string; accessToken: string };

const ROLE: Record<string, MailFolder['role']> = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Trash': 'trash',
  '\\Junk': 'junk',
  '\\Archive': 'archive',
  '\\Flagged': 'flagged',
  '\\All': 'archive'
};

function addrList(a?: AddressObject | AddressObject[]): string[] {
  if (!a) return [];
  return (Array.isArray(a) ? a : [a]).flatMap((x) => x.value.map((v) => v.address ?? '')).filter(Boolean);
}

export class ImapProvider implements MailProvider {
  private client?: ImapFlow;

  constructor(
    private account: Account,
    private creds: () => Promise<Credentials>
  ) {}

  private async imap(): Promise<ImapFlow> {
    if (this.client?.usable) return this.client;
    const cfg = this.account.imap;
    if (!cfg) throw new Error('IMAP server not configured');
    const c = await this.creds();
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: 'pass' in c ? { user: c.user, pass: c.pass } : { user: c.user, accessToken: c.accessToken },
      logger: false
    });
    client.on('error', () => {
      /* connection drops are handled by reconnecting on next use */
    });
    await client.connect();
    this.client = client;
    return client;
  }

  private path(folder: string): string {
    return folder === INBOX ? 'INBOX' : folder;
  }

  async listFolders(): Promise<MailFolder[]> {
    const list = await (await this.imap()).list();
    return list
      .filter((f) => !f.flags.has('\\Noselect'))
      .map((f) => ({
        id: f.path === 'INBOX' ? INBOX : f.path,
        name: f.path === 'INBOX' ? 'Inbox' : f.name,
        role: f.path === 'INBOX' ? 'inbox' : f.specialUse ? ROLE[f.specialUse] : undefined
      }));
  }

  async listMessages(folder: string, limit: number): Promise<MailSummary[]> {
    const client = await this.imap();
    const lock = await client.getMailboxLock(this.path(folder));
    try {
      const mb = client.mailbox;
      const exists = mb ? mb.exists : 0;
      if (!exists) return [];
      const from = Math.max(1, exists - limit + 1);
      const out: MailSummary[] = [];
      for await (const m of client.fetch(`${from}:*`, { uid: true, envelope: true, flags: true, internalDate: true })) {
        const env = m.envelope;
        const sender = env?.from?.[0];
        out.push({
          accountId: this.account.id,
          folder,
          id: String(m.uid),
          from: { name: sender?.name || undefined, address: sender?.address ?? '' },
          to: (env?.to ?? []).map((t) => t.address ?? '').filter(Boolean),
          subject: env?.subject ?? '(no subject)',
          date: new Date(env?.date ?? m.internalDate ?? Date.now()).toISOString(),
          snippet: '',
          unread: !m.flags?.has('\\Seen'),
          flagged: !!m.flags?.has('\\Flagged')
        });
      }
      return out.reverse();
    } finally {
      lock.release();
    }
  }

  async getMessage(folder: string, id: string): Promise<MailBody> {
    const client = await this.imap();
    const lock = await client.getMailboxLock(this.path(folder));
    try {
      const msg = await client.fetchOne(id, { source: true, flags: true, uid: true }, { uid: true });
      if (!msg || !msg.source) throw new Error('Message not found');
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.value[0];
      return {
        accountId: this.account.id,
        folder,
        id,
        from: { name: from?.name || undefined, address: from?.address ?? '' },
        to: addrList(parsed.to),
        cc: addrList(parsed.cc),
        subject: parsed.subject ?? '(no subject)',
        date: (parsed.date ?? new Date()).toISOString(),
        snippet: (parsed.text ?? '').slice(0, 160),
        unread: !msg.flags?.has('\\Seen'),
        flagged: !!msg.flags?.has('\\Flagged'),
        html: parsed.html || undefined,
        text: parsed.text
      };
    } finally {
      lock.release();
    }
  }

  private async flag(folder: string, id: string, flag: string, on: boolean): Promise<void> {
    const client = await this.imap();
    const lock = await client.getMailboxLock(this.path(folder));
    try {
      if (on) await client.messageFlagsAdd(id, [flag], { uid: true });
      else await client.messageFlagsRemove(id, [flag], { uid: true });
    } finally {
      lock.release();
    }
  }

  setFlagged(folder: string, id: string, flagged: boolean) {
    return this.flag(folder, id, '\\Flagged', flagged);
  }

  setRead(folder: string, id: string, read: boolean) {
    return this.flag(folder, id, '\\Seen', read);
  }

  async send(draft: Draft): Promise<void> {
    const cfg = this.account.smtp;
    if (!cfg) throw new Error('SMTP server not configured');
    const c = await this.creds();
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: 'pass' in c ? { user: c.user, pass: c.pass } : { type: 'OAuth2', user: c.user, accessToken: c.accessToken }
    });
    await transport.sendMail({
      from: { name: this.account.displayName, address: this.account.email },
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
      inReplyTo: draft.inReplyTo
    });
  }

  async close(): Promise<void> {
    await this.client?.logout().catch(() => undefined);
    this.client = undefined;
  }
}

export const GMAIL_IMAP = { host: 'imap.gmail.com', port: 993, secure: true };
export const GMAIL_SMTP = { host: 'smtp.gmail.com', port: 465, secure: true };
