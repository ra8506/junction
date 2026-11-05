// Google Calendar REST API v3.
import type { Account, CalEvent, CalendarInfo, NewEventInput } from '../../shared/types';
import type { CalendarProvider } from './calendar-types';
import type { TokenFn } from './graph';

interface GEvent {
  id: string;
  summary?: string;
  location?: string;
  description?: string;
  status?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private account: Account,
    private token: TokenFn
  ) {}

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`Google Calendar: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const r = await this.api<{ items: { id: string; summary: string; backgroundColor?: string; accessRole: string }[] }>(
      '/users/me/calendarList'
    );
    return r.items.map((c) => ({
      accountId: this.account.id,
      id: c.id,
      name: c.summary,
      color: c.backgroundColor,
      readOnly: !['owner', 'writer'].includes(c.accessRole)
    }));
  }

  private map(calendarId: string, e: GEvent): CalEvent {
    const allDay = !!e.start.date;
    return {
      accountId: this.account.id,
      calendarId,
      id: e.id,
      title: e.summary ?? '(no title)',
      start: e.start.dateTime ?? e.start.date!,
      end: e.end.dateTime ?? e.end.date!,
      allDay,
      location: e.location,
      description: e.description
    };
  }

  async listEvents(fromIso: string, toIso: string): Promise<CalEvent[]> {
    const cals = await this.listCalendars();
    const all = await Promise.all(
      cals.map(async (c) => {
        const q = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
        const r = await this.api<{ items: GEvent[] }>(`/calendars/${encodeURIComponent(c.id)}/events?${q}`);
        return r.items.filter((e) => e.status !== 'cancelled').map((e) => this.map(c.id, e));
      })
    );
    return all.flat();
  }

  async createEvent(e: NewEventInput): Promise<CalEvent> {
    const when = (v: string) => (e.allDay ? { date: v.slice(0, 10) } : { dateTime: v });
    const created = await this.api<GEvent>(`/calendars/${encodeURIComponent(e.calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify({ summary: e.title, location: e.location, description: e.description, start: when(e.start), end: when(e.end) })
    });
    return this.map(e.calendarId, created);
  }
}
