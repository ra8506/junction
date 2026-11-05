// Types shared by the main process, preload bridge and renderer.

export type MailProviderKind = 'imap' | 'gmail' | 'microsoft' | 'demo';
export type CalendarProviderKind = 'caldav' | 'google' | 'microsoft' | 'none' | 'demo';

export interface ServerConfig {
  host: string;
  port: number;
  secure: boolean; // implicit TLS (993/465). false = STARTTLS
}

/** One mailbox the user has connected. Mail and calendar stay scoped to it. */
export interface Account {
  id: string;
  displayName: string; // "Work", "Personal" ...
  email: string;
  color: string; // used to tag items in unified views
  mail: MailProviderKind;
  calendar: CalendarProviderKind;
  auth: 'password' | 'oauth' | 'none';
  imap?: ServerConfig;
  smtp?: ServerConfig;
  username?: string; // defaults to email
  caldavUrl?: string; // e.g. https://caldav.fastmail.com/  or iCloud https://caldav.icloud.com/
}

export interface NewAccountInput extends Omit<Account, 'id' | 'auth'> {
  password?: string; // app password for IMAP/SMTP/CalDAV; stored encrypted
}

export interface MailSummary {
  accountId: string;
  folder: string;
  id: string; // provider message id (IMAP UID as string, Graph id ...)
  from: { name?: string; address: string };
  to: string[];
  subject: string;
  date: string; // ISO
  snippet: string;
  unread: boolean;
  flagged: boolean;
}

export interface MailBody extends MailSummary {
  html?: string;
  text?: string;
  cc: string[];
}

export interface Draft {
  accountId: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
}

export interface CalendarInfo {
  accountId: string;
  id: string;
  name: string;
  color?: string;
  readOnly: boolean;
}

export interface CalEvent {
  accountId: string;
  calendarId: string;
  id: string;
  title: string;
  start: string; // ISO; date-only events use YYYY-MM-DD
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
}

export interface NewEventInput {
  accountId: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
}

/** Result of loading a unified view: data plus per-account errors so one bad account never blanks the view. */
export interface Unified<T> {
  items: T[];
  errors: { accountId: string; message: string }[];
}

// ---------- Messaging (Matrix + mautrix bridges) ----------

export type ChatNetwork = 'whatsapp' | 'signal' | 'gmessages' | 'matrix' | 'other';

export interface MatrixConfig {
  homeserver: string; // https://matrix.example.com or http://localhost:8008
  userId: string; // @brian:example.com
}

export interface ChatSummary {
  roomId: string;
  name: string;
  network: ChatNetwork;
  avatarUrl?: string;
  lastMessage?: string;
  lastTs: number;
  unread: number;
  isBridgeBot: boolean; // management room with a bridge bot
}

export interface ChatMessage {
  eventId: string;
  roomId: string;
  sender: string;
  senderName: string;
  ts: number;
  own: boolean;
  kind: 'text' | 'image' | 'file' | 'notice' | 'other';
  body: string;
  mediaUrl?: string; // mxc://
}

export interface BridgeInfo {
  network: Exclude<ChatNetwork, 'matrix' | 'other'>;
  label: string;
  botUserId: string;
}

export interface MessagingState {
  configured: boolean;
  connected: boolean;
  userId?: string;
  homeserver?: string;
  error?: string;
}

export interface AppSettings {
  googleClientId?: string;
  googleClientSecret?: string; // Google "desktop app" clients ship a non-confidential secret
  microsoftClientId?: string;
  bridgeBots: BridgeInfo[];
}
