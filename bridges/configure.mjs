#!/usr/bin/env node
// Fills in the mautrix bridge configs and registers them with Synapse.
// Usage (from the bridges folder):  node configure.mjs <server-name> <your-username>
//   e.g.  node configure.mjs home.local brian
// Run it after the bridges have generated data/<bridge>/config.yaml (docs/BRIDGES.md step 3).
// Safe to run more than once. Each config is backed up to config.yaml.bak first.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [server, user] = process.argv.slice(2);
if (!server || !user) {
  console.error('Usage: node configure.mjs <server-name> <your-username>   e.g. node configure.mjs home.local brian');
  process.exit(1);
}
const admin = `@${user.replace(/^@/, '').split(':')[0]}:${server}`;
const BRIDGES = ['whatsapp', 'signal', 'gmessages'];

/** Sets `section.key` (4-space indented key under a top-level section). Returns true if found. */
export function setKey(lines, section, key, value) {
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const top = /^([A-Za-z_]+):/.exec(lines[i]);
    if (top) inSection = top[1] === section;
    else if (inSection) {
      const m = new RegExp(`^    ${key}:(\\s.*)?$`).exec(lines[i]);
      if (m) {
        lines[i] = `    ${key}: ${value}`;
        return true;
      }
    }
  }
  return false;
}

export function getKey(lines, section, key) {
  let inSection = false;
  for (const l of lines) {
    const top = /^([A-Za-z_]+):/.exec(l);
    if (top) inSection = top[1] === section;
    else if (inSection) {
      const m = new RegExp(`^    ${key}:\\s*(.*?)\\s*(#.*)?$`).exec(l);
      if (m) return m[1];
    }
  }
  return undefined;
}

/** Replaces the entries under bridge.permissions. */
export function setPermissions(lines, perms) {
  let inBridge = false;
  for (let i = 0; i < lines.length; i++) {
    const top = /^([A-Za-z_]+):/.exec(lines[i]);
    if (top) inBridge = top[1] === 'bridge';
    else if (inBridge && /^    permissions:/.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && (/^ {8}/.test(lines[j]) || lines[j].trim() === '' && /^ {8}/.test(lines[j + 1] ?? ''))) j++;
      const entries = Object.entries(perms).map(([k, v]) => `        "${k}": ${v}`);
      lines.splice(i + 1, j - i - 1, ...entries);
      return true;
    }
  }
  return false;
}

/** Copies as_token/hs_token from a bridge's registration.yaml into its config (the bridge refuses to start without them). */
export function syncTokens(configText, registrationText) {
  const lines = configText.split(/\r?\n/);
  for (const k of ['as_token', 'hs_token']) {
    const m = new RegExp(`^${k}:\\s*["']?([^"'\\s]+)`, 'm').exec(registrationText);
    if (m) setKey(lines, 'appservice', k, m[1]);
  }
  return lines.join('\n');
}

export function configure(text, bridge) {
  const lines = text.split(/\r?\n/);
  const port = getKey(lines, 'appservice', 'port');
  const ok = [
    setPermissions(lines, { [server]: 'user', [admin]: 'admin' }),
    setKey(lines, 'database', 'type', 'sqlite3-fk-wal'),
    setKey(lines, 'database', 'uri', 'file:/data/bridge.db?_txlock=immediate'),
    setKey(lines, 'homeserver', 'address', 'http://synapse:8008'),
    setKey(lines, 'homeserver', 'domain', server),
    setKey(lines, 'appservice', 'address', `http://${bridge}:${port}`),
    setKey(lines, 'appservice', 'hostname', '0.0.0.0'),
    setKey(lines, 'encryption', 'allow', 'false')
  ];
  if (!port || ok.includes(false)) throw new Error('config.yaml does not look like a mautrix bridge config');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let missing = 0;
  for (const b of BRIDGES) {
    const file = path.join(here, 'data', b, 'config.yaml');
    if (!existsSync(file)) {
      console.log(`- ${b}: no config yet (${file}). Start it once with: docker compose up ${b}`);
      missing++;
      continue;
    }
    copyFileSync(file, `${file}.bak`);
    let text = configure(readFileSync(file, 'utf8'), b);
    const reg = path.join(here, 'data', b, 'registration.yaml');
    if (existsSync(reg)) text = syncTokens(text, readFileSync(reg, 'utf8'));
    writeFileSync(file, text);
    console.log(`✓ ${b}: configured${existsSync(reg) ? ' (tokens synced from registration.yaml)' : ''}`);
  }

  // Register the bridges with Synapse.
  const hs = path.join(here, 'data', 'synapse', 'homeserver.yaml');
  if (existsSync(hs)) {
    let y = readFileSync(hs, 'utf8');
    if (!/^app_service_config_files:/m.test(y)) {
      y += `\napp_service_config_files:\n${BRIDGES.map((b) => `  - /bridges/${b}/registration.yaml`).join('\n')}\n`;
      writeFileSync(hs, y);
      console.log('✓ synapse: bridges registered in homeserver.yaml');
    } else console.log('✓ synapse: app_service_config_files already present');
  } else {
    console.log(`- synapse: ${hs} not found. Generate it first (docs/BRIDGES.md step 2).`);
  }

  console.log(
    missing
      ? '\nSome bridges had no config yet; start them once, then run this again.'
      : `\nNext: docker compose up -d   (bridges write registration.yaml on start; if synapse complains it is missing, run: docker compose restart synapse)\nThen create your user: docker compose exec synapse register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008 -u ${user} -a`
  );
}
