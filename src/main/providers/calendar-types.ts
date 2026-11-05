import type { CalEvent, CalendarInfo, NewEventInput } from '../../shared/types';

export interface CalendarProvider {
  listCalendars(): Promise<CalendarInfo[]>;
  listEvents(fromIso: string, toIso: string): Promise<CalEvent[]>;
  createEvent(e: NewEventInput): Promise<CalEvent>;
}
