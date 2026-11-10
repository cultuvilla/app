import { describe, expect, it } from 'vitest';
import {
  addedBlackouts,
  buildCosaData,
  checkReservaSlot,
  CosaDataSchema,
  DEFAULT_RESERVA_CONFIG,
  isActiveReserva,
  isAwaitingAnswer,
  reservaBookableDays,
  reservaDaySlots,
  reservaReminderWindow,
  reservaSlotKey,
  reservaWeekday,
  type ReservaConfig,
} from '../../src/models';

const config = (over: Partial<ReservaConfig> = {}): ReservaConfig => ({ ...DEFAULT_RESERVA_CONFIG, ...over });

describe('reservaWeekday', () => {
  it('numbers the week from Monday 1 to Sunday 7', () => {
    expect(reservaWeekday('2026-11-09')).toBe('1');
    expect(reservaWeekday('2026-11-14')).toBe('6');
    expect(reservaWeekday('2026-11-15')).toBe('7');
  });
});

describe('reservaDaySlots', () => {
  it('cuts the day into whole slots that end by closing time, in Madrid time', () => {
    const slots = reservaDaySlots(
      config({ hours: { ...DEFAULT_RESERVA_CONFIG.hours, '4': { opensAt: '18:00', closesAt: '21:00' } }, slotMinutes: 90 }),
      '2026-11-12',
    );
    expect(slots.map((s) => s.time)).toEqual(['18:00', '19:30']);
    // Winter: Madrid is UTC+1.
    expect(slots[0]?.startAt.toISOString()).toBe('2026-11-12T17:00:00.000Z');
    expect(slots[0]?.endAt.toISOString()).toBe('2026-11-12T18:30:00.000Z');
    expect(slots[1]?.key).toBe('2026-11-12T18:30:00.000Z');
  });

  it('follows summer time', () => {
    const slots = reservaDaySlots(config(), '2026-07-02');
    expect(slots[0]?.startAt.toISOString()).toBe('2026-07-02T07:00:00.000Z');
  });

  it('has nothing on a closed weekday or a blackout', () => {
    expect(reservaDaySlots(config({ hours: { ...DEFAULT_RESERVA_CONFIG.hours, '7': null } }), '2026-11-15')).toEqual([]);
    expect(reservaDaySlots(config({ blackouts: ['2026-11-12'] }), '2026-11-12')).toEqual([]);
  });
});

describe('checkReservaSlot', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');

  it('accepts a future slot of the grid within the horizon', () => {
    const check = checkReservaSlot(config(), new Date('2026-11-12T17:00:00.000Z'), now);
    expect(check.ok && check.slot.day).toBe('2026-11-12');
  });

  it('refuses an instant that is not a slot start', () => {
    expect(checkReservaSlot(config(), new Date('2026-11-12T17:30:00.000Z'), now)).toEqual({ ok: false, reason: 'not-a-slot' });
    expect(checkReservaSlot(config({ blackouts: ['2026-11-12'] }), new Date('2026-11-12T17:00:00.000Z'), now)).toEqual({
      ok: false,
      reason: 'not-a-slot',
    });
  });

  it('refuses a slot already started', () => {
    expect(checkReservaSlot(config(), new Date('2026-11-10T09:00:00.000Z'), now)).toEqual({ ok: false, reason: 'past' });
  });

  it('refuses a day past the horizon', () => {
    const c = config({ bookingHorizonDays: 2 });
    expect(checkReservaSlot(c, new Date('2026-11-12T17:00:00.000Z'), now).ok).toBe(true);
    expect(checkReservaSlot(c, new Date('2026-11-13T17:00:00.000Z'), now)).toEqual({ ok: false, reason: 'beyond-horizon' });
  });
});

describe('reservaBookableDays', () => {
  it('runs from today to the horizon inclusive', () => {
    expect(reservaBookableDays({ bookingHorizonDays: 2 }, '2026-11-30')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02']);
  });
});

describe('isActiveReserva', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');
  it('counts a pending or accepted booking still ahead', () => {
    const endAt = new Date('2026-11-10T11:00:00.000Z');
    expect(isActiveReserva({ status: 'accepted', endAt }, now)).toBe(true);
    expect(isActiveReserva({ status: 'pending', endAt }, now)).toBe(true);
    expect(isActiveReserva({ status: 'cancelled', endAt }, now)).toBe(false);
    expect(isActiveReserva({ status: 'accepted', endAt: new Date('2026-11-10T09:00:00.000Z') }, now)).toBe(false);
    expect(isActiveReserva({ status: 'accepted', endAt: null }, now)).toBe(false);
  });
});

describe('addedBlackouts', () => {
  it('returns the newly closed days only', () => {
    expect(addedBlackouts(['2026-11-12'], ['2026-11-14', '2026-11-12', '2026-11-13', '2026-11-13'])).toEqual(['2026-11-13', '2026-11-14']);
    expect(addedBlackouts(['2026-11-12'], [])).toEqual([]);
  });
});

describe('reservaReminderWindow', () => {
  it('covers 30 to 90 minutes out, one hour wide for an hourly run', () => {
    const { from, to } = reservaReminderWindow(new Date('2026-11-10T10:00:00.000Z'));
    expect(from.toISOString()).toBe('2026-11-10T10:30:00.000Z');
    expect(to.toISOString()).toBe('2026-11-10T11:30:00.000Z');
  });
});

describe('reservaSlotKey', () => {
  it('is the ISO instant', () => {
    expect(reservaSlotKey(new Date('2026-11-12T17:00:00.000Z'))).toBe('2026-11-12T17:00:00.000Z');
  });
});

describe('buildCosaData', () => {
  const base = {
    municipalityId: 'm1', orgId: 'o1', audience: 'pueblo' as const, ownerUid: null, ownerName: 'Ayuntamiento',
    title: 'Pista de pádel', category: 'deporte' as const, createdBy: 'u1',
  };

  it('gives a reserva its config with no blackouts, and every other kind none', () => {
    const reserva = buildCosaData({ ...base, kind: 'reserva', reserva: config({ blackouts: ['2026-11-12'], slotMinutes: 90 }) });
    expect(reserva.reserva?.slotMinutes).toBe(90);
    expect(reserva.reserva?.blackouts).toEqual([]);
    expect(CosaDataSchema.parse(reserva).kind).toBe('reserva');
    expect(buildCosaData({ ...base, kind: 'reserva' }).reserva).toEqual(DEFAULT_RESERVA_CONFIG);
    expect(buildCosaData({ ...base, kind: 'prestamo', reserva: config() }).reserva).toBeNull();
  });
});

describe('isAwaitingAnswer', () => {
  const now = new Date('2026-11-12T17:05:00.000Z');
  it('is a pending request, except a booking whose slot has started', () => {
    expect(isAwaitingAnswer({ status: 'pending', cosaKind: 'prestamo', startAt: null }, now)).toBe(true);
    expect(isAwaitingAnswer({ status: 'accepted', cosaKind: 'prestamo', startAt: null }, now)).toBe(false);
    expect(isAwaitingAnswer({ status: 'pending', cosaKind: 'reserva', startAt: new Date('2026-11-12T18:00:00.000Z') }, now)).toBe(true);
    expect(isAwaitingAnswer({ status: 'pending', cosaKind: 'reserva', startAt: new Date('2026-11-12T17:00:00.000Z') }, now)).toBe(false);
  });
});
