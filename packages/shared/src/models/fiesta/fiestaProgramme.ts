import { madridDayKey, type EventData } from '../event/EventDataModel';
import type { DayKey } from '../municipality/FiestaBlockModel';

/** One day of a programa de fiestas: its Madrid calendar day and that day's events, by start time. */
export interface ProgrammeDay<E> {
  day: DayKey;
  events: E[];
}

/**
 * A fiesta edition's events as a programme: grouped by the Madrid day each
 * starts on, days in order, each day's events by start time (the order the read
 * site shares with the app). A multi-day event is listed on its first day.
 *
 * Pass `today` while the fiestas are on: today and the days still to come
 * come first and the days already gone move to the end, since what people
 * open it for then is what is on now.
 */
export function fiestaProgrammeDays<E extends Pick<EventData, 'startDate'>>(
  events: readonly E[],
  today?: DayKey,
): ProgrammeDay<E>[] {
  const byDay = new Map<DayKey, E[]>();
  for (const e of [...events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) {
    const day = madridDayKey(e.startDate);
    const list = byDay.get(day);
    if (list) list.push(e);
    else byDay.set(day, [e]);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ day, events: list }));
  if (today === undefined) return days;
  return [...days.filter((d) => d.day >= today), ...days.filter((d) => d.day < today)];
}
