import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, MailBody, MailSummary } from '../../../shared/types';
import { mailKey } from '../../../shared/unify';
import type { MailFolder } from '../../../preload/index';
import { accountById, errMsg, shortDate, typingIn } from '../util';
import { Compose, type ComposeSeed } from './Compose';
import { MailBodyView } from './MailBodyView';

const INBOX = 'INBOX';

interface Scope {
  accountId?: string; // undefined = all accounts
  folder: string;
  flaggedOnly?: boolean;
  label: string;
}

export function MailView({ accounts, onAddAccount }: { accounts: Account[]; onAddAccount: () => void }) {
  const [scope, setScope] = useState<Scope>({ folder: INBOX, label: 'All inboxes' });
  const [folders, setFolders] = useState<Record<string, MailFolder[]>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<MailSummary[]>([]);
  const [errors, setErrors] = useState<{ accountId: string; message: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [body, setBody] = useState<MailBody>();
  const [bodyErr, setBodyErr] = useState<string>();
  const [compose, setCompose] = useState<ComposeSeed>();
  const [toast, setToast] = useState<string>();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    for (const a of accounts) {
      window.junction.mail.folders(a.id).then(
        (f) => setFolders((prev) => ({ ...prev, [a.id]: f })),
        () => setFolders((prev) => ({ ...prev, [a.id]: [{ id: INBOX, name: 'Inbox', role: 'inbox' }] }))
      );
    }
  }, [accounts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.junction.mail.list(scope.accountId, scope.folder);
      setItems(r.items);
      setErrors(r.errors);
    } catch (e) {
      setErrors([{ accountId: scope.accountId ?? '', message: errMsg(e) }]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    setSelected(undefined);
    setBody(undefined);
    void load();
  }, [load]);

  const visible = useMemo(() => (scope.flaggedOnly ? items.filter((m) => m.flagged) : items), [items, scope.flaggedOnly]);
  const current = visible.find((m) => mailKey(m) === selected);

  // Open the selected message.
  useEffect(() => {
    if (!current) {
      setBody(undefined);
      return;
    }
    let cancelled = false;
    setBodyErr(undefined);
    window.junction.mail.get(current.accountId, current.folder, current.id).then(
      (b) => {
        if (cancelled) return;
        setBody(b);
        if (current.unread) setItems((xs) => xs.map((x) => (mailKey(x) === selected ? { ...x, unread: false } : x)));
      },
      (e) => !cancelled && setBodyErr(errMsg(e))
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(undefined), 2500);
  };

  const patch = (m: MailSummary, p: Partial<MailSummary>) => {
    const k = mailKey(m);
    setItems((xs) => xs.map((x) => (mailKey(x) === k ? { ...x, ...p } : x)));
    setBody((b) => (b && mailKey(b) === k ? { ...b, ...p } : b));
  };

  const toggleFlag = useCallback(
    async (m: MailSummary) => {
      const next = !m.flagged;
      patch(m, { flagged: next }); // optimistic
      try {
        await window.junction.mail.flag(m.accountId, m.folder, m.id, next);
      } catch (e) {
        patch(m, { flagged: !next });
        flash(`Could not ${next ? 'flag' : 'unflag'}: ${errMsg(e)}`);
      }
    },
    []
  );

  const toggleRead = useCallback(async (m: MailSummary) => {
    const read = m.unread;
    patch(m, { unread: !read });
    try {
      await window.junction.mail.read(m.accountId, m.folder, m.id, read);
    } catch (e) {
      patch(m, { unread: read });
      flash(errMsg(e));
    }
  }, []);

  const move = useCallback(
    (delta: number) => {
      if (!visible.length) return;
      const i = visible.findIndex((m) => mailKey(m) === selected);
      const next = visible[Math.min(visible.length - 1, Math.max(0, i < 0 ? 0 : i + delta))];
      setSelected(mailKey(next));
      listRef.current?.querySelector(`[data-key="${CSS.escape(mailKey(next))}"]`)?.scrollIntoView({ block: 'nearest' });
    },
    [visible, selected]
  );

  const reply = useCallback(() => {
    if (!body) return;
    setCompose({
      accountId: body.accountId,
      to: [body.from.address],
      subject: /^re:/i.test(body.subject) ? body.subject : `Re: ${body.subject}`,
      text: `\n\nOn ${new Date(body.date).toLocaleString()}, ${body.from.name ?? body.from.address} wrote:\n${(body.text ?? '')
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')}`
    });
  }, [body]);

  // Keyboard shortcuts. F = flag/unflag (requested), plus a few standard ones.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (compose || typingIn(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f' && current) {
        e.preventDefault();
        void toggleFlag(current);
      } else if (k === 'u' && current) {
        e.preventDefault();
        void toggleRead(current);
      } else if (k === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (k === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (k === 'r' && body) {
        e.preventDefault();
        reply();
      } else if (k === 'n') {
        e.preventDefault();
        setCompose({ accountId: scope.accountId ?? accounts[0]?.id ?? '' });
      } else if (e.key === 'F5') {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compose, current, body, toggleFlag, toggleRead, move, reply, load, scope.accountId, accounts]);

  if (!accounts.length) {
    return (
      <div className="empty-state">
        <h2>No accounts yet</h2>
        <p>Add Gmail, Microsoft (Outlook, Hotmail, Microsoft 365) or any IMAP account. Each stays separate, and their inboxes also appear together in All inboxes.</p>
        <button className="primary" onClick={onAddAccount}>
          Add an account
        </button>
      </div>
    );
  }

  const isScope = (s: Partial<Scope>) => scope.accountId === s.accountId && scope.folder === s.folder && !!scope.flaggedOnly === !!s.flaggedOnly;

  return (
    <div className="mail">
      <aside className="folders">
        <button className="primary compose-btn" onClick={() => setCompose({ accountId: scope.accountId ?? accounts[0].id })}>
          New message
        </button>
        <div className="folder-group-title">Unified</div>
        <FolderRow active={isScope({ folder: INBOX })} label="All inboxes" onClick={() => setScope({ folder: INBOX, label: 'All inboxes' })} />
        <FolderRow active={isScope({ folder: INBOX, flaggedOnly: true })} label="Flagged" icon="⚑" onClick={() => setScope({ folder: INBOX, flaggedOnly: true, label: 'Flagged' })} />
        {accounts.map((a) => (
          <div key={a.id} className="account-tree">
            <button className="folder-group-title account-title" onClick={() => setCollapsed((c) => ({ ...c, [a.id]: !c[a.id] }))}>
              <span className="dot" style={{ background: a.color }} />
              <span className="ellipsis">{a.displayName}</span>
              <span className="muted small">{collapsed[a.id] ? '▸' : '▾'}</span>
            </button>
            {!collapsed[a.id] &&
              (folders[a.id] ?? [{ id: INBOX, name: 'Inbox' }]).map((f) => (
                <FolderRow key={f.id} indent active={isScope({ accountId: a.id, folder: f.id })} label={f.name} onClick={() => setScope({ accountId: a.id, folder: f.id, label: `${a.displayName} · ${f.name}` })} />
              ))}
          </div>
        ))}
      </aside>

      <section className="list" ref={listRef}>
        <header className="list-header">
          <h2>{scope.label}</h2>
          <button className="ghost" onClick={() => void load()} title="Refresh (F5)">
            {loading ? '…' : '↻'}
          </button>
        </header>
        {errors.map((e) => (
          <div key={e.accountId} className="banner error">
            {accountById(accounts, e.accountId)?.displayName ?? 'Account'}: {e.message}
          </div>
        ))}
        {!loading && !visible.length && <div className="muted pad">Nothing here.</div>}
        {visible.map((m) => {
          const a = accountById(accounts, m.accountId);
          const k = mailKey(m);
          return (
            <div key={k} data-key={k} className={`msg-row ${k === selected ? 'selected' : ''} ${m.unread ? 'unread' : ''}`} onClick={() => setSelected(k)}>
              <span className="acct-bar" style={{ background: a?.color }} title={a?.displayName} />
              <div className="msg-main">
                <div className="msg-top">
                  <span className="from ellipsis">{m.from.name || m.from.address}</span>
                  <span className="date">{shortDate(m.date)}</span>
                </div>
                <div className="msg-subject ellipsis">{m.subject}</div>
                {m.snippet && <div className="msg-snippet ellipsis">{m.snippet}</div>}
                {!scope.accountId && <div className="acct-tag" style={{ color: a?.color }}>{a?.displayName}</div>}
              </div>
              <button
                className={`flag-btn ${m.flagged ? 'on' : ''}`}
                title={m.flagged ? 'Unflag (F)' : 'Flag (F)'}
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleFlag(m);
                }}
              >
                ⚑
              </button>
            </div>
          );
        })}
      </section>

      <section className="reader">
        {!current && <div className="muted center">Select a message. Shortcuts: J/K or arrows to move, F to flag, U for read/unread, R to reply, N for new.</div>}
        {current && bodyErr && <div className="banner error">{bodyErr}</div>}
        {current && body && mailKey(body) === selected && (
          <>
            <header className="reader-header">
              <h1>{body.subject}</h1>
              <div className="reader-meta">
                <div>
                  <strong>{body.from.name ?? body.from.address}</strong> <span className="muted">&lt;{body.from.address}&gt;</span>
                  <div className="muted small">
                    To {body.to.join(', ')}
                    {body.cc.length ? ` · Cc ${body.cc.join(', ')}` : ''} · {new Date(body.date).toLocaleString()}
                  </div>
                </div>
                <div className="reader-actions">
                  <button onClick={reply}>Reply</button>
                  <button className={body.flagged ? 'flag-on' : ''} onClick={() => void toggleFlag(current)}>
                    {body.flagged ? '⚑ Unflag' : '⚑ Flag'}
                  </button>
                </div>
              </div>
              <div className="acct-tag" style={{ color: accountById(accounts, body.accountId)?.color }}>
                {accountById(accounts, body.accountId)?.displayName}
              </div>
            </header>
            <MailBodyView body={body} />
          </>
        )}
      </section>

      {compose && (
        <Compose
          accounts={accounts}
          seed={compose}
          onClose={() => setCompose(undefined)}
          onSent={() => {
            setCompose(undefined);
            flash('Sent');
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function FolderRow({ label, active, onClick, indent, icon }: { label: string; active: boolean; onClick: () => void; indent?: boolean; icon?: string }) {
  return (
    <button className={`folder-row ${active ? 'active' : ''} ${indent ? 'indent' : ''}`} onClick={onClick}>
      {icon && <span className="folder-icon">{icon}</span>}
      <span className="ellipsis">{label}</span>
    </button>
  );
}
