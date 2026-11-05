import { describe, expect, it } from 'vitest';
import { applyState, newRoom, networkFromProtocol, pushTimeline, summarize, toChatMessage, type MxEvent } from '../src/main/matrix-state';
import type { BridgeInfo } from '../src/shared/types';

const bots: BridgeInfo[] = [
  { network: 'whatsapp', label: 'WhatsApp', botUserId: '@whatsappbot' },
  { network: 'signal', label: 'Signal', botUserId: '@signalbot' },
  { network: 'gmessages', label: 'Google Messages', botUserId: '@gmessagesbot' }
];
const me = '@brian:home.test';

describe('matrix state', () => {
  it('maps bridge protocol ids to networks', () => {
    expect(networkFromProtocol('whatsapp')).toBe('whatsapp');
    expect(networkFromProtocol('signal')).toBe('signal');
    expect(networkFromProtocol('gmessages')).toBe('gmessages');
    expect(networkFromProtocol(undefined)).toBe('matrix');
  });

  it('labels a portal room from its m.bridge state and names it from members', () => {
    const room = newRoom('!r:home.test');
    const ev = (e: Partial<MxEvent>): MxEvent => ({ sender: '@x:home.test', content: {}, type: 'x', ...e });
    applyState(room, ev({ type: 'm.bridge', state_key: 'b', content: { protocol: { id: 'signal' } } }), bots);
    applyState(room, ev({ type: 'm.room.member', state_key: me, content: { membership: 'join', displayname: 'Brian' } }), bots);
    applyState(room, ev({ type: 'm.room.member', state_key: '@signal_abc:home.test', content: { membership: 'join', displayname: 'Alex (Signal)' } }), bots);
    const msg = toChatMessage(room.roomId, { type: 'm.room.message', event_id: '$1', sender: '@signal_abc:home.test', origin_server_ts: 5, content: { msgtype: 'm.text', body: 'hey' } }, me, room)!;
    pushTimeline(room, [msg]);
    const s = summarize(room, me, bots);
    expect(s).toMatchObject({ network: 'signal', name: 'Alex (Signal)', lastMessage: 'hey', isBridgeBot: false });
  });

  it('detects a bridge bot management room', () => {
    const room = newRoom('!m:home.test');
    applyState(room, { type: 'm.room.member', sender: me, state_key: '@whatsappbot:home.test', content: { membership: 'join' } }, bots);
    const s = summarize(room, me, bots);
    expect(s.isBridgeBot).toBe(true);
    expect(s.network).toBe('whatsapp');
  });

  it('dedupes timeline events and ignores edits', () => {
    const room = newRoom('!r');
    const e = { type: 'm.room.message', event_id: '$a', sender: me, origin_server_ts: 1, content: { msgtype: 'm.text', body: 'x' } };
    pushTimeline(room, [toChatMessage('!r', e, me)!]);
    pushTimeline(room, [toChatMessage('!r', e, me)!]);
    expect(room.timeline).toHaveLength(1);
    expect(toChatMessage('!r', { ...e, content: { msgtype: 'm.text', body: '* y', 'm.relates_to': { rel_type: 'm.replace' } } }, me)).toBeUndefined();
  });
});
