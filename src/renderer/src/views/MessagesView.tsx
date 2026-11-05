import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatNetwork, ChatSummary, MessagingState } from '../../../shared/types';
import { errMsg, shortDate } from '../util';

const NETWORKS: { id: ChatNetwork | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'signal', label: 'Signal' },
  { id: 'gmessages', label: 'Google Messages' }
];
const NET_COLOR: Record<ChatNetwork, string> = {
  whatsapp: '#1f9d55',
  signal: '#3a76f0',
  gmessages: '#1a73e8',
  matrix: '#6b7280',
  other: '#6b7280'
};
const NET_SHORT: Record<ChatNetwork, string> = { whatsapp: 'WA', signal: 'SG', gmessages: 'GM', matrix: 'MX', other: '··' };

export function MessagesView() {
  const [state, setState] = useState<MessagingState>();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [filter, setFilter] = useState<ChatNetwork | 'all'>('all');
  const [query, setQuery] = useState('');
  const [roomId, setRoomId] = useState<string>();
  const [showBridges, setShowBridges] = useState(false);

  const refresh = useCallback(async () => {
    setState(await window.junction.messaging.state());
    setChats(await window.junction.messaging.chats());
  }, []);

  useEffect(() => {
    void refresh();
    return window.junction.messaging.onChange(() => void refresh());
  }, [refresh]);

  if (!state) return null;
  if (!state.configured) return <MatrixLogin onDone={refresh} />;

  const visible = chats.filter(
    (c) => (showBridges ? true : !c.isBridgeBot) && (filter === 'all' || c.network === filter) && c.name.toLowerCase().includes(query.toLowerCase())
  );
  const current = chats.find((c) => c.roomId === roomId);
  const unreadBy = (n: ChatNetwork | 'all') => chats.filter((c) => !c.isBridgeBot && (n === 'all' || c.network === n)).reduce((s, c) => s + (c.unread ? 1 : 0), 0);

  return (
    <div className="messages">
      <aside className="chat-list">
        <div className="chat-list-head">
          <input placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="chips">
            {NETWORKS.map((n) => (
              <button key={n.id} className={`chip ${filter === n.id ? 'active' : ''}`} onClick={() => setFilter(n.id)}>
                {n.label}
                {unreadBy(n.id) > 0 && <span className="badge">{unreadBy(n.id)}</span>}
              </button>
            ))}
          </div>
          <div className={`conn ${state.connected ? 'ok' : 'bad'}`}>
            {state.connected ? `Connected as ${state.userId}` : `Reconnecting… ${state.error ?? ''}`}
          </div>
        </div>
        <div className="chat-scroll">
          {visible.map((c) => (
            <button key={c.roomId} className={`chat-row ${c.roomId === roomId ? 'selected' : ''}`} onClick={() => setRoomId(c.roomId)}>
              <span className="avatar" style={{ background: NET_COLOR[c.network] }}>
                {c.name.slice(0, 1).toUpperCase()}
                <span className="net-badge" title={c.network}>
                  {NET_SHORT[c.network]}
                </span>
              </span>
              <span className="chat-main">
                <span className="msg-top">
                  <span className={`ellipsis ${c.unread ? 'strong' : ''}`}>{c.name}</span>
                  <span className="date">{c.lastTs ? shortDate(new Date(c.lastTs).toISOString()) : ''}</span>
                </span>
                <span className="msg-snippet ellipsis">{c.lastMessage ?? ''}</span>
              </span>
              {c.unread > 0 && <span className="badge">{c.unread}</span>}
            </button>
          ))}
          {!visible.length && <div className="muted pad">No chats yet. Connect a network below.</div>}
        </div>
        <BridgePanel showBridges={showBridges} setShowBridges={setShowBridges} onOpen={setRoomId} />
      </aside>
      <section className="chat-pane">{current ? <ChatPane chat={current} /> : <div className="muted center">Select a conversation</div>}</section>
    </div>
  );
}

