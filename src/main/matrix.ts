// Minimal Matrix client-server API client. Messaging networks are reached through
// mautrix bridges (WhatsApp, Signal, Google Messages) running beside a homeserver;
// this client only speaks standard Matrix, so any bridge setup works, including Beeper's
// self-hosted bridge manager.
import { randomUUID } from 'node:crypto';
import type { BridgeInfo, ChatMessage, ChatSummary, MatrixConfig, MessagingState } from '../shared/types';
import { applyState, newRoom, pushTimeline, summarize, toChatMessage, type MxEvent, type RoomState } from './matrix-state';
import { getSecret, loadConfig, saveConfig, setSecret, deleteSecretsWithPrefix } from './store';

type Listener = () => void;

class MatrixService {
  private cfg?: MatrixConfig;
  private token?: string;
  private since?: string;
  private rooms = new Map<string, RoomState>();
  private running = false;
  private abort?: AbortController;
  private state: MessagingState = { configured: false, connected: false };
  private listeners = new Set<Listener>();
  private bots: BridgeInfo[] = [];

  onChange(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  getState(): MessagingState {
    return this.state;
  }

  private url(path: string) {
    return `${this.cfg!.homeserver.replace(/\/$/, '')}/_matrix/client${path}`;
  }

  private async api<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const res = await fetch(this.url(path), {
      ...init,
      signal,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    const j = (await res.json().catch(() => ({}))) as T & { errcode?: string; error?: string };
    if (!res.ok) throw new Error(j.error ?? `Matrix ${res.status}`);
    return j;
  }

  async init(): Promise<void> {
    const c = await loadConfig();
    this.bots = c.settings.bridgeBots;
    this.cfg = c.matrix;
    this.token = c.matrix ? await getSecret<string>('matrix:token') : undefined;
    this.state = { configured: !!(this.cfg && this.token), connected: false, userId: this.cfg?.userId, homeserver: this.cfg?.homeserver };
    if (this.state.configured) void this.loop();
  }

  async login(homeserver: string, user: string, password: string): Promise<MessagingState> {
    const res = await fetch(`${homeserver.replace(/\/$/, '')}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user },
        password,
        initial_device_display_name: 'Junction for Windows'
      })
    });
    const j = (await res.json()) as { access_token?: string; user_id?: string; error?: string };
    if (!res.ok || !j.access_token) throw new Error(j.error ?? `Login failed (${res.status})`);
    this.cfg = { homeserver, userId: j.user_id! };
    this.token = j.access_token;
    await setSecret('matrix:token', j.access_token);
    await saveConfig((c) => (c.matrix = this.cfg));
    this.rooms.clear();
    this.since = undefined;
    this.state = { configured: true, connected: false, userId: this.cfg.userId, homeserver };
    void this.loop();
    this.emit();
    return this.state;
  }

  async logout(): Promise<void> {
    this.running = false;
    this.abort?.abort();
    if (this.token) await this.api('/v3/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    await deleteSecretsWithPrefix('matrix:');
    await saveConfig((c) => delete c.matrix);
    this.cfg = undefined;
    this.token = undefined;
    this.rooms.clear();
    this.state = { configured: false, connected: false };
    this.emit();
  }

  private async loop(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let backoff = 1000;
    while (this.running && this.cfg && this.token) {
      try {
        this.abort = new AbortController();
        const q = new URLSearchParams({ timeout: '30000' });
        if (this.since) q.set('since', this.since);
        else q.set('filter', JSON.stringify({ room: { timeline: { limit: 30 } } }));
        const r = await this.api<any>(`/v3/sync?${q}`, {}, this.abort.signal); // eslint-disable-line @typescript-eslint/no-explicit-any
        this.ingest(r);
        this.since = r.next_batch;
        backoff = 1000;
        if (!this.state.connected || this.state.error) this.state = { ...this.state, connected: true, error: undefined };
        this.emit();
      } catch (e) {
        if (!this.running) break;
        this.state = { ...this.state, connected: false, error: e instanceof Error ? e.message : String(e) };
        this.emit();
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60_000);
      }
    }
    this.running = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ingest(r: any): void {
    const me = this.cfg!.userId;
    for (const [roomId, data] of Object.entries<any>(r.rooms?.join ?? {})) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const room = this.rooms.get(roomId) ?? newRoom(roomId);
      this.rooms.set(roomId, room);
      if (data.summary?.['m.heroes']) room.heroes = data.summary['m.heroes'];
      for (const ev of (data.state?.events ?? []) as MxEvent[]) applyState(room, ev, this.bots);
      const msgs: ChatMessage[] = [];
      for (const ev of (data.timeline?.events ?? []) as MxEvent[]) {
        if (ev.state_key !== undefined) applyState(room, ev, this.bots);
        const m = toChatMessage(roomId, ev, me, room);
        if (m) msgs.push(m);
      }
      pushTimeline(room, msgs);
      if (data.unread_notifications) room.unread = data.unread_notifications.notification_count ?? 0;
    }
    for (const roomId of Object.keys(r.rooms?.leave ?? {})) this.rooms.delete(roomId);
    // Auto-join invites from bridges (new chats on the phone side show up as invites).
    for (const roomId of Object.keys(r.rooms?.invite ?? {})) {
      void this.api(`/v3/join/${encodeURIComponent(roomId)}`, { method: 'POST', body: '{}' }).catch(() => undefined);
    }
  }

  listChats(): ChatSummary[] {
    const me = this.cfg?.userId ?? '';
    return [...this.rooms.values()].map((r) => summarize(r, me, this.bots)).sort((a, b) => b.lastTs - a.lastTs);
  }

  async getMessages(roomId: string): Promise<ChatMessage[]> {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    if (room.timeline.length < 20) await this.backfill(roomId).catch(() => undefined);
    return room.timeline;
  }

  async backfill(roomId: string): Promise<ChatMessage[]> {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const q = new URLSearchParams({ dir: 'b', limit: '50' });
    const r = await this.api<{ chunk: MxEvent[] }>(`/v3/rooms/${encodeURIComponent(roomId)}/messages?${q}`);
    const msgs = r.chunk.map((ev) => toChatMessage(roomId, ev, this.cfg!.userId, room)).filter((m): m is ChatMessage => !!m);
    pushTimeline(room, msgs.reverse(), true);
    room.timeline.sort((a, b) => a.ts - b.ts);
    return room.timeline;
  }

  async send(roomId: string, text: string): Promise<void> {
    await this.api(`/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${randomUUID()}`, {
      method: 'PUT',
      body: JSON.stringify({ msgtype: 'm.text', body: text })
    });
  }

  async markRead(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    const last = room?.timeline[room.timeline.length - 1];
    if (!room || !last) return;
    room.unread = 0;
    await this.api(`/v3/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(last.eventId)}`, { method: 'POST', body: '{}' });
    this.emit();
  }

  /** Authenticated media download (Matrix 1.11+), returned as a data: URL for <img>. */
  async media(mxc: string): Promise<string> {
    const m = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxc);
    if (!m) throw new Error('Bad media URL');
    const res = await fetch(this.url(`/v1/media/download/${m[1]}/${m[2]}`), { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`Media ${res.status}`);
    const type = res.headers.get('content-type') ?? 'application/octet-stream';
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  }

  /** Opens (or creates) the management chat with a bridge bot and sends "login" so it replies with a QR code / pairing steps. */
  async connectBridge(network: BridgeInfo['network']): Promise<string> {
    if (!this.cfg) throw new Error('Sign in to your Matrix homeserver first');
    const bot = this.bots.find((b) => b.network === network);
    if (!bot) throw new Error('Unknown bridge');
    const server = this.cfg.userId.split(':').slice(1).join(':');
    const botId = bot.botUserId.includes(':') ? bot.botUserId : `${bot.botUserId}:${server}`;
    let roomId = this.listChats().find((c) => c.isBridgeBot && c.network === network)?.roomId;
    if (!roomId) {
      const r = await this.api<{ room_id: string }>('/v3/createRoom', {
        method: 'POST',
        body: JSON.stringify({ is_direct: true, invite: [botId], preset: 'trusted_private_chat' })
      });
      roomId = r.room_id;
      const room = newRoom(roomId);
      room.network = network;
      room.members.set(botId, { membership: 'invite', name: `${bot.label} bridge` });
      this.rooms.set(roomId, room);
      await new Promise((r) => setTimeout(r, 1500)); // give the bot a moment to join
    }
    await this.send(roomId, 'login');
    this.emit();
    return roomId;
  }
}

export const matrix = new MatrixService();
