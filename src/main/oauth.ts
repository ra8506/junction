// OAuth 2.0 for installed apps: system browser + loopback redirect + PKCE.
// This is the flow Google and Microsoft both recommend for desktop clients
// (no embedded webviews, which Google blocks).
import { shell } from 'electron';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { getSecret, loadConfig, setSecret } from './store';

export type OAuthProvider = 'google' | 'microsoft';

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  email?: string;
}

interface ProviderDef {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  extraAuthParams: Record<string, string>;
}

export const PROVIDERS: Record<OAuthProvider, ProviderDef> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // mail.google.com is required for IMAP/SMTP XOAUTH2. It is a "restricted"
    // scope: fine for personal/test users, needs Google verification to publish.
    scopes: ['openid', 'email', 'https://mail.google.com/', 'https://www.googleapis.com/auth/calendar'],
    extraAuthParams: { access_type: 'offline', prompt: 'consent' }
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['openid', 'email', 'offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite'],
    extraAuthParams: { prompt: 'select_account' }
  }
};

async function clientFor(p: OAuthProvider): Promise<{ id: string; secret?: string }> {
  const { settings } = await loadConfig();
  const id = p === 'google' ? settings.googleClientId : settings.microsoftClientId;
  if (!id) {
    throw new Error(
      p === 'google'
        ? 'No Google OAuth client ID configured. Add one in Settings (see docs/SETUP.md).'
        : 'No Microsoft (Entra) application ID configured. Add one in Settings (see docs/SETUP.md).'
    );
  }
  return { id, secret: p === 'google' ? settings.googleClientSecret : undefined };
}

const b64url = (b: Buffer) => b.toString('base64url');

/** Opens the browser, waits for the redirect and returns tokens. */
export async function authorize(provider: OAuthProvider, loginHint?: string): Promise<Tokens> {
  const def = PROVIDERS[provider];
  const client = await clientFor(provider);
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));

  const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const got = url.searchParams.get('code');
      const ok = !err && got && url.searchParams.get('state') === state;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        `<html><body style="font-family:Segoe UI,sans-serif;padding:40px">${
          ok ? 'Signed in. You can close this tab and return to Junction.' : 'Sign-in failed. Return to Junction and try again.'
        }</body></html>`
      );
      clearTimeout(timer);
      server.close();
      if (ok) resolve({ code: got!, redirectUri });
      else reject(new Error(err ?? 'OAuth state mismatch'));
    });
    let redirectUri = '';
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Sign-in timed out'));
    }, 5 * 60_000);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      // Microsoft wants "localhost"; Google accepts either for desktop clients.
      redirectUri = `http://${provider === 'microsoft' ? 'localhost' : '127.0.0.1'}:${port}/callback`;
      const params = new URLSearchParams({
        client_id: client.id,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: def.scopes.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        ...def.extraAuthParams,
        ...(loginHint ? { login_hint: loginHint } : {})
      });
      void shell.openExternal(`${def.authUrl}?${params}`);
    });
  });

  return exchange(provider, {
    grant_type: 'authorization_code',
    code: code.code,
    redirect_uri: code.redirectUri,
    code_verifier: verifier
  });
}

async function exchange(provider: OAuthProvider, body: Record<string, string>): Promise<Tokens> {
  const client = await clientFor(provider);
  const params = new URLSearchParams({ client_id: client.id, ...body });
  if (client.secret) params.set('client_secret', client.secret);
  const res = await fetch(PROVIDERS[provider].tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Token request failed: ${json.error_description ?? json.error ?? res.status}`);
  return {
    accessToken: json.access_token as string,
    refreshToken: (json.refresh_token as string | undefined) ?? body.refresh_token,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
    email: emailFromIdToken(json.id_token as string | undefined)
  };
}

export function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return payload.email ?? payload.preferred_username;
  } catch {
    return undefined;
  }
}

/** Returns a valid access token for an account, refreshing and persisting it when near expiry. */
export async function accessToken(accountId: string, provider: OAuthProvider): Promise<string> {
  const key = `oauth:${accountId}`;
  const t = await getSecret<Tokens>(key);
  if (!t) throw new Error('Account is not signed in');
  if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
  if (!t.refreshToken) throw new Error('Session expired; sign in again');
  const fresh = await exchange(provider, { grant_type: 'refresh_token', refresh_token: t.refreshToken });
  await setSecret(key, { ...t, ...fresh, email: t.email ?? fresh.email });
  return fresh.accessToken;
}
