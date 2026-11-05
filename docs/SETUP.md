# Account setup

## Gmail / Google Workspace

Gmail uses Google sign-in (OAuth) in your browser; Junction never sees your password.
You need your own free Google Cloud OAuth client (one-time, about 5 minutes):

1. https://console.cloud.google.com/ > create a project (e.g. "Junction").
2. APIs & Services > Library: enable **Gmail API** and **Google Calendar API**.
3. OAuth consent screen: User type **External**, add your Gmail address(es) under **Test users**.
   Scopes: `https://mail.google.com/` and `https://www.googleapis.com/auth/calendar`.
4. Credentials > Create credentials > OAuth client ID > Application type **Desktop app**.
5. Copy the client ID and client secret into Junction > Accounts > Sign-in apps (or set
   `JUNCTION_GOOGLE_CLIENT_ID` / `JUNCTION_GOOGLE_CLIENT_SECRET`).

Notes: in "Testing" mode Google expires refresh tokens after 7 days, so you will be asked
to sign in again weekly. Publishing the app removes that, but `mail.google.com` is a
restricted scope, so a public release needs Google's security assessment. For personal
use you can avoid that by setting the app to "In production" without verification; you will
see an "unverified app" warning on sign-in.

Mail goes over IMAP/SMTP with XOAUTH2 (imap.gmail.com / smtp.gmail.com); calendar uses the
Google Calendar API.

## Microsoft (Outlook.com, Hotmail, Live, Microsoft 365)

1. https://entra.microsoft.com/ > App registrations > New registration.
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Public client/native (mobile & desktop)**, value `http://localhost`.
4. API permissions > Microsoft Graph > Delegated: `Mail.ReadWrite`, `Mail.Send`,
   `Calendars.ReadWrite`, `User.Read`, `offline_access`.
5. Copy the **Application (client) ID** into Junction > Accounts > Sign-in apps (or set `JUNCTION_MS_CLIENT_ID`).

Work/school tenants may require an admin to consent to the app. Mail and calendar both use Microsoft Graph.

## Other providers (IMAP/SMTP + CalDAV)

Choose **Other** and enter your email; common servers (iCloud, Fastmail, Yahoo, Zoho) fill in
automatically. Most providers require an **app-specific password** when 2-step verification is on.
Calendar uses CalDAV when a CalDAV URL is given (iCloud: `https://caldav.icloud.com/`).

## Where data lives

`%APPDATA%\Junction\config.json` holds account settings. Passwords and tokens are in
`secrets.json`, encrypted with Windows DPAPI (only your Windows user can decrypt them).
