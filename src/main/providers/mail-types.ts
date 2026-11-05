import type { Account, Draft, MailBody, MailSummary } from '../../shared/types';

export interface MailFolder {
  id: string; // provider path/id. The unified inbox uses the sentinel INBOX.
  name: string;
  role?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'flagged';
}

export const INBOX = 'INBOX';

export interface MailProvider {
  listFolders(): Promise<MailFolder[]>;
  listMessages(folder: string, limit: number): Promise<MailSummary[]>;
  getMessage(folder: string, id: string): Promise<MailBody>;
  setFlagged(folder: string, id: string, flagged: boolean): Promise<void>;
  setRead(folder: string, id: string, read: boolean): Promise<void>;
  send(draft: Draft): Promise<void>;
  close?(): Promise<void>;
}

export type MailProviderFactory = (account: Account) => MailProvider;
