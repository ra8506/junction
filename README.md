# Junction

A Windows desktop app that brings email, calendars and chats into one place while keeping
every account separate.

- **Mail**: Gmail, Microsoft (Outlook.com, Hotmail, Microsoft 365) and any IMAP account.
  All inboxes together, a unified Flagged view, and each account's own folders.
- **Calendar**: Google, Microsoft and CalDAV calendars in one week/day view, colored by account, with per-account toggles.
- **Messages**: WhatsApp, Signal and Google Messages in one list with network filters, through self-hosted Matrix bridges.

## Keyboard shortcuts

| Key | Action |
|---|---|
| **F** | Flag / unflag the selected email |
| J / K or ↓ / ↑ | Next / previous email |
| U | Mark read / unread |
| R | Reply |
| N | New message |
| F5 | Refresh |
| Ctrl+1…4 | Mail, Calendar, Messages, Accounts |
| Ctrl+Enter | Send (in compose) |

## Run it

Requires Node.js 22+.

```powershell
npm install
npm run dev          # launch with hot reload
npm test             # unit tests
npm run dist:win     # build the Windows installer into release/
```

First launch: Accounts > **Try with sample data** to explore with demo accounts, or add real accounts.

## Setup guides
- [Gmail and Microsoft sign-in](docs/SETUP.md) (one-time app registration for each)
- [WhatsApp, Signal, Google Messages bridges](docs/BRIDGES.md)
- [Architecture, constraints and roadmap](docs/ARCHITECTURE.md)
