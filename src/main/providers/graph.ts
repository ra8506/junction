// Tiny Microsoft Graph helper (Outlook.com, Hotmail, Microsoft 365).
export type TokenFn = () => Promise<string>;

export async function graph<T>(token: TokenFn, path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.timezone="UTC"',
      ...(init.headers ?? {})
    }
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      msg = j.error?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(`Microsoft Graph: ${msg}`);
  }
  if (res.status === 202 || res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
