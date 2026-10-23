import { z } from 'zod';

/**
 * Longest a weekly series may run, in calendar days from its first day to its
 * `until`. Every occurrence is a real event doc written in one batch at create
 * time, so the cap bounds that batch (7 × 27 weeks stays far under Firestore's
 * 500 writes) and keeps a forgotten series from filling the pueblo's calendar
 * for years. Re-checked in firestore.rules — keep the two in step.
 */
export const MAX_SERIES_DAYS = 183;

/** ISO weekday: 1 = lunes … 7 = domingo. */
export const IsoWeekdaySchema = z.number().int().min(1).max(7);

/**
 * A weekly recurring event is stored as one ordinary event per occurrence —
 * sign-ups, comments, share links, reminders and completion all stay per day —
 * and every occurrence carries this block, which ties it to its siblings.
 * `index` 0 is the first occurrence: the only one that announces itself to the
 * village. `weekdays` and `until` describe the rule for display; occurrences are
 * never regenerated from them.
 */
export const EventSeriesSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(0),
  weekdays: z.array(IsoWeekdaySchema).min(1).max(7),
  until: z.date(),
});
export type EventSeries = z.infer<typeof EventSeriesSchema>;

export interface WeeklyRule {
  weekdays: number[];
  until: Date;
}

export interface OccurrenceTimes {
  startDate: Date;
  endDate: Date | null;
}

export function isoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function shiftDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Calendar days from `first`'s day to `until`'s day. */
export function seriesSpanDays(first: Date, until: Date): number {
  return Math.round((startOfDay(until).getTime() - startOfDay(first).getTime()) / 86_400_000);
}

/**
 * The occurrences of a weekly rule, from the first event's day through `until`
 * inclusive, capped at MAX_SERIES_DAYS. Days are stepped with `setDate`, so each
 * occurrence keeps the organizer's wall-clock time across a DST change; `endDate`
 * moves by the same number of days as `startDate`.
 */
export function weeklyOccurrences(first: OccurrenceTimes, rule: WeeklyRule): OccurrenceTimes[] {
  const span = Math.min(seriesSpanDays(first.startDate, rule.until), MAX_SERIES_DAYS);
  const days = new Set(rule.weekdays);
  const out: OccurrenceTimes[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const startDate = shiftDays(first.startDate, offset);
    if (!days.has(isoWeekday(startDate))) continue;
    out.push({ startDate, endDate: first.endDate ? shiftDays(first.endDate, offset) : null });
  }
  return out;
}

/**
 * Keeps the first row of each series and every standalone event. Run on a list
 * already in display order, so a calendar shows one card per series — its next
 * date — instead of one per week.
 */
export function firstOfEachSeries<E extends { series: EventSeries | null }>(events: readonly E[]): E[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!e.series) return true;
    if (seen.has(e.series.id)) return false;
    seen.add(e.series.id);
    return true;
  });
}
