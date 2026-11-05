import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('bridges/configure.mjs', () => {
  it('fills in a mautrix bridgev2 config', async () => {
    process.argv = ['node', 'test', 'home.local', 'brian'];
    const { configure, getKey } = await import('../bridges/configure.mjs');
    const sample = readFileSync(path.join(__dirname, 'fixtures/mautrix-config.yaml'), 'utf8');
    const out = configure(sample, 'whatsapp');
    const lines = out.split('\n');
    expect(getKey(lines, 'homeserver', 'address')).toBe('http://synapse:8008');
    expect(getKey(lines, 'homeserver', 'domain')).toBe('home.local');
    expect(getKey(lines, 'appservice', 'address')).toBe('http://whatsapp:29318');
    expect(getKey(lines, 'appservice', 'hostname')).toBe('0.0.0.0');
    expect(getKey(lines, 'database', 'type')).toBe('sqlite3-fk-wal');
    expect(getKey(lines, 'encryption', 'allow')).toBe('false');
    expect(out).toContain('        "home.local": user\n        "@brian:home.local": admin\n\n# Config for the bridge');
    expect(out).not.toContain('example.com": user');
    // idempotent
    expect(configure(out, 'whatsapp')).toBe(out);
  });
});
