// In-memory sample data so the app is explorable before any real account is connected.
import type { Account, CalEvent, CalendarInfo, Draft, MailBody, MailSummary, NewEventInput } from '../../shared/types';
import type { CalendarProvider } from './calendar-types';
import { INBOX, type MailFolder, type MailProvider } from './mail-types';

const SAMPLES: Record<string, [string, string, string, string][]> = {
  // [fromName, fromAddr, subject, body]
  personal: [
    ['Sam Rivera', 'sam@example.net', 'Dinner Saturday?', 'Are you free Saturday around 7? Thinking of trying the new place on Main.'],
    ['Airline Notifications', 'noreply@flights.example', 'Your trip confirmation', 'Your flight is confirmed. Check-in opens 24 hours before departure.'],
    ['Library', 'holds@library.example', 'A hold is ready for pickup', 'The book you reserved is ready at the front desk for 7 days.']
  ],
  work: [
    ['Priya Shah', 'priya@contoso.example', 'Q4 planning deck', 'Attached is the draft. Can you review slides 4 to 9 before Thursday?'],
    ['IT Service Desk', 'it@contoso.example', 'Password expires in 5 days', 'Please update your password before it expires to avoid lockout.'],
    ['Jordan Lee', 'jordan@contoso.example', 'Re: vendor contract', 'Legal signed off. We can countersign tomorrow morning.'],
    ['Calendar', 'calendar@contoso.example', 'Invitation: Weekly sync', 'You have been invited to Weekly sync, Mondays 10:00.']
  ]
};

export class DemoMailProvider implements MailProvider {
  private msgs: MailBody[];

  constructor(private account: Account) {
    const set = SAMPLES[account.displayName.toLowerCase()] ?? SAMPLES.personal;
    this.msgs = set.map(([name, address, subject, text], i) => ({
      accountId: account.id,
      folder: INBOX,
      id: String(i + 1),
      from: { name, address },
      to: [account.email],
      cc: [],
      subject,
      text,
      snippet: text.slice(0, 120),
      date: new Date(Date.now() - (i * 5 + (account.displayName.length % 3)) * 3_600_000).toISOString(),
      unread: i < 2,
      flagged: false
    }));
  }

  async listFolders(): Promise<MailFolder[]> {
    return [
      { id: INBOX, name: 'Inbox', role: 'inbox' },
      { id: 'Sent', name: 'Sent', role: 'sent' },
      { id: 'Archive', name: 'Archive', role: 'archive' }
    ];
  }
  async listMessages(folder: string): Promise<MailSummary[]> {
    return this.msgs.filter((m) => m.folder === folder).map(({ html: _h, text: _t, cc: _c, ...s }) => s);
  }
  async getMessage(_folder: string, id: string): Promise<MailBody> {
    const m = this.msgs.find((x) => x.id === id);
    if (!m) throw new Error('Not found');
    return m;
  }
  async setFlagged(_f: string, id: string, flagged: boolean) {
    const m = this.msgs.find((x) => x.id === id);
    if (m) m.flagged = flagged;
  }
  async setRead(_f: string, id: string, read: boolean) {
    const m = this.msgs.find((x) => x.id === id);
    if (m) m.unread = !read;
  }
  async send(d: Draft) {
    this.msgs.push({
      accountId: this.account.id,
      folder: 'Sent',
      id: String(this.msgs.length + 1),
      from: { name: this.account.displayName, address: this.account.email },
      to: d.to,
      cc: d.cc ?? [],
      subject: d.subject,
      text: d.text,
      snippet: d.text.slice(0, 120),
      date: new Date().toISOString(),
      unread: false,
      flagged: false
    });
  }
}

export class DemoCalendarProvider implements CalendarProvider {
  private events: CalEvent[] = [];

  constructor(private account: Account) {
    const day = (offset: number, h: number, m = 0) => {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      d.setDate(d.getDate() + offset);
      return d.toISOString();
    };
    const work = account.displayName.toLowerCase() === 'work';
    const list: [string, number, number, number][] = work
      ? [['Weekly sync', 0, 10, 1], ['1:1 with Priya', 1, 14, 0.5], ['Vendor call', 2, 11, 1], ['Quarterly review', 3, 15, 2]]
      : [['Gym', 0, 7, 1], ['Dinner with Sam', 2, 19, 2], ['Dentist', 4, 9, 1]];
    this.events = list.map(([title, off, h, dur], i) => ({
      accountId: account.id,
      calendarId: 'default',
      id: String(i),
      title,
      start: day(off, h),
      end: new Date(Date.parse(day(off, h)) + dur * 3_600_000).toISOString(),
      allDay: false
    }));
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    return [{ accountId: this.account.id, id: 'default', name: 'Calendar', readOnly: false }];
  }
  async listEvents(from: string, to: string): Promise<CalEvent[]> {
    return this.events.filter((e) => e.end > from && e.start < to);
  }
  async createEvent(e: NewEventInput): Promise<CalEvent> {
    const ev = { ...e, id: String(this.events.length + 1) };
    this.events.push(ev);
    return ev;
  }
}
