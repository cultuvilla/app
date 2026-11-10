import { DEFAULT_RESERVA_CONFIG, reservaDaySlots } from '@cultuvilla/shared/models/organization';
import type { CosaRequest } from '@cultuvilla/shared/services/cosatecaService';
import { myUpcomingReservas, parseReservaDraft, reservaDraft, reservaSlotStates } from '../reserva';

describe('reservaSlotStates', () => {
  it('marks a slot free, mine, or taken by someone else', () => {
    const slots = reservaDaySlots({ ...DEFAULT_RESERVA_CONFIG, slotMinutes: 60 }, '2026-11-12').slice(0, 3);
    const [a, b] = slots;
    const states = reservaSlotStates(
      slots,
      [
        { id: a?.key ?? '', requestId: 'r-mine' },
        { id: b?.key ?? '', requestId: 'r-other' },
      ],
      [{ id: 'r-mine' }],
    );
    expect(states.map((s) => s.state)).toEqual(['mine', 'taken', 'free']);
  });
});

describe('myUpcomingReservas', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');
  const booking = (id: string, startAt: string, status: CosaRequest['status'] = 'accepted', cosaId = 'c1') =>
    ({
      id, cosaId, cosaKind: 'reserva', status,
      startAt: new Date(startAt), endAt: new Date(new Date(startAt).getTime() + 3_600_000),
    }) as unknown as CosaRequest;

  it('keeps this cosa’s live bookings, soonest first', () => {
    const rows = [
      booking('later', '2026-11-13T17:00:00.000Z'),
      booking('past', '2026-11-09T17:00:00.000Z'),
      booking('cancelled', '2026-11-12T17:00:00.000Z', 'cancelled'),
      booking('other', '2026-11-12T17:00:00.000Z', 'accepted', 'c2'),
      booking('soon', '2026-11-11T17:00:00.000Z', 'pending'),
    ];
    expect(myUpcomingReservas(rows, 'c1', now).map((r) => r.id)).toEqual(['soon', 'later']);
  });
});

describe('parseReservaDraft', () => {
  it('reads back the config it was drafted from, keeping the closed days as given', () => {
    const parsed = parseReservaDraft(reservaDraft(DEFAULT_RESERVA_CONFIG), ['2026-12-25']);
    expect(parsed).toEqual({ ok: true, config: { ...DEFAULT_RESERVA_CONFIG, blackouts: ['2026-12-25'] } });
  });

  it('closes a weekday that is switched off and normalises typed times', () => {
    const draft = reservaDraft(DEFAULT_RESERVA_CONFIG);
    draft.hours['7'].open = false;
    draft.hours['1'] = { open: true, opensAt: '9.30', closesAt: '21h00' };
    const parsed = parseReservaDraft(draft, []);
    expect(parsed.ok && parsed.config.hours['7']).toBeNull();
    expect(parsed.ok && parsed.config.hours['1']).toEqual({ opensAt: '09:30', closesAt: '21:00' });
  });

  it('says what is wrong', () => {
    const base = reservaDraft(DEFAULT_RESERVA_CONFIG);
    expect(parseReservaDraft({ ...base, hours: { ...base.hours, '2': { open: true, opensAt: 'tarde', closesAt: '22:00' } } }, [])).toEqual({
      ok: false, error: 'time',
    });
    expect(parseReservaDraft({ ...base, hours: { ...base.hours, '2': { open: true, opensAt: '22:00', closesAt: '09:00' } } }, [])).toEqual({
      ok: false, error: 'order',
    });
    expect(parseReservaDraft({ ...base, slotMinutes: '5' }, [])).toEqual({ ok: false, error: 'slotMinutes' });
    expect(parseReservaDraft({ ...base, maxActiveReservations: '0' }, [])).toEqual({ ok: false, error: 'maxActiveReservations' });
    expect(parseReservaDraft({ ...base, bookingHorizonDays: 'mucho' }, [])).toEqual({ ok: false, error: 'bookingHorizonDays' });
  });
});
