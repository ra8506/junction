# Junction architecture

## Stack choice

**Electron + React + TypeScript**, packaged for Windows with electron-builder (NSIS installer, x64 and ARM64).

Why not the alternatives:
- **Tauri** gives a smaller binary, but the backend would be Rust and the mature mail/calendar
  libraries we lean on (ImapFlow, Nodemailer, mailparser, tsdav, ical.js) are Node.
- **.NET / WinUI 3** is the most native on Windows (MailKit is excellent), but the UI work is
  slower and a Matrix client would need to be written from scratch. Worth revisiting only if
  memory use becomes a problem.

## Layout

```
src/
  shared/      types + pure helpers used everywhere (unified merge, sorting)
  main/        Electron main process: all network, storage and credentials
    store.ts         JSON config + DPAPI-encrypted secrets (Electron safeStorage)
    oauth.ts         Google/Microsoft sign-in: system browser, loopback redirect, PKCE, refresh
    accounts.ts      account registry; builds unified views from per-account providers
    providers/
      mail-imap.ts       IMAP/SMTP (generic + Gmail via XOAUTH2)
      mail-graph.ts      Microsoft mail via Graph
      calendar-google.ts Google Calendar API
      calendar-graph.ts  Microsoft calendars via Graph
      calendar-caldav.ts CalDAV (iCloud, Fastmail, ...) + ical.ts parser with recurrence expansion
      demo.ts            sample data for trying the app without accounts
    matrix.ts        minimal Matrix client (login, /sync loop, send, receipts, media)
    matrix-state.ts  pure reducer: sync data -> chat list, network detection
  preload/     typed, minimal API exposed to the UI (contextIsolation + sandbox)
  renderer/    React UI: Mail, Calendar, Messages, Accounts
```

The renderer never touches the network or credentials; it calls the preload API, which
calls IPC handlers in the main process.

## Accounts: separate but unified

Every account owns its own provider instances, folders, calendars and secrets. Unified
views (All inboxes, Flagged, the calendar week) fan out to each account in parallel and
merge results. One failing account shows an inline error and never blanks the view.
Items carry `accountId`, and the UI shows the account's color on every row and event.
Replies and new events default to the account the item came from.

| Account type | Mail | Calendar | Auth |
|---|---|---|---|
| Gmail / Workspace | IMAP + SMTP (XOAUTH2) | Google Calendar API | OAuth (PKCE, loopback) |
| Microsoft (Outlook.com, M365) | Microsoft Graph | Microsoft Graph | OAuth (PKCE, loopback) |
| Other | IMAP + SMTP | CalDAV | password / app password |

## Messaging

A Matrix client in the main process talks to a homeserver the user controls, where
mautrix bridges connect WhatsApp, Signal and Google Messages (see BRIDGES.md). Rooms are
labelled by network from the bridge's `m.bridge` state event. Connecting a network opens
a DM with the bridge bot and sends `login qr`; the bot replies with a pairing QR code that
renders in the chat.

This is the same architecture Beeper uses, without depending on Beeper's service.

### Constraints and terms of service
- WhatsApp, Signal and Google Messages have no official API for personal accounts. The
  bridges use reverse-engineered linked-device protocols, which conflicts with those
  services' terms. Account bans are uncommon but possible.
- Bridged messages are decrypted on the bridge host. Self-hosting keeps them on your hardware.
- Gmail's `mail.google.com` scope is restricted: fine for personal use with your own OAuth
  client, needs a Google security assessment to distribute publicly.

## Security
- `contextIsolation`, `sandbox`, no `nodeIntegration`; strict CSP on the app shell.
- HTML mail renders in a sandboxed iframe with scripts disabled; remote images blocked until "Load images".
- Links open in the default browser, never in the app window.
- Secrets encrypted with DPAPI; the app refuses to store them unencrypted.

## Roadmap (after MVP)
1. Local cache (SQLite) and IMAP IDLE / Graph delta / Gmail history for push updates and offline use.
2. Search across accounts; threads/conversations; move, archive, delete; drag and drop.
3. Attachments (view, save, send); rich-text compose; signatures per account.
4. Calendar: edit/delete events, invitations (iTIP accept/decline), month view, reminders via Windows toasts.
5. Messaging: end-to-bridge encryption (matrix-rust-sdk crypto), media sending, reactions, replies.
6. Contacts (CardDAV, Google People, Graph) shared across mail and messaging.
7. Code signing + auto-update (electron-updater) for the installer.
