// iCalendar parsing/serialising for CalDAV servers (iCloud, Fastmail, Nextcloud, ...).
import ICAL from 'ical.js';
import type { CalEvent } from '../shared/types';

const MAX_OCCURRENCES = 500;

function toIso(t: ICAL.Time): string {
  if (t.isDate) return t.toString().slice(0, 10); // YYYY-MM-DD
  return t.toJSDate().toISOString();
}

/** Parse one iCalendar object and expand recurrences that fall inside [from, to). */
export function parseICalEvents(
  ics: string,
  ctx: { accountId: string; calendarId: string; href?: string },
  from: Date,
  to: Date
): CalEvent[] {
  const comp = new ICAL.Component(ICAL.parse(ics));
  const vevents = comp.getAllSubcomponents('vevent');
  const out: CalEvent[] = [];
  // Overrides (RECURRENCE-ID) are applied via relateException.
  const masters = vevents.filter((v) => !v.hasProperty('recurrence-id')).map((v) => new ICAL.Event(v));
  for (const v of vevents.filter((v) => v.hasProperty('recurrence-id'))) {
    const ex = new ICAL.Event(v);
    const master = masters.find((m) => m.uid === ex.uid);
    if (master) master.relateException(ex);
    else masters.push(ex);
  }

  for (const ev of masters) {
    const base = {
      accountId: ctx.accountId,
      calendarId: ctx.calendarId,
      title: ev.summary || '(no title)',
      location: ev.location || undefined,
      description: ev.description || undefined,
      allDay: ev.startDate.isDate
    };
    if (!ev.isRecurring()) {
      const s = ev.startDate.toJSDate();
      const e = (ev.endDate ?? ev.startDate).toJSDate();
      if (e > from && s < to) {
        out.push({ ...base, id: ctx.href ?? ev.uid, start: toIso(ev.startDate), end: toIso(ev.endDate ?? ev.startDate) });
      }
      continue;
    }
    const it = ev.iterator();
    let next: ICAL.Time | null;
    let n = 0;
    while ((next = it.next()) && n++ < MAX_OCCURRENCES) {
      const jsStart = next.toJSDate();
      if (jsStart >= to) break;
      const occ = ev.getOccurrenceDetails(next);
      if (occ.endDate.toJSDate() <= from) continue;
      out.push({
        ...base,
        title: occ.item.summary || base.title,
        id: `${ctx.href ?? ev.uid}#${next.toString()}`,
        start: toIso(occ.startDate),
        end: toIso(occ.endDate)
      });
    }
  }
  return out;
}

export function buildICalEvent(e: { uid: string; title: string; start: string; end: string; allDay: boolean; location?: string; description?: string }): string {
  const cal = new ICAL.Component(['vcalendar', [], []]);
  cal.updatePropertyWithValue('prodid', '-//Junction//EN');
  cal.updatePropertyWithValue('version', '2.0');
  const v = new ICAL.Component('vevent');
  const ev = new ICAL.Event(v);
  ev.uid = e.uid;
  ev.summary = e.title;
  if (e.location) ev.location = e.location;
  if (e.description) ev.description = e.description;
  const t = (s: string) => (e.allDay ? ICAL.Time.fromDateString(s.slice(0, 10)) : ICAL.Time.fromJSDate(new Date(s), true));
  ev.startDate = t(e.start);
  ev.endDate = t(e.end);
  v.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
  cal.addSubcomponent(v);
  return cal.toString();
}