function BridgePanel({ showBridges, setShowBridges, onOpen }: { showBridges: boolean; setShowBridges: (b: boolean) => void; onOpen: (roomId: string) => void }) {
  const [err, setErr] = useState<string>();
  const connect = async (n: 'whatsapp' | 'signal' | 'gmessages') => {
    setErr(undefined);
    try {
      onOpen(await window.junction.messaging.connectBridge(n));
      setShowBridges(true);
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <div className="bridge-panel">
      <div className="small muted">Connect a network (scan the QR code the bridge sends with your phone):</div>
      <div className="chips">
        <button className="chip" onClick={() => void connect('whatsapp')}>
          + WhatsApp
        </button>
        <button className="chip" onClick={() => void connect('signal')}>
          + Signal
        </button>
        <button className="chip" onClick={() => void connect('gmessages')}>
          + Google Messages
        </button>
      </div>
      <label className="check-row small">
        <input type="checkbox" checked={showBridges} onChange={(e) => setShowBridges(e.target.checked)} /> Show bridge control chats
      </label>
      {err && <div className="banner error small">{err}</div>}
    </div>
  );
}

function ChatPane({ chat }: { chat: ChatSummary }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string>();
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setMsgs([...(await window.junction.messaging.messages(chat.roomId))]);
  }, [chat.roomId]);

  useEffect(() => {
    void load();
    void window.junction.messaging.markRead(chat.roomId).catch(() => undefined);
    return window.junction.messaging.onChange(() => void load());
  }, [load, chat.roomId]);

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [msgs.length]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await window.junction.messaging.send(chat.roomId, t);
    } catch (e) {
      setErr(errMsg(e));
      setText(t);
    }
  };

  return (
    <>
      <header className="chat-header">
        <h2>{chat.name}</h2>
        <span className="net-pill" style={{ background: NET_COLOR[chat.network] }}>
          {NETWORKS.find((n) => n.id === chat.network)?.label ?? 'Matrix'}
        </span>
      </header>
      <div className="chat-msgs">
        <button className="link small" onClick={() => void window.junction.messaging.backfill(chat.roomId).then((m) => setMsgs([...m]))}>
          Load older messages
        </button>
        {msgs.map((m, i) => {
          const showName = !m.own && msgs[i - 1]?.sender !== m.sender;
          return (
            <div key={m.eventId} className={`bubble-row ${m.own ? 'own' : ''}`}>
              <div className={`bubble ${m.kind}`}>
                {showName && <div className="sender">{m.senderName}</div>}
                {m.kind === 'image' && m.mediaUrl ? <MxImage mxc={m.mediaUrl} alt={m.body} /> : <div className="text">{m.body}</div>}
                <div className="ts">{new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {err && <div className="banner error">{err}</div>}
      <footer className="chat-compose">
        <textarea
          rows={1}
          placeholder={`Message on ${NETWORKS.find((n) => n.id === chat.network)?.label ?? 'Matrix'}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="primary" onClick={() => void send()}>
          Send
        </button>
      </footer>
    </>
  );
}

function MxImage({ mxc, alt }: { mxc: string; alt: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    window.junction.messaging.media(mxc).then(setSrc, () => setSrc(undefined));
  }, [mxc]);
  return src ? <img className="chat-img" src={src} alt={alt} /> : <div className="muted small">[image]</div>;
}

function MatrixLogin({ onDone }: { onDone: () => void }) {
  const [hs, setHs] = useState('http://localhost:8008');
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="empty-state">
      <h2>Messaging</h2>
      <p>
        WhatsApp, Signal and Google Messages are connected through Matrix bridges (mautrix) that run on a small server you control, such as Docker on this PC or a
        home server. See <code>docs/BRIDGES.md</code> for the one-command setup. Then sign in to that server here.
      </p>
      <div className="form narrow">
        <label>
          Homeserver URL
          <input value={hs} onChange={(e) => setHs(e.target.value)} />
        </label>
        <label>
          Username
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="brian" />
        </label>
        <label>
          Password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <div className="banner error">{err}</div>}
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(undefined);
            try {
              await window.junction.messaging.login(hs, user, pw);
              onDone();
            } catch (e) {
              setErr(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
