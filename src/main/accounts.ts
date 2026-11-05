// Account registry: owns provider instances and builds unified views on top of them.
import { randomUUID } from 'node:crypto';
import type { Account, CalEvent, CalendarInfo, Draft, MailBody, MailSummary, NewAccountInput, NewEventInput, Unified } from '../shared/types';
import { gather, sortEvents, sortMailNewestFirst } from '../shared/unify';
import { accessToken, authorize, type OAuthProvider } from './oauth';
import { deleteSecretsWithPrefix, getSecret, loadConfig, saveConfig, setSecret } from './store';
import type { CalendarProvider } from './providers/calendar-types';
import { CalDavProvider } from './providers/calendar-caldav';
import { GoogleCalendarProvider } from './providers/calendar-google';
import { GraphCalendarProvider } from './providers/calendar-graph';
import { DemoCalendarProvider, DemoMailProvider } from './providers/demo';
import { GMAIL_IMAP, GMAIL_SMTP, ImapProvider } from './providers/mail-imap';
import { GraphMailProvider } from './providers/mail-graph';
import type { MailFolder, MailProvider } from './providers/mail-types';

const PALETTE = ['#2f6fde', '#d9480f', '#2b8a3e', '#9c36b5', '#c2255c', '#0b7285', '#e67700'];

const mailCache = new Map<string, MailProvider>();
const calCache = new Map<string, CalendarProvider>();

async function password(a: Account): Promise<string> {
  const p = await getSecret<string>(`password:${a.id}`);
  if (!p) throw new Error('No password stored for this account');
  return p;
}

function oauthOf(a: Account): OAuthProvider | undefined {
  if (a.mail === 'gmail' || a.calendar === 'google') return 'google';
  if (a.mail === 'microsoft' || a.calendar === 'microsoft') return 'microsoft';
  return undefined;
}

function tokenFn(a: Account) {
  const p = oauthOf(a);
  if (!p) throw new Error('Account has no OAuth provider');
  return () => accessToken(a.id, p);
}

function mailProvider(a: Account): MailProvider {
  let p = mailCache.get(a.id);
  if (p) return p;
  const user = a.username || a.email;
  switch (a.mail) {
    case 'demo':
      p = new DemoMailProvider(a);
      break;
    case 'microsoft':
      p = new GraphMailProvider(a, tokenFn(a));
      break;
    case 'gmail':
      p = new ImapProvider({ ...a, imap: GMAIL_IMAP, smtp: GMAIL_SMTP }, async () => ({ user, accessToken: await tokenFn(a)() }));
      break;
    case 'imap':
      p = new ImapProvider(a, async () => ({ user, pass: await password(a) }));
      break;
  }
  mailCache.set(a.id, p);
  return p;
}

function calendarProvider(a: Account): CalendarProvider | undefined {
  if (a.calendar === 'none') return undefined;
  let p = calCache.get(a.id);
  if (p) return p;
  switch (a.calendar) {
    case 'demo':
      p = new DemoCalendarProvider(a);
      break;
    case 'google':
      p = new GoogleCalendarProvider(a, tokenFn(a));
      break;
    case 'microsoft':
      p = new GraphCalendarProvider(a, tokenFn(a));
      break;
    case 'caldav':
      p = new CalDavProvider(a, () => password(a));
      break;
  }
  calCache.set(a.id, p);
  return p;
}

async function account(id: string): Promise<Account> {
  const a = (await loadConfig()).accounts.find((x) => x.id === id);
  if (!a) throw new Error('Unknown account');
  return a;
}

// ---------- account management ----------

export async function listAccounts(): Promise<Account[]> {
  return (await loadConfig()).accounts;
}

export async function addAccount(input: NewAccountInput): Promise<Account> {
  const { password: pw, ...rest } = input;
  const existing = await listAccounts();
  const a: Account = {
    ...rest,
    id: randomUUID(),
    color: rest.color || PALETTE[existing.length % PALETTE.length],
    auth: rest.mail === 'demo' ? 'none' : 'password'
  };
  if (pw) await setSecret(`password:${a.id}`, pw);
  await saveConfig((c) => c.accounts.push(a));
  return a;
}

