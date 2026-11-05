# Messaging setup: WhatsApp, Signal and Google Messages

Junction's Messaging tab is a Matrix client. The networks are reached through
[mautrix](https://docs.mau.fi/bridges/) bridges, which log in to each network
*as you* (like a linked device) and relay chats into a Matrix homeserver you own.
Nothing goes through a third party unless you choose a hosted homeserver.

```
 WhatsApp ─┐                      ┌──────────────┐        ┌──────────┐
 Signal   ─┼─ mautrix bridges ───▶│  homeserver  │◀─HTTPS─│ Junction │
 Google   ─┘   (linked devices)   │  (Synapse)   │        └──────────┘
 Messages                         └──────────────┘
```

## Option A: run it yourself with Docker (recommended)

Requires Docker Desktop. The bridges must keep running for messages to sync, so an
always-on machine (home server, NAS, small VPS) works best; this PC is fine to try it.

1. `cd bridges` and pick a server name (it becomes part of your Matrix ID, e.g. `@brian:home.local`):
   `set SERVER_NAME=home.local` (PowerShell: `$env:SERVER_NAME="home.local"`).
2. Generate the Synapse config:
   `docker compose run --rm -e SYNAPSE_SERVER_NAME=%SERVER_NAME% synapse generate`
3. Start each bridge once so it writes `data/<bridge>/config.yaml`, then stop it:
   `docker compose up whatsapp signal gmessages` then Ctrl+C.
4. In each `data/<bridge>/config.yaml` set:
   - `homeserver.address: http://synapse:8008` and `homeserver.domain: <SERVER_NAME>`
   - `appservice.address: http://<bridge>:29318` (use the port already in the file; the service name is `whatsapp`, `signal` or `gmessages`)
   - `bridge.permissions: { "<SERVER_NAME>": user, "@brian:<SERVER_NAME>": admin }`
   - leave `encryption.allow: false` for now (Junction's MVP client does not do end-to-end encryption between the bridge and the app; the bridge still talks to WhatsApp/Signal with their normal encryption).
   Start the bridge again so it writes `data/<bridge>/registration.yaml`.
5. Add the registrations to `data/synapse/homeserver.yaml`:
   ```yaml
   app_service_config_files:
     - /bridges/whatsapp/registration.yaml
     - /bridges/signal/registration.yaml
     - /bridges/gmessages/registration.yaml
   ```
6. `docker compose up -d`, then create your user:
   `docker compose exec synapse register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008 -u brian -a`
7. In Junction > Messages, sign in to `http://localhost:8008` as that user.
8. Click **+ WhatsApp**, **+ Signal** or **+ Google Messages**. Junction opens a chat with the bridge bot and sends `login`; the bot replies with a QR code:
   - WhatsApp: phone > Settings > Linked devices > Link a device.
   - Signal: phone > Settings > Linked devices > (+).
   - Google Messages: phone > Messages > profile > Device pairing > QR code scanner.

Bot user IDs default to `@whatsappbot`, `@signalbot`, `@gmessagesbot`; change them under Accounts > Messaging bridge bots if your configs differ.

## Option B: Beeper's self-hosted bridge manager

If you already use Beeper, its `bbctl` tool can run the same mautrix bridges against
your Beeper account, and Junction can sign in to that Matrix account instead. Beeper's
terms govern that setup.

## Constraints to know

- **Unofficial access.** WhatsApp, Signal and Google Messages do not offer public APIs
  for personal accounts. The bridges act as a linked device using reverse-engineered
  protocols. That breaks the networks' terms of service (WhatsApp's most explicitly);
  bans are rare for normal personal use but possible. Use at your own risk.
- **Phone requirements.** Google Messages needs your Android phone online (it relays SMS/RCS).
  WhatsApp and Signal work while the phone is offline, but must check in every ~14 to 30 days
  or the linked device is dropped.
- **Privacy.** Messages are decrypted at the bridge and stored on your homeserver. Run it on
  hardware you control and keep the homeserver port on localhost or behind TLS.
