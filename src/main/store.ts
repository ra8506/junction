// Local persistence. Plain config goes in JSON under %APPDATA%/Junction;
// secrets (passwords, OAuth tokens, Matrix token) are encrypted with Electron
// safeStorage, which uses Windows DPAPI bound to the signed-in Windows user.
import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Account, AppSettings, MatrixConfig } from '../shared/types';

interface ConfigFile {
  accounts: Account[];
  matrix?: MatrixConfig;
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  bridgeBots: [
    { network: 'whatsapp', label: 'WhatsApp', botUserId: '@whatsappbot' },
    { network: 'signal', label: 'Signal', botUserId: '@signalbot' },
    { network: 'gmessages', label: 'Google Messages', botUserId: '@gmessagesbot' }
  ]
};

function dir(): string {
  return app.getPath('userData');
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(), file), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  const target = path.join(dir(), file);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

let cache: ConfigFile | undefined;

export async function loadConfig(): Promise<ConfigFile> {
  if (!cache) {
    const c = await readJson<ConfigFile>('config.json', { accounts: [], settings: DEFAULT_SETTINGS });
    c.settings = { ...DEFAULT_SETTINGS, ...c.settings };
    // Env vars let a developer supply OAuth client IDs without touching the UI.
    c.settings.googleClientId ||= process.env.JUNCTION_GOOGLE_CLIENT_ID;
    c.settings.googleClientSecret ||= process.env.JUNCTION_GOOGLE_CLIENT_SECRET;
    c.settings.microsoftClientId ||= process.env.JUNCTION_MS_CLIENT_ID;
    cache = c;
  }
  return cache;
}

export async function saveConfig(update: (c: ConfigFile) => void): Promise<ConfigFile> {
  const c = await loadConfig();
  update(c);
  await writeJson('config.json', c);
  return c;
}

// ---------- secrets ----------

type SecretMap = Record<string, string>; // key -> base64 ciphertext

async function readSecrets(): Promise<SecretMap> {
  return readJson<SecretMap>('secrets.json', {});
}

// Dev/CI only (e.g. headless Linux with no keyring). Never honoured in a packaged build.
const plaintextForTests = () => !app.isPackaged && process.env.JUNCTION_TEST_PLAINTEXT_SECRETS === '1';

export async function setSecret(key: string, value: unknown): Promise<void> {
  const all = await readSecrets();
  if (plaintextForTests()) {
    all[key] = `plain:${JSON.stringify(value)}`;
    await writeJson('secrets.json', all);
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption (DPAPI) is unavailable; refusing to store credentials in plain text.');
  }
  all[key] = safeStorage.encryptString(JSON.stringify(value)).toString('base64');
  await writeJson('secrets.json', all);
}

export async function getSecret<T>(key: string): Promise<T | undefined> {
  const all = await readSecrets();
  const raw = all[key];
  if (!raw) return undefined;
  if (raw.startsWith('plain:')) return plaintextForTests() ? (JSON.parse(raw.slice(6)) as T) : undefined;
  return JSON.parse(safeStorage.decryptString(Buffer.from(raw, 'base64'))) as T;
}

export async function deleteSecretsWithPrefix(prefix: string): Promise<void> {
  const all = await readSecrets();
  for (const k of Object.keys(all)) if (k.startsWith(prefix)) delete all[k];
  await writeJson('secrets.json', all);
}