/** Sign in with Google or Microsoft in the system browser and create the account. */
export async function addOAuthAccount(provider: OAuthProvider, displayName: string, loginHint?: string): Promise<Account> {
  const tokens = await authorize(provider, loginHint);
  const existing = await listAccounts();
  const email = tokens.email ?? loginHint ?? '';
  const a: Account = {
    id: randomUUID(),
    displayName: displayName || email,
    email,
    color: PALETTE[existing.length % PALETTE.length],
    mail: provider === 'google' ? 'gmail' : 'microsoft',
    calendar: provider === 'google' ? 'google' : 'microsoft',
    auth: 'oauth'
  };
  await setSecret(`oauth:${a.id}`, tokens);
  await saveConfig((c) => c.accounts.push(a));
  return a;
}

export async function updateAccount(id: string, patch: Partial<Pick<Account, 'displayName' | 'color'>>): Promise<Account> {
  let updated: Account | undefined;
  await saveConfig((c) => {
    const a = c.accounts.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
    updated = a;
  });
  if (!updated) throw new Error('Unknown account');
  return updated;
}

export async function removeAccount(id: string): Promise<void> {
  await mailCache.get(id)?.close?.();
  mailCache.delete(id);
  calCache.delete(id);
  await saveConfig((c) => {
    c.accounts = c.accounts.filter((a) => a.id !== id);
  });
  await deleteSecretsWithPrefix(`password:${id}`);
  await deleteSecretsWithPrefix(`oauth:${id}`);
}

// ---------- mail ----------

export async function listFolders(accountId: string): Promise<MailFolder[]> {
  return mailProvider(await account(accountId)).listFolders();
}

/** accountId undefined = unified inbox across all accounts. */
export async function listMessages(accountId: string | undefined, folder: string, limit = 50): Promise<Unified<MailSummary>> {
  const ids = accountId ? [accountId] : (await listAccounts()).map((a) => a.id);
  const r = await gather(ids, async (id) => mailProvider(await account(id)).listMessages(folder, limit));
  return { items: sortMailNewestFirst(r.items), errors: r.errors };
}

export async function getMessage(accountId: string, folder: string, id: string): Promise<MailBody> {
  const p = mailProvider(await account(accountId));
  const m = await p.getMessage(folder, id);
  if (m.unread) {
    await p.setRead(folder, id, true).catch(() => undefined);
    m.unread = false;
  }
  return m;
}

export async function setFlagged(accountId: string, folder: string, id: string, flagged: boolean) {
  return mailProvider(await account(accountId)).setFlagged(folder, id, flagged);
}

export async function setRead(accountId: string, folder: string, id: string, read: boolean) {
  return mailProvider(await account(accountId)).setRead(folder, id, read);
}

export async function sendMail(d: Draft) {
  return mailProvider(await account(d.accountId)).send(d);
}

// ---------- calendar ----------

export async function listCalendars(): Promise<Unified<CalendarInfo>> {
  const accts = (await listAccounts()).filter((a) => a.calendar !== 'none');
  return gather(accts.map((a) => a.id), async (id) => calendarProvider(await account(id))!.listCalendars());
}

export async function listEvents(fromIso: string, toIso: string, accountId?: string): Promise<Unified<CalEvent>> {
  const accts = (await listAccounts()).filter((a) => a.calendar !== 'none' && (!accountId || a.id === accountId));
  const r = await gather(accts.map((a) => a.id), async (id) => calendarProvider(await account(id))!.listEvents(fromIso, toIso));
  return { items: sortEvents(r.items), errors: r.errors };
}

export async function createEvent(e: NewEventInput): Promise<CalEvent> {
  const p = calendarProvider(await account(e.accountId));
  if (!p) throw new Error('This account has no calendar');
  return p.createEvent(e);
}
