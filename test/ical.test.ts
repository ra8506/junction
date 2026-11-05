import { describe, expect, it } from 'vitest';
import { buildICalEvent, parseICalEvents } from '../src/main/ical';

const ctx = { accountId: 'acc', calendarId: 'cal' };

describe('iCalendar', () => {
  it('parses a single timed event in range', () => {
    const ics = buildICalEvent({ uid: 'u1', title: 'Lunch', start: '2026-11-10T17:00:00Z', end: '2026-11-10T18:00:00Z', allDay: false, location: 'Cafe' });
    const evs = parseICalEvents(ics, ctx, new Date('2026-11-09'), new Date('2026-11-16'));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ title: 'Lunch', location: 'Cafe', allDay: false, start: '2026-11-10T17:00:00.000Z' });
  });

  it('skips events outside the range', () => {
    const ics = buildICalEvent({ uid: 'u1', title: 'Old', start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z', allDay: false });
    expect(parseICalEvents(ics, ctx, new Date('2026-11-09'), new Date('2026-11-16'))).toHaveLength(0);
  });

  it('handles all-day events as dates', () => {
    const ics = buildICalEvent({ uid: 'u2', title: 'Holiday', start: '2026-11-11', end: '2026-11-12', allDay: true });
    const [e] = parseICalEvents(ics, ctx, new Date('2026-11-09'), new Date('2026-11-16'));
    expect(e).toMatchObject({ allDay: true, start: '2026-11-11', end: '2026-11-12' });
  });

  it('expands weekly recurrences and applies an override', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//EN',
      'BEGIN:VEVENT', 'UID:r1', 'DTSTAMP:20260101T000000Z', 'DTSTART:20261102T150000Z', 'DTEND:20261102T153000Z', 'RRULE:FREQ=WEEKLY;COUNT=10', 'SUMMARY:Standup', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:r1', 'DTSTAMP:20260101T000000Z', 'RECURRENCE-ID:20261109T150000Z', 'DTSTART:20261109T160000Z', 'DTEND:20261109T163000Z', 'SUMMARY:Standup (moved)', 'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    const evs = parseICalEvents(ics, ctx, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-23T00:00:00Z'));
    expect(evs.map((e) => [e.title, e.start])).toEqual([
      ['Standup', '2026-11-02T15:00:00.000Z'],
      ['Standup (moved)', '2026-11-09T16:00:00.000Z'],
      ['Standup', '2026-11-16T15:00:00.000Z']
    ]);
  });
});
