import { describe, expect, it } from 'vitest';
import { gather, mailKey, sortEvents, sortMailNewestFirst } from '../src/shared/unify';
import type { MailSummary } from '../src/shared/types';

const m = (accountId: string, id: string, date: string): MailSummary => ({
  accountId, folder: 'INBOX', id, date, from: { address: 'a@b.c' }, to: [], subject: id, snippet: '', unread: false, flagged: false
});

describe('unified views', () => {
  it('merges accounts and keeps going when one fails', async () => {
    const r = await gather(['ok', 'bad'], async (id) => {
      if (id === 'bad') throw new Error('auth failed');
      return [m(id, '1', '2026-01-01T00:00:00Z')];
    });
    expect(r.items).toHaveLength(1);
    expect(r.errors).toEqual([{ accountId: 'bad', message: 'auth failed' }]);
  });

  it('sorts mail newest first across accounts', () => {
    const out = sortMailNewestFirst([m('a', '1', '2026-01-01T00:00:00Z'), m('b', '1', '2026-03-01T00:00:00Z'), m('a', '2', '2026-02-01T00:00:00Z')]);
    expect(out.map(mailKey)).toEqual(['b|INBOX|1', 'a|INBOX|2', 'a|INBOX|1']);
  });

  it('keeps same message id in different accounts distinct', () => {
    expect(mailKey(m('a', '1', ''))).not.toEqual(mailKey(m('b', '1', '')));
  });

  it('sorts events by start', () => {
    const e = (title: string, start: string) => ({ accountId: 'a', calendarId: 'c', id: title, title, start, end: start, allDay: false });
    expect(sortEvents([e('b', '2026-01-02T10:00:00Z'), e('a', '2026-01-01T10:00:00Z')]).map((x) => x.title)).toEqual(['a', 'b']);
  });
});
