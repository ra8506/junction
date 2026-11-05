import { contextBridge, ipcRenderer } from 'electron';
import type { Account, AppSettings, BridgeInfo, CalEvent, CalendarInfo, ChatMessage, ChatSummary, Draft, MailBody, MailSummary, MessagingState, NewAccountInput, NewEventInput, Unified } from '../shared/types';

const call = <T>(ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args) as Promise<T>;

export interface MailFolder {
  id: string;
  name: string;
  role?: string;
}

const api = {
  accounts: {
    list: () => call<Account[]>('accounts:list'),
    add: (a: NewAccountInput) => call<Account>('accounts:add', a),
    addOAuth: (provider: 'google' | 'microsoft', displayName: string, loginHint?: string) =>
      call<Account>('accounts:addOAuth', provider, displayName, loginHint),
    update: (id: string, patch: Partial<Pick<Account, 'displayName' | 'color'>>) => call<Account>('accounts:update', id, patch),
    remove: (id: string) => call<void>('accounts:remove', id)
  },
  mail: {
    folders: (accountId: string) => call<MailFolder[]>('mail:folders', accountId),
    list: (accountId: string | undefined, folder: string) => call<Unified<MailSummary>>('mail:list', accountId, folder),
    get: (accountId: string, folder: string, id: string) => call<MailBody>('mail:get', accountId, folder, id),
    flag: (accountId: string, folder: string, id: string, flagged: boolean) => call<void>('mail:flag', accountId, folder, id, flagged),
    read: (accountId: string, folder: string, id: string, read: boolean) => call<void>('mail:read', accountId, folder, id, read),
    send: (d: Draft) => call<void>('mail:send', d)
  },
  calendar: {
    calendars: () => call<Unified<CalendarInfo>>('cal:calendars'),
    events: (from: string, to: string, accountId?: string) => call<Unified<CalEvent>>('cal:events', from, to, accountId),
    create: (e: NewEventInput) => call<CalEvent>('cal:create', e)
  },
  messaging: {
    state: () => call<MessagingState>('msg:state'),
    login: (hs: string, user: string, pw: string) => call<MessagingState>('msg:login', hs, user, pw),
    logout: () => call<void>('msg:logout'),
    chats: () => call<ChatSummary[]>('msg:chats'),
    messages: (roomId: string) => call<ChatMessage[]>('msg:messages', roomId),
    backfill: (roomId: string) => call<ChatMessage[]>('msg:backfill', roomId),
    send: (roomId: string, text: string) => call<void>('msg:send', roomId, text),
    markRead: (roomId: string) => call<void>('msg:markRead', roomId),
    media: (mxc: string) => call<string>('msg:media', mxc),
    connectBridge: (n: BridgeInfo['network']) => call<string>('msg:connectBridge', n),
    onChange: (fn: () => void) => {
      const l = () => fn();
      ipcRenderer.on('msg:changed', l);
      return () => {
        ipcRenderer.removeListener('msg:changed', l);
      };
    }
  },
  settings: {
    get: () => call<AppSettings>('settings:get'),
    set: (patch: Partial<AppSettings>) => call<AppSettings>('settings:set', patch)
  }
};

export type JunctionApi = typeof api;
contextBridge.exposeInMainWorld('junction', api);
