// Microsoft calendars via Graph.
import type { Account, CalEvent, CalendarInfo, NewEventInput } from '../../shared/types';
import type { CalendarProvider } from './calendar-types';
import { graph, type TokenFn } from './graph';

interface GEvent {
  id: string;
  subject?: string;
  isAllDay: boolean;
  isCancelled?: boolean;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  bodyPreview?: string;
}

// Graph returns UTC wall-clock without a zone suffix when Prefer: outlook.timezone="UTC".
const utc = (s: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s.replace(/\.\d+$/, '')}Z`);

export class GraphCalendarProvider implements CalendarProvider {
  constructor(
    private account: Account,
    private token: TokenFn
  ) {}

  async listCalendars(): Promise<CalendarInfo[]> {
    const r = await graph<{ value: { id: string; name: string; hexColor?: string; canEdit: boolean }[] }>(
      this.token,
      '/me/calendars?$select=id,name,hexColor,canEdit'
    );
    return r.value.map((c) => ({ accountId: this.account.id, id: c.id, name: c.name, color: c.hexColor || undefined, readOnly: !c.canEdit }));
  }

  private map(calendarId: string, e: GEvent): CalEvent {
    return {
      accountId: this.account.id,
      calendarId,
      id: e.id,
      title: e.subject || '(no title)',
      start: e.isAllDay ? e.start.dateTime.slice(0, 10) : utc(e.start.dateTime),
      end: e.isAllDay ? e.end.dateTime.slice(0, 10) : utc(e.end.dateTime),
      allDay: e.isAllDay,
      location: e.location?.displayName || undefined,
      description: e.bodyPreview
    };
  }

  async listEvents(fromIso: string, toIso: string): Promise<CalEvent[]> {
    const cals = await this.listCalendars();
    const all = await Promise.all(
      cals.map(async (c) => {
        const q = new URLSearchParams({
          startDateTime: fromIso,
          endDateTime: toIso,
          $top: '250',
          $select: 'id,subject,isAllDay,isCancelled,start,end,location,bodyPreview'
        });
        const r = await graph<{ value: GEvent[] }>(this.token, `/me/calendars/${encodeURIComponent(c.id)}/calendarView?${q}`);
        return r.value.filter((e) => !e.isCancelled).map((e) => this.map(c.id, e));
      })
    );
    return all.flat();
  }

  async createEvent(e: NewEventInput): Promise<CalEvent> {
    const dt = (v: string) => ({ dateTime: e.allDay ? `${v.slice(0, 10)}T00:00:00` : new Date(v).toISOString().replace('Z', ''), timeZone: 'UTC' });
    const created = await graph<GEvent>(this.token, `/me/calendars/${encodeURIComponent(e.calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify({
        subject: e.title,
        isAllDay: e.allDay,
        start: dt(e.start),
        end: dt(e.end),
        location: e.location ? { displayName: e.location } : undefined,
        body: e.description ? { contentType: 'text', content: e.description } : undefined
      })
    });
    return this.map(e.calendarId, created);
  }
}
