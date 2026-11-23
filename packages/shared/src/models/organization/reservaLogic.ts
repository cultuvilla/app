import { madridDayKey } from '../event/EventDataModel';
import { madridInstant, type DayKey } from '../municipality/FiestaBlockModel';
import { addDays } from './cuotaStatus';
import type { ReservaConfig, ReservaWeekday } from './CosaDataModel';
import type { CosaRequestData } from './CosaRequestDataModel';

/**
 * A reserva's slots (the pádel court), computed from its one availability
 * config — never stored. Shared by the booking callable (which refuses a slot
 * this does not produce) and the screen (which draws the grid), so the two can
 * never disagree on what a slot is. Every time is Madrid wall time.
 */

export interface ReservaSlot {
  day: DayKey;
  /** `HH:MM`, Madrid. */
  time: string;
  startAt: Date;
  endAt: Date;
  /** The slot's lock id: its start as an ISO instant. */
  key: string;
}

function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The ISO weekday of a Madrid calendar day, `'1'` (Monday) to `'7'` (Sunday). */
export function reservaWeekday(day: DayKey): ReservaWeekday {
  const utcDay = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay();
  return String(utcDay === 0 ? 7 : utcDay) as ReservaWeekday;
}

export function reservaSlotKey(startAt: Date): string {
  return startAt.toISOString();
}

/** The day's slots, in order: none on a closed weekday or a blackout. */
export function reservaDaySlots(config: Pick<ReservaConfig, 'hours' | 'slotMinutes' | 'blackouts'>, day: DayKey): ReservaSlot[] {
  if (config.blackouts.includes(day)) return [];
  const hours = config.hours[reservaWeekday(day)];
  if (!hours) return [];
  const close = toMinutes(hours.closesAt);
  const slots: ReservaSlot[] = [];
  for (let start = toMinutes(hours.opensAt); start + config.slotMinutes <= close; start += config.slotMinutes) {
    const time = toTime(start);
    const startAt = madridInstant(day, time);
    slots.push({ day, time, startAt, endAt: madridInstant(day, toTime(start + config.slotMinutes)), key: reservaSlotKey(startAt) });
  }
  return slots;
}

/** The days a viewer may book, today first: today plus `bookingHorizonDays`. */
export function reservaBookableDays(config: Pick<ReservaConfig, 'bookingHorizonDays'>, today: DayKey): DayKey[] {
  return Array.from({ length: config.bookingHorizonDays + 1 }, (_, i) => addDays(today, i));
}

export type ReservaSlotCheck =
  | { ok: true; slot: ReservaSlot }
  | { ok: false; reason: 'not-a-slot' | 'past' | 'beyond-horizon' };

/** Whether `startAt` is a slot of the grid that can still be booked at `now`. */
export function checkReservaSlot(config: ReservaConfig, startAt: Date, now: Date): ReservaSlotCheck {
  const day = madridDayKey(startAt);
  const slot = reservaDaySlots(config, day).find((s) => s.startAt.getTime() === startAt.getTime());
  if (!slot) return { ok: false, reason: 'not-a-slot' };
  if (slot.startAt.getTime() <= now.getTime()) return { ok: false, reason: 'past' };
  if (day > addDays(madridDayKey(now), config.bookingHorizonDays)) return { ok: false, reason: 'beyond-horizon' };
  return { ok: true, slot };
}

/** A booking still ahead and holding its slot: what `maxActiveReservations` counts. */
export function isActiveReserva(req: Pick<CosaRequestData, 'status' | 'endAt'>, now: Date): boolean {
  return (req.status === 'pending' || req.status === 'accepted') && req.endAt !== null && req.endAt.getTime() > now.getTime();
}

/**
 * Whether a request still waits for its manager's answer: pending, unless it is a
 * booking whose slot has already started — past answering, and declined by the
 * next hourly run (`expireReservaBookings`).
 */
export function isAwaitingAnswer(req: Pick<CosaRequestData, 'status' | 'cosaKind' | 'startAt'>, now: Date): boolean {
  if (req.status !== 'pending') return false;
  return req.cosaKind !== 'reserva' || (req.startAt !== null && req.startAt.getTime() > now.getTime());
}

/** Whether two time ranges share any instant (touching ends do not). */
export function rangesOverlap(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }): boolean {
  return a.startAt.getTime() < b.endAt.getTime() && b.startAt.getTime() < a.endAt.getTime();
}

/** The days a new blackout list closes that the old one did not. */
export function addedBlackouts(before: readonly DayKey[], after: readonly DayKey[]): DayKey[] {
  return [...new Set(after)].filter((d) => !before.includes(d)).sort();
}

/** The window an hourly run reminds: bookings starting 30 to 90 minutes from `now`, so each falls in exactly one run. */
export function reservaReminderWindow(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() + 30 * 60_000), to: new Date(now.getTime() + 90 * 60_000) };
}
