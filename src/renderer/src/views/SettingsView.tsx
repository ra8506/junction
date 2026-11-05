import { useEffect, useState } from 'react';
import type { Account, AppSettings } from '../../../shared/types';
import { errMsg } from '../util';

type Kind = 'google' | 'microsoft' | 'imap' | 'demo';

const PRESETS: Record<string, { imap: string; smtp: string; caldav?: string }> = {
  'icloud.com': { imap: 'imap.mail.me.com', smtp: 'smtp.mail.me.com', caldav: 'https://caldav.icloud.com/' },
  'me.com': { imap: 'imap.mail.me.com', smtp: 'smtp.mail.me.com', caldav: 'https://caldav.icloud.com/' },
  'fastmail.com': { imap: 'imap.fastmail.com', smtp: 'smtp.fastmail.com', caldav: 'https://caldav.fastmail.com/' },
  'yahoo.com': { imap: 'imap.mail.yahoo.com', smtp: 'smtp.mail.yahoo.com', caldav: 'https://caldav.calendar.yahoo.com/' },
  'zoho.com': { imap: 'imap.zoho.com', smtp: 'smtp.zoho.com', caldav: 'https://calendar.zoho.com/caldav/' }
};

export function SettingsView({ accounts, onChange }: { accounts: Account[]; onChange: () => void }) {
  const [kind, setKind] = useState<Kind>();
  const [settings, setSettings] = useState<AppSettings>();
  const [err, setErr] = useState<string>();

  useEffect(() => {
    void window.junction.settings.get().then(setSettings);
  }, []);

  const addDemo = async () => {
    await window.junction.accounts.add({ displayName: 'Personal', email: 'me@example.net', color: '', mail: 'demo', calendar: 'demo' });
    await window.junction.accounts.add({ displayName: 'Work', email: 'me@contoso.example', color: '', mail: 'demo', calendar: 'demo' });
    onChange();
  };

  return (
    <div className="settings">
      <h1>Accounts</h1>
      <p className="muted">Each account keeps its own folders, calendars and sign-in. Mail and events from all of them also show together in the unified views.</p>
      <div className="account-cards">
        {accounts.map((a) => (
          <AccountCard key={a.id} account={a} onChange={onChange} />
        ))}
      </div>

      <h2>Add account</h2>
      <div className="add-buttons">
        <button onClick={() => setKind('google')}>
          <strong>Gmail / Google Workspace</strong>
          <span className="muted small">Mail and Google Calendar</span>
        </button>
        <button onClick={() => setKind('microsoft')}>
          <strong>Microsoft</strong>
          <span className="muted small">Outlook.com, Hotmail, Microsoft 365</span>
        </button>
        <button onClick={() => setKind('imap')}>
          <strong>Other (IMAP / CalDAV)</strong>
          <span className="muted small">iCloud, Fastmail, Yahoo, your own domain</span>
        </button>
        <button onClick={() => void addDemo()}>
          <strong>Try with sample data</strong>
          <span className="muted small">Adds two demo accounts</span>
        </button>
      </div>
      {err && <div className="banner error">{err}</div>}

      {(kind === 'google' || kind === 'microsoft') && (
        <OAuthDialog
          provider={kind}
          configured={kind === 'google' ? !!settings?.googleClientId : !!settings?.microsoftClientId}
          onClose={() => setKind(undefined)}
          onDone={() => {
            setKind(undefined);
            onChange();
          }}
        />
      )}
      {kind === 'imap' && (
        <ImapDialog
          onClose={() => setKind(undefined)}
          onDone={() => {
            setKind(undefined);
            onChange();
          }}
        />
      )}

      <h2>Sign-in apps</h2>
      <p className="muted small">
        Google and Microsoft sign-in need an app registration you own (free). Steps are in docs/SETUP.md. Values can also come from the JUNCTION_GOOGLE_CLIENT_ID,
        JUNCTION_GOOGLE_CLIENT_SECRET and JUNCTION_MS_CLIENT_ID environment variables.
      </p>
      {settings && (
        <div className="form">
          <label>
            Google OAuth client ID
            <input value={settings.googleClientId ?? ''} onChange={(e) => setSettings({ ...settings, googleClientId: e.target.value })} />
          </label>
          <label>
            Google OAuth client secret (desktop app type)
            <input value={settings.googleClientSecret ?? ''} onChange={(e) => setSettings({ ...settings, googleClientSecret: e.target.value })} />
          </label>
          <label>
            Microsoft application (client) ID
            <input value={settings.microsoftClientId ?? ''} onChange={(e) => setSettings({ ...settings, microsoftClientId: e.target.value })} />
          </label>
          <h3>Messaging bridge bots</h3>
          {settings.bridgeBots.map((b, i) => (
            <label key={b.network}>
              {b.label} bot
              <input
                value={b.botUserId}
                onChange={(e) => {
                  const bridgeBots = [...settings.bridgeBots];
                  bridgeBots[i] = { ...b, botUserId: e.target.value };
                  setSettings({ ...settings, bridgeBots });
                }}
              />
            </label>
          ))}
          <div>
            <button
              className="primary"
              onClick={() =>
                window.junction.settings.set(settings).then(
                  (s) => {
                    setSettings(s);
                    setErr(undefined);
                  },
                  (e) => setErr(errMsg(e))
                )
              }
            >
              Save settings
            </button>
          </div>
          <MessagingAccount />
        </div>
      )}
    </div>
  );
}

