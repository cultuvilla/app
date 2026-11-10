import {
  isActiveReserva,
  MAX_RESERVA_ACTIVE,
  MAX_RESERVA_HORIZON_DAYS,
  MAX_RESERVA_SLOT_MINUTES,
  MIN_RESERVA_SLOT_MINUTES,
  RESERVA_WEEKDAYS,
  type ReservaConfig,
  type ReservaSlot,
} from '@cultuvilla/shared/models/organization';
import type { CosaRequest, CosaSlot } from '@cultuvilla/shared/services/cosatecaService';
import { parseIntIn, parseTimeOfDay } from './tasks';

export type ReservaSlotState = 'free' | 'taken' | 'mine';

/** Each slot of a day as the grid draws it: free to book, mine, or taken by someone (never named). */
export function reservaSlotStates(
  slots: readonly ReservaSlot[],
  taken: readonly Pick<CosaSlot, 'id' | 'requestId'>[],
  myBookings: readonly Pick<CosaRequest, 'id'>[],
): { slot: ReservaSlot; state: ReservaSlotState }[] {
  const mine = new Set(myBookings.map((b) => b.id));
  const byKey = new Map(taken.map((s) => [s.id, s.requestId]));
  return slots.map((slot) => {
    const holder = byKey.get(slot.key);
    if (holder === undefined) return { slot, state: 'free' };
    return { slot, state: mine.has(holder) ? 'mine' : 'taken' };
  });
}

/** My bookings of this cosa still ahead, soonest first. */
export function myUpcomingReservas(requests: readonly CosaRequest[], cosaId: string, now: Date): CosaRequest[] {
  return requests
    .filter((r) => r.cosaId === cosaId && r.cosaKind === 'reserva' && isActiveReserva(r, now))
    .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));
}

/** The form's draft: text fields as typed, so a half-typed time is not lost. */
export interface ReservaDraft {
  hours: Record<(typeof RESERVA_WEEKDAYS)[number], { open: boolean; opensAt: string; closesAt: string }>;
  slotMinutes: string;
  requiresApproval: boolean;
  maxActiveReservations: string;
  bookingHorizonDays: string;
}

export function reservaDraft(config: ReservaConfig): ReservaDraft {
  const hours = Object.fromEntries(
    RESERVA_WEEKDAYS.map((d) => {
      const h = config.hours[d];
      return [d, { open: h !== null, opensAt: h?.opensAt ?? '09:00', closesAt: h?.closesAt ?? '22:00' }];
    }),
  ) as ReservaDraft['hours'];
  return {
    hours,
    slotMinutes: String(config.slotMinutes),
    requiresApproval: config.requiresApproval,
    maxActiveReservations: String(config.maxActiveReservations),
    bookingHorizonDays: String(config.bookingHorizonDays),
  };
}

export type ReservaDraftError = 'time' | 'order' | 'slotMinutes' | 'maxActiveReservations' | 'bookingHorizonDays';

/**
 * The config a draft describes, or what is wrong with it. `blackouts` are kept
 * from the cosa as they are: only `setReservaBlackouts` changes them.
 */
export function parseReservaDraft(
  draft: ReservaDraft,
  blackouts: string[],
): { ok: true; config: ReservaConfig } | { ok: false; error: ReservaDraftError } {
  const hours = {} as ReservaConfig['hours'];
  for (const d of RESERVA_WEEKDAYS) {
    const h = draft.hours[d];
    if (!h.open) {
      hours[d] = null;
      continue;
    }
    const opensAt = parseTimeOfDay(h.opensAt);
    const closesAt = parseTimeOfDay(h.closesAt);
    if (!opensAt || !closesAt) return { ok: false, error: 'time' };
    if (opensAt >= closesAt) return { ok: false, error: 'order' };
    hours[d] = { opensAt, closesAt };
  }
  const slotMinutes = parseIntIn(draft.slotMinutes, MIN_RESERVA_SLOT_MINUTES, MAX_RESERVA_SLOT_MINUTES);
  if (slotMinutes === null) return { ok: false, error: 'slotMinutes' };
  const maxActiveReservations = parseIntIn(draft.maxActiveReservations, 1, MAX_RESERVA_ACTIVE);
  if (maxActiveReservations === null) return { ok: false, error: 'maxActiveReservations' };
  const bookingHorizonDays = parseIntIn(draft.bookingHorizonDays, 1, MAX_RESERVA_HORIZON_DAYS);
  if (bookingHorizonDays === null) return { ok: false, error: 'bookingHorizonDays' };
  return {
    ok: true,
    config: { hours, slotMinutes, requiresApproval: draft.requiresApproval, maxActiveReservations, bookingHorizonDays, blackouts },
  };
}
