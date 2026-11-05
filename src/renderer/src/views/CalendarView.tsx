import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, CalEvent, CalendarInfo } from '../../../shared/types';
import { accountById, errMsg } from '../util';

const HOUR_PX = 48;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** All-day events are YYYY-MM-DD with an exclusive end date. */
function coversDay(e: CalEvent, day: Date): boolean {
  if (e.allDay) {
    const s = new Date(`${e.start.slice(0, 10)}T00:00:00`);
    const en = new Date(`${e.end.slice(0, 10)}T00:00:00`);
    return day >= s && day < (en > s ? en : addDays(s, 1));
  }
  const s = new Date(e.start);
  const en = new Date(e.end);
  return s < addDays(day, 1) && en > day;
}

export function CalendarView({ accounts }: { accounts: Account[] }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [days, setDays] = useState<7 | 1>(7);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [errors, setErrors] = useState<{ accountId: string; message: string }[]>([]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [newEvent, setNewEvent] = useState<{ start: Date } | undefined>();
  const [detail, setDetail] = useState<CalEvent>();
  const scroller = useRef<HTMLDivElement>(null);

  const rangeStart = days === 7 ? weekStart : weekStart;
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(rangeStart, i)), [rangeStart, days]);

  const load = useCallback(async () => {
    try {
      const r = await window.junction.calendar.events(rangeStart.toISOString(), addDays(rangeStart, days).toISOString());
      setEvents(r.items);
      setErrors(r.errors);
    } catch (e) {
      setErrors([{ accountId: '', message: errMsg(e) }]);
    }
  }, [rangeStart, days]);

  useEffect(() => {
    void load();
  }, [load, accounts]);
  useEffect(() => {
    window.junction.calendar.calendars().then((r) => setCalendars(r.items), () => undefined);
  }, [accounts]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX;
  }, []);

  const shown = events.filter((e) => !hidden[e.accountId]);
  const color = (e: CalEvent) => accountById(accounts, e.accountId)?.color ?? '#888';
  const today = new Date();

  const go = (n: number) => setWeekStart((w) => addDays(w, n * days));
  const goToday = () => setWeekStart(days === 7 ? startOfWeek(new Date()) : new Date(new Date().setHours(0, 0, 0, 0)));

  const calAccounts = accounts.filter((a) => a.calendar !== 'none');

  return (
    <div className="calendar">
      <aside className="cal-side">
        <button className="primary" onClick={() => setNewEvent({ start: new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000) })}>
          New event
        </button>
        <div className="folder-group-title">Calendars</div>
        {calAccounts.map((a) => (
          <label key={a.id} className="check-row">
            <input type="checkbox" checked={!hidden[a.id]} onChange={() => setHidden((h) => ({ ...h, [a.id]: !h[a.id] }))} />
            <span className="dot" style={{ background: a.color }} />
            <span className="ellipsis">{a.displayName}</span>
          </label>
        ))}
        {!calAccounts.length && <div className="muted small pad">No calendar accounts yet.</div>}
        {errors.map((e) => (
          <div key={e.accountId} className="banner error small">
            {accountById(accounts, e.accountId)?.displayName ?? 'Calendar'}: {e.message}
          </div>
        ))}
      </aside>

      <section className="cal-main">
        <header className="cal-toolbar">
          <button onClick={goToday}>Today</button>
          <button className="ghost" onClick={() => go(-1)} aria-label="Previous">
            ‹
          </button>
          <button className="ghost" onClick={() => go(1)} aria-label="Next">
            ›
          </button>
          <h2>
            {dayList[0].toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </h2>
          <div className="spacer" />
          <div className="segmented">
            <button className={days === 1 ? 'active' : ''} onClick={() => setDays(1)}>
              Day
            </button>
            <button
              className={days === 7 ? 'active' : ''}
              onClick={() => {
                setDays(7);
                setWeekStart((w) => startOfWeek(w));
              }}
            >
              Week
            </button>
          </div>
        </header>

        <div className="cal-grid-head" style={{ gridTemplateColumns: `56px repeat(${days}, 1fr)` }}>
          <div />
          {dayList.map((d) => (
            <div key={d.toISOString()} className={`cal-day-head ${sameDay(d, today) ? 'today' : ''}`}>
              <span className="muted small">{d.toLocaleDateString([], { weekday: 'short' })}</span>
              <span className="day-num">{d.getDate()}</span>
            </div>
          ))}
          <div className="muted small allday-label">all-day</div>
          {dayList.map((d) => (
            <div key={`ad${d.toISOString()}`} className="allday-cell">
              {shown
                .filter((e) => e.allDay && coversDay(e, d))
                .map((e) => (
                  <div key={e.accountId + e.id} className="allday-ev" style={{ background: color(e) }} onClick={() => setDetail(e)}>
                    {e.title}
                  </div>
                ))}
            </div>
          ))}
        </div>

        <div className="cal-scroll" ref={scroller}>
          <div className="cal-grid" style={{ gridTemplateColumns: `56px repeat(${days}, 1fr)`, height: 24 * HOUR_PX }}>
            <div className="hours">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>
                  {h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}
                </div>
              ))}
            </div>
            {dayList.map((d) => {
              const evs = shown.filter((e) => !e.allDay && coversDay(e, d));
              const lanes = layoutLanes(evs, d);
              return (
                <div
                  key={d.toISOString()}
                  className="day-col"
                  onDoubleClick={(ev) => {
                    const y = ev.clientY - (ev.currentTarget as HTMLElement).getBoundingClientRect().top;
                    const s = new Date(d);
                    s.setMinutes(Math.floor(y / (HOUR_PX / 2)) * 30);
                    setNewEvent({ start: s });
                  }}
                >
                  {sameDay(d, today) && <div className="now-line" style={{ top: (today.getHours() + today.getMinutes() / 60) * HOUR_PX }} />}
                  {lanes.map(({ e, top, height, lane, lanesCount }) => (
                    <div
                      key={e.accountId + e.id}
                      className="event"
                      style={{ top, height, left: `${(lane / lanesCount) * 100}%`, width: `${100 / lanesCount}%`, borderLeftColor: color(e), background: `${color(e)}22` }}
                      onClick={() => setDetail(e)}
                      title={e.title}
                    >
                      <div className="ev-title">{e.title}</div>
                      <div className="ev-time">
                        {new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {e.location ? ` · ${e.location}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(undefined)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{detail.title}</h3>
              <button className="ghost" onClick={() => setDetail(undefined)}>
                ✕
              </button>
            </header>
            <p>
              {detail.allDay
                ? `All day, ${new Date(`${detail.start.slice(0, 10)}T00:00`).toLocaleDateString()}`
                : `${new Date(detail.start).toLocaleString()} – ${new Date(detail.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            </p>
            {detail.location && <p>📍 {detail.location}</p>}
            {detail.description && <pre className="plain-body">{detail.description}</pre>}
            <p className="acct-tag" style={{ color: color(detail) }}>
              {accountById(accounts, detail.accountId)?.displayName} · {calendars.find((c) => c.id === detail.calendarId)?.name}
            </p>
          </div>
        </div>
      )}

      {newEvent && (
        <NewEventDialog
          start={newEvent.start}
          accounts={calAccounts}
          calendars={calendars.filter((c) => !c.readOnly)}
          onClose={() => setNewEvent(undefined)}
          onCreated={() => {
            setNewEvent(undefined);
            void load();
          }}
        />
      )}
    </div>
  );
}

/** Side-by-side layout for overlapping events in a day column. */
function layoutLanes(evs: CalEvent[], day: Date) {
  const dayStart = day.getTime();
  const items = evs
    .map((e) => {
      const s = Math.max(new Date(e.start).getTime(), dayStart);
      const en = Math.min(new Date(e.end).getTime(), dayStart + 86_400_000);
      return { e, s, en };
    })
    .sort((a, b) => a.s - b.s || b.en - a.en);
  const out: { e: CalEvent; top: number; height: number; lane: number; lanesCount: number }[] = [];
  let cluster: typeof out = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const flush = () => {
    cluster.forEach((c) => (c.lanesCount = laneEnds.length));
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const it of items) {
    if (it.s >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= it.s);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = it.en;
    clusterEnd = Math.max(clusterEnd, it.en);
    const top = ((it.s - dayStart) / 3_600_000) * HOUR_PX;
    cluster.push({ e: it.e, top, height: Math.max(20, ((it.en - it.s) / 3_600_000) * HOUR_PX - 2), lane, lanesCount: 1 });
  }
  flush();
  return out;
}

function NewEventDialog({
  start,
  accounts,
  calendars,
  onClose,
  onCreated
}: {
  start: Date;
  accounts: Account[];
  calendars: CalendarInfo[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const accountCals = calendars.filter((c) => c.accountId === accountId);
  const [calendarId, setCalendarId] = useState('');
  const [from, setFrom] = useState(localInput(start));
  const [to, setTo] = useState(localInput(new Date(start.getTime() + 3_600_000)));
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string>();

  const calId = calendarId && accountCals.some((c) => c.id === calendarId) ? calendarId : accountCals[0]?.id;

  const save = async () => {
    if (!title.trim()) return setError('Add a title');
    if (!calId) return setError('This account has no writable calendar');
    try {
      await window.junction.calendar.create({
        accountId,
        calendarId: calId,
        title,
        allDay,
        start: allDay ? from.slice(0, 10) : new Date(from).toISOString(),
        end: allDay ? addDays(new Date(`${to.slice(0, 10)}T00:00`), 1).toISOString().slice(0, 10) : new Date(to).toISOString(),
        location: location || undefined
      });
      onCreated();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="New event" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <header>
          <h3>New event</h3>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>
        <label>
          Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Calendar
          <select value={calId} onChange={(e) => setCalendarId(e.target.value)}>
            {accountCals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        <div className="row2">
          <label>
            Starts
            <input type={allDay ? 'date' : 'datetime-local'} value={allDay ? from.slice(0, 10) : from} onChange={(e) => setFrom(allDay ? `${e.target.value}T00:00` : e.target.value)} />
          </label>
          <label>
            Ends
            <input type={allDay ? 'date' : 'datetime-local'} value={allDay ? to.slice(0, 10) : to} onChange={(e) => setTo(allDay ? `${e.target.value}T00:00` : e.target.value)} />
          </label>
        </div>
        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        {error && <div className="banner error">{error}</div>}
        <footer>
          <span />
          <button className="primary" onClick={() => void save()}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