function MessagingAccount() {
  const [userId, setUserId] = useState<string>();
  useEffect(() => {
    void window.junction.messaging.state().then((s) => setUserId(s.configured ? s.userId : undefined));
  }, []);
  if (!userId) return null;
  return (
    <p className="small">
      Messaging signed in as <strong>{userId}</strong>.{' '}
      <button className="link" onClick={() => void window.junction.messaging.logout().then(() => setUserId(undefined))}>
        Sign out
      </button>
    </p>
  );
}

function AccountCard({ account: a, onChange }: { account: Account; onChange: () => void }) {
  const [name, setName] = useState(a.displayName);
  const [confirm, setConfirm] = useState(false);
  const kind = { gmail: 'Gmail', microsoft: 'Microsoft', imap: 'IMAP', demo: 'Sample data' }[a.mail];
  return (
    <div className="account-card" style={{ borderLeftColor: a.color }}>
      <div className="account-card-main">
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== a.displayName && void window.junction.accounts.update(a.id, { displayName: name }).then(onChange)}
        />
        <div className="muted small">
          {a.email} · {kind}
          {a.calendar !== 'none' ? ' · calendar' : ''}
        </div>
      </div>
      <input type="color" value={a.color} onChange={(e) => void window.junction.accounts.update(a.id, { color: e.target.value }).then(onChange)} title="Account color" />
      {confirm ? (
        <>
          <button className="danger" onClick={() => void window.junction.accounts.remove(a.id).then(onChange)}>
            Remove
          </button>
          <button className="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button className="ghost" onClick={() => setConfirm(true)}>
          Remove…
        </button>
      )}
    </div>
  );
}

function OAuthDialog({ provider, configured, onClose, onDone }: { provider: 'google' | 'microsoft'; configured: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(provider === 'google' ? 'Gmail' : 'Outlook');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <h3>{provider === 'google' ? 'Add Google account' : 'Add Microsoft account'}</h3>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>
        {!configured && <div className="banner">Add the {provider === 'google' ? 'Google client ID' : 'Microsoft application ID'} under Sign-in apps first.</div>}
        <label>
          Account name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email (optional, pre-fills sign-in)
          <input value={hint} onChange={(e) => setHint(e.target.value)} />
        </label>
        <p className="muted small">Your browser will open to sign in. Junction never sees your password; it stores an encrypted token on this PC.</p>
        {err && <div className="banner error">{err}</div>}
        <footer>
          <span />
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(undefined);
              try {
                await window.junction.accounts.addOAuth(provider, name, hint || undefined);
                onDone();
              } catch (e) {
                setErr(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Waiting for browser…' : 'Sign in'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ImapDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ displayName: '', email: '', username: '', password: '', imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 465, caldavUrl: '' });
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [k]: typeof x[k] === 'number' ? Number(e.target.value) : e.target.value }));

  const autofill = () => {
    const domain = f.email.split('@')[1]?.toLowerCase();
    const p = domain ? PRESETS[domain] : undefined;
    setF((x) => ({
      ...x,
      displayName: x.displayName || domain || '',
      imapHost: x.imapHost || (p ? p.imap : domain ? `imap.${domain}` : ''),
      smtpHost: x.smtpHost || (p ? p.smtp : domain ? `smtp.${domain}` : ''),
      caldavUrl: x.caldavUrl || p?.caldav || ''
    }));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <header>
          <h3>Add IMAP account</h3>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="row2">
          <label>
            Email
            <input value={f.email} onChange={set('email')} onBlur={autofill} />
          </label>
          <label>
            Account name
            <input value={f.displayName} onChange={set('displayName')} />
          </label>
        </div>
        <div className="row2">
          <label>
            Username (if not the email)
            <input value={f.username} onChange={set('username')} />
          </label>
          <label>
            Password or app password
            <input type="password" value={f.password} onChange={set('password')} />
          </label>
        </div>
        <div className="row2">
          <label>
            IMAP server
            <input value={f.imapHost} onChange={set('imapHost')} />
          </label>
          <label>
            Port
            <input type="number" value={f.imapPort} onChange={set('imapPort')} />
          </label>
        </div>
        <div className="row2">
          <label>
            SMTP server
            <input value={f.smtpHost} onChange={set('smtpHost')} />
          </label>
          <label>
            Port
            <input type="number" value={f.smtpPort} onChange={set('smtpPort')} />
          </label>
        </div>
        <label>
          CalDAV URL (optional)
          <input value={f.caldavUrl} onChange={set('caldavUrl')} placeholder="https://caldav.example.com/" />
        </label>
        {err && <div className="banner error">{err}</div>}
        <footer>
          <span />
          <button
            className="primary"
            onClick={async () => {
              try {
                await window.junction.accounts.add({
                  displayName: f.displayName || f.email,
                  email: f.email,
                  username: f.username || undefined,
                  color: '',
                  mail: 'imap',
                  calendar: f.caldavUrl ? 'caldav' : 'none',
                  caldavUrl: f.caldavUrl || undefined,
                  imap: { host: f.imapHost, port: f.imapPort, secure: f.imapPort === 993 },
                  smtp: { host: f.smtpHost, port: f.smtpPort, secure: f.smtpPort === 465 },
                  password: f.password
                });
                onDone();
              } catch (e) {
                setErr(errMsg(e));
              }
            }}
          >
            Add account
          </button>
        </footer>
      </div>
    </div>
  );
}
