import { useState } from 'react';
import type { Account } from '../../../shared/types';
import { errMsg } from '../util';

export interface ComposeSeed {
  accountId: string;
  to?: string[];
  subject?: string;
  text?: string;
}

const splitAddrs = (s: string) =>
  s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function Compose({ accounts, seed, onClose, onSent }: { accounts: Account[]; seed: ComposeSeed; onClose: () => void; onSent: () => void }) {
  const [accountId, setAccountId] = useState(seed.accountId || accounts[0]?.id);
  const [to, setTo] = useState((seed.to ?? []).join(', '));
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(seed.subject ?? '');
  const [text, setText] = useState(seed.text ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const send = async () => {
    if (!splitAddrs(to).length) return setError('Add at least one recipient');
    setSending(true);
    setError(undefined);
    try {
      await window.junction.mail.send({ accountId, to: splitAddrs(to), cc: splitAddrs(cc), subject, text });
      onSent();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="modal compose" role="dialog" aria-label="New message">
        <header>
          <h3>New message</h3>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <label>
          From
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} &lt;{a.email}&gt;
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, …" />
        </label>
        <label>
          Cc
          <input value={cc} onChange={(e) => setCc(e.target.value)} />
        </label>
        <label>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) void send();
          }}
        />
        {error && <div className="banner error">{error}</div>}
        <footer>
          <span className="muted small">Ctrl+Enter to send</span>
          <button className="primary" disabled={sending} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </footer>
      </div>
    </div>
  );
}
