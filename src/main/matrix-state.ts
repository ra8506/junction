// Pure reducer that turns Matrix /sync responses into the chat list the UI shows.
// Kept free of I/O so it can be unit tested.
import type { BridgeInfo, ChatMessage, ChatNetwork, ChatSummary } from '../shared/types';

export interface MxEvent {
  type: string;
  event_id?: string;
  sender: string;
  origin_server_ts?: number;
  state_key?: string;
  content: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface RoomState {
  roomId: string;
  name?: string;
  heroes: string[];
  members: Map<string, { name?: string; membership: string; avatar?: string }>;
  avatar?: string;
  network: ChatNetwork;
  timeline: ChatMessage[];
  unread: number;
  isDirect: boolean;
}

const MAX_TIMELINE = 200;

/** mautrix bridges announce themselves with an m.bridge (or legacy uk.half-shot.bridge) state event. */
export function networkFromProtocol(id?: string): ChatNetwork {
  if (!id) return 'matrix';
  const p = id.toLowerCase();
  if (p.includes('whatsapp')) return 'whatsapp';
  if (p.includes('signal')) return 'signal';
  if (p.includes('gmessages') || p.includes('googlemessages') || p === 'gm') return 'gmessages';
  return 'other';
}

export function botNetwork(userId: string, bots: BridgeInfo[]): ChatNetwork | undefined {
  const local = userId.split(':')[0];
  return bots.find((b) => b.botUserId.split(':')[0] === local)?.network;
}

export function newRoom(roomId: string): RoomState {
  return { roomId, heroes: [], members: new Map(), network: 'matrix', timeline: [], unread: 0, isDirect: false };
}

export function applyState(room: RoomState, ev: MxEvent, bots: BridgeInfo[]): void {
  switch (ev.type) {
    case 'm.room.name':
      room.name = ev.content.name || undefined;
      break;
    case 'm.room.avatar':
      room.avatar = ev.content.url || undefined;
      break;
    case 'm.room.member':
      if (ev.state_key) {
        room.members.set(ev.state_key, { name: ev.content.displayname, membership: ev.content.membership, avatar: ev.content.avatar_url });
        const n = botNetwork(ev.state_key, bots);
        if (n && room.network === 'matrix') room.network = n;
      }
      break;
    case 'm.bridge':
    case 'uk.half-shot.bridge':
      room.network = networkFromProtocol(ev.content?.protocol?.id);
      break;
  }
}

export function toChatMessage(roomId: string, ev: MxEvent, me: string, room?: RoomState): ChatMessage | undefined {
  if (ev.type !== 'm.room.message' && ev.type !== 'm.room.encrypted' && ev.type !== 'm.sticker') return undefined;
  if (ev.content?.['m.relates_to']?.rel_type === 'm.replace') return undefined; // edits: keep MVP simple
  const c = ev.content ?? {};
  let kind: ChatMessage['kind'] = 'other';
  let body = typeof c.body === 'string' ? c.body : '';
  if (ev.type === 'm.room.encrypted') {
    body = 'Encrypted message (turn off end-to-bridge encryption, see docs/BRIDGES.md)';
  } else if (ev.type === 'm.sticker' || c.msgtype === 'm.image') kind = 'image';
  else if (c.msgtype === 'm.text' || c.msgtype === 'm.emote') kind = 'text';
  else if (c.msgtype === 'm.notice') kind = 'notice';
  else if (['m.file', 'm.video', 'm.audio'].includes(c.msgtype)) kind = 'file';
  if (!c.msgtype && ev.type === 'm.room.message') return undefined; // redacted
  return {
    eventId: ev.event_id ?? '',
    roomId,
    sender: ev.sender,
    senderName: room?.members.get(ev.sender)?.name ?? ev.sender,
    ts: ev.origin_server_ts ?? 0,
    own: ev.sender === me,
    kind,
    body,
    mediaUrl: typeof c.url === 'string' ? c.url : undefined
  };
}

export function pushTimeline(room: RoomState, msgs: ChatMessage[], prepend = false): void {
  const seen = new Set(room.timeline.map((m) => m.eventId));
  const fresh = msgs.filter((m) => !seen.has(m.eventId));
  room.timeline = prepend ? [...fresh, ...room.timeline] : [...room.timeline, ...fresh];
  if (!prepend && room.timeline.length > MAX_TIMELINE) room.timeline = room.timeline.slice(-MAX_TIMELINE);
}

export function displayName(room: RoomState, me: string): string {
  if (room.name) return room.name;
  const others = (room.heroes.length ? room.heroes : [...room.members.keys()]).filter((u) => u !== me);
  const names = others.map((u) => room.members.get(u)?.name ?? u);
  return names.slice(0, 3).join(', ') || 'Empty chat';
}

export function summarize(room: RoomState, me: string, bots: BridgeInfo[]): ChatSummary {
  const last = room.timeline[room.timeline.length - 1];
  const joined = [...room.members.entries()].filter(([u, m]) => u !== me && m.membership === 'join').map(([u]) => u);
  const isBridgeBot = joined.length === 1 && !!botNetwork(joined[0], bots);
  return {
    roomId: room.roomId,
    name: displayName(room, me),
    network: room.network,
    avatarUrl: room.avatar,
    lastMessage: last ? (last.own ? `You: ${last.body}` : last.body) : undefined,
    lastTs: last?.ts ?? 0,
    unread: room.unread,
    isBridgeBot
  };
}
