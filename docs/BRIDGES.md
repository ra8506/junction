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

1. `cd bridges` and pick a server name (it becomes part of your Matrix ID, e.g. `@brian:home.local`).
   The commands below use `home.local`; replace it everywhere if you pick another.
2. Generate the Synapse config (creates `data/synapse/homeserver.yaml`):
   `docker compose run --rm -e SYNAPSE_SERVER_NAME=home.local -e SYNAPSE_REPORT_STATS=no synapse generate`
3. Start each bridge once so it writes `data/<bridge>/config.yaml`, then stop it:
   `docker compose up whatsapp signal gmessages` then Ctrl+C.
4. **Easiest:** run `node configure.mjs home.local brian` (your SERVER_NAME and username). It edits all
   three bridge configs and registers them in Synapse's `homeserver.yaml` (step 5), keeping a `.bak` copy.
   Then skip to step 6. To edit by hand instead: edit each `data/<bridge>/config.yaml`. The keys are nested YAML sections, so look for the
   section header (for example `homeserver:`) and change the indented line under it. Replace
   `home.local` with your SERVER_NAME and `whatsapp` with `signal` / `gmessages` for the other bridges:
   ```yaml
   bridge:
       permissions:
           "home.local": user
           "@brian:home.local": admin

   database:
       type: sqlite3-fk-wal
       uri: file:/data/bridge.db?_txlock=immediate

   homeserver:
       address: http://synapse:8008
       domain: home.local

   appservice:
       address: http://whatsapp:29318   # keep the port number that is already on the `port:` line below
       hostname: 0.0.0.0

   encryption:
       allow: false
   ```
   (`encryption:` is near the bottom of the file; `allow: false` is already the default, just leave it.
   Junction's MVP client does not do end-to-end encryption between the bridge and the app; the
   bridge still talks to WhatsApp/Signal with their normal encryption.)
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
