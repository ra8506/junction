import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import * as accounts from './accounts';
import { matrix } from './matrix';
import { loadConfig, saveConfig } from './store';
import type { AppSettings } from '../shared/types';

let win: BrowserWindow | undefined;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Junction',
    backgroundColor: '#f6f7f9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  // Links in emails open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// Every handler is wrapped so errors reach the renderer as plain messages.
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R) {
  ipcMain.handle(channel, async (_e, ...args) => fn(...(args as A)));
}

function registerIpc() {
  handle('accounts:list', accounts.listAccounts);
  handle('accounts:add', accounts.addAccount);
  handle('accounts:addOAuth', accounts.addOAuthAccount);
  handle('accounts:update', accounts.updateAccount);
  handle('accounts:remove', accounts.removeAccount);

  handle('mail:folders', accounts.listFolders);
  handle('mail:list', accounts.listMessages);
  handle('mail:get', accounts.getMessage);
  handle('mail:flag', accounts.setFlagged);
  handle('mail:read', accounts.setRead);
  handle('mail:send', accounts.sendMail);

  handle('cal:calendars', accounts.listCalendars);
  handle('cal:events', accounts.listEvents);
  handle('cal:create', accounts.createEvent);

  handle('msg:state', () => matrix.getState());
  handle('msg:login', (hs: string, user: string, pw: string) => matrix.login(hs, user, pw));
  handle('msg:logout', () => matrix.logout());
  handle('msg:chats', () => matrix.listChats());
  handle('msg:messages', (roomId: string) => matrix.getMessages(roomId));
  handle('msg:backfill', (roomId: string) => matrix.backfill(roomId));
  handle('msg:send', (roomId: string, text: string) => matrix.send(roomId, text));
  handle('msg:markRead', (roomId: string) => matrix.markRead(roomId));
  handle('msg:media', (mxc: string) => matrix.media(mxc));
  handle('msg:connectBridge', (n: Parameters<typeof matrix.connectBridge>[0]) => matrix.connectBridge(n));

  handle('settings:get', async () => (await loadConfig()).settings);
  handle('settings:set', async (patch: Partial<AppSettings>) => (await saveConfig((c) => Object.assign(c.settings, patch))).settings);

  matrix.onChange(() => win?.webContents.send('msg:changed'));
}

app.setAppUserModelId('com.junction.desktop');
app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  await matrix.init();
});
app.on('window-all-closed', () => app.quit());
