/**
 * How long a published Wrapped stays on the village home. Long enough to reach
 * the people who only open the app once a month, short enough that last
 * summer's fiestas are not the first thing a visitor sees in December.
 */
export const WRAPPED_FRESH_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

type Dated = { year: number; rangeEnd: Date; computedAt: Date };

/**
 * The Wrapped the village home should offer right now, or null.
 *
 * Only the newest year is ever offered. Its window opens at whichever came
 * last — the end of the fiestas or the build — so a Wrapped an admin made
 * weeks late still gets its full run. There is no `publishedAt` to count from:
 * publication is at most `AUTO_PUBLISH_GRACE_DAYS` after the build, which is
 * noise against a two-month window.
 */
export function freshWrapped<T extends Dated>(published: readonly T[], now: Date): T | null {
  const newest = published.reduce<T | null>((best, w) => (best === null || w.year > best.year ? w : best), null);
  if (!newest) return null;
  const opened = Math.max(newest.rangeEnd.getTime(), newest.computedAt.getTime());
  return now.getTime() < opened + WRAPPED_FRESH_DAYS * DAY_MS ? newest : null;
}
