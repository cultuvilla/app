import type { EventData } from '../models/event/EventDataModel';
import { madridMonth, madridYear, type FiestaBlock } from '../models/municipality/FiestaBlockModel';

/** How far back the village home looks for fiestas worth summing up. */
export const MOVEMENT_WINDOW_DAYS = 60;
export const MOVEMENT_MIN_EVENTS = 2;
/** Sign-ups plus comments across the counted events. */
export const MOVEMENT_MIN_INTERACTIONS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MovementEvent = Pick<EventData, 'startDate' | 'status' | 'visibility' | 'confirmedCount' | 'commentCount'>;

export interface FiestaMovement {
  year: number;
  eventCount: number;
  signupCount: number;
  commentCount: number;
}

/**
 * Whether a village has had enough recent movement to be worth a fiestas
 * Wrapped — the signal that invites its admins to make one.
 *
 * Measured from the events the village home already holds, so it costs no
 * reads: events that happened in the last `MOVEMENT_WINDOW_DAYS` (within the
 * declared fiestas months, once there are any), and the people who responded
 * to them. Both halves matter — events alone are a calendar, not movement.
 * The counts follow the Wrapped's own rules: public, not cancelled.
 *
 * `confirmedCount` counts registrations, not distinct personas, and
 * `commentCount` is lifetime — fine for a threshold, never for a published
 * figure (those come from `aggregateWrapped`).
 */
export function fiestaMovement(
  events: readonly MovementEvent[],
  fiestas: readonly FiestaBlock[],
  now: Date,
): FiestaMovement | null {
  const since = now.getTime() - MOVEMENT_WINDOW_DAYS * DAY_MS;
  const fiestaMonths = new Set(fiestas.map((b) => b.month));
  const recent = events.filter(
    (e) =>
      e.status !== 'cancelled' &&
      e.visibility === 'public' &&
      e.startDate.getTime() <= now.getTime() &&
      e.startDate.getTime() > since &&
      (fiestaMonths.size === 0 || fiestaMonths.has(madridMonth(e.startDate))),
  );
  if (recent.length === 0) return null;

  // One Wrapped per year: the latest fiestas name it, and an earlier year's
  // tail (December's, seen in January) is not part of it.
  const year = Math.max(...recent.map((e) => madridYear(e.startDate)));
  const counted = recent.filter((e) => madridYear(e.startDate) === year);
  const signupCount = counted.reduce((sum, e) => sum + e.confirmedCount, 0);
  const commentCount = counted.reduce((sum, e) => sum + e.commentCount, 0);

  if (counted.length < MOVEMENT_MIN_EVENTS) return null;
  if (signupCount + commentCount < MOVEMENT_MIN_INTERACTIONS) return null;
  return { year, eventCount: counted.length, signupCount, commentCount };
}
