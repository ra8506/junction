// Generic CalDAV (iCloud, Fastmail, Nextcloud, Zoho, Yahoo ...).
import { createDAVClient, type DAVCalendar } from 'tsdav';
import { randomUUID } from 'node:crypto';
import type { Account, CalEvent, CalendarInfo, NewEventInput } from '../../shared/types';
import { buildICalEvent, parseICalEvents } from '../ical';
import type { CalendarProvider } from './calendar-types';

type DavClient = Awaited<ReturnType<typeof createDAVClient>>;

export class CalDavProvider implements CalendarProvider {
  private client?: DavClient;
  private calendars?: DAVCalendar[];

  constructor(
    private account: Account,
    private password: () => Promise<string>
  ) {}

  private async dav(): Promise<DavClient> {
    if (this.client) return this.client;
    if (!this.account.caldavUrl) throw new Error('CalDAV URL not configured');
    this.client = await createDAVClient({
      serverUrl: this.account.caldavUrl,
      credentials: { username: this.account.username || this.account.email, password: await this.password() },
      authMethod: 'Basic',
      defaultAccountType: 'caldav'
    });
    return this.client;
  }

  private async cals(): Promise<DAVCalendar[]> {
    if (!this.calendars) {
      const all = await (await this.dav()).fetchCalendars();
      this.calendars = all.filter((c) => !c.components || c.components.includes('VEVENT'));
    }
    return this.calendars;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    return (await this.cals()).map((c) => ({
      accountId: this.account.id,
      id: c.url,
      name: typeof c.displayName === 'string' ? c.displayName : 'Calendar',
      color: c.calendarColor?.slice(0, 7),
      readOnly: false
    }));
  }

  async listEvents(fromIso: string, toIso: string): Promise<CalEvent[]> {
    const client = await this.dav();
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const per = await Promise.all(
      (await this.cals()).map(async (cal) => {
        const objs = await client.fetchCalendarObjects({ calendar: cal, timeRange: { start: fromIso, end: toIso }, expand: false });
        return objs.flatMap((o) => {
          try {
            return o.data ? parseICalEvents(o.data, { accountId: this.account.id, calendarId: cal.url, href: o.url }, from, to) : [];
          } catch {
            return []; // skip malformed objects rather than failing the calendar
          }
        });
      })
    );
    return per.flat();
  }

  async createEvent(e: NewEventInput): Promise<CalEvent> {
    const client = await this.dav();
    const cal = (await this.cals()).find((c) => c.url === e.calendarId);
    if (!cal) throw new Error('Calendar not found');
    const uid = randomUUID();
    const filename = `${uid}.ics`;
    const res = await client.createCalendarObject({ calendar: cal, filename, iCalString: buildICalEvent({ uid, ...e }) });
    if (!res.ok) throw new Error(`CalDAV create failed: ${res.status}`);
    return { ...e, id: new URL(filename, cal.url).toString() };
  }
}
