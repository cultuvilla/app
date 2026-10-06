import { describe, expect, it } from 'vitest';
import {
  MOVEMENT_MIN_INTERACTIONS,
  MOVEMENT_WINDOW_DAYS,
  fiestaMovement,
  type MovementEvent,
} from '../../src/wrapped/fiestaMovement';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const NOW = at('2026-09-10');

function event(day: string, overrides: Partial<MovementEvent> = {}): MovementEvent {
  return { startDate: at(day), status: 'completed', visibility: 'public', confirmedCount: 5, commentCount: 1, ...overrides };
}

const AUGUST = [{ id: 'agosto', name: 'Fiestas de agosto', month: 8 }];

describe('fiestaMovement', () => {
  it('finds movement when recent events drew people in', () => {
    expect(fiestaMovement([event('2026-08-14'), event('2026-08-15')], [], NOW)).toEqual({
      year: 2026,
      eventCount: 2,
      signupCount: 10,
      commentCount: 2,
    });
  });

  it('needs more than one event', () => {
    expect(fiestaMovement([event('2026-08-14', { confirmedCount: 40 })], [], NOW)).toBeNull();
  });

  it('needs people to have responded, not just events on the calendar', () => {
    const quiet = { confirmedCount: 1, commentCount: 0 };
    expect(fiestaMovement([event('2026-08-14', quiet), event('2026-08-15', quiet)], [], NOW)).toBeNull();
    const justEnough = { confirmedCount: MOVEMENT_MIN_INTERACTIONS / 2, commentCount: 0 };
    expect(fiestaMovement([event('2026-08-14', justEnough), event('2026-08-15', justEnough)], [], NOW)).not.toBeNull();
  });

  it('counts comments as a response too', () => {
    const talked = { confirmedCount: 0, commentCount: 5 };
    expect(fiestaMovement([event('2026-08-14', talked), event('2026-08-15', talked)], [], NOW)?.commentCount).toBe(10);
  });

  it('ignores events that have not started, are too old, private or cancelled', () => {
    const old = new Date(NOW.getTime() - (MOVEMENT_WINDOW_DAYS + 1) * DAY);
    const ignored = [
      event('2026-09-20'),
      { ...event('2026-08-14'), startDate: old },
      event('2026-08-14', { visibility: 'organization' }),
      event('2026-08-14', { status: 'cancelled' }),
    ];
    expect(fiestaMovement([...ignored, event('2026-08-15')], [], NOW)).toBeNull();
  });

  it('counts only the fiestas months once the village has declared them', () => {
    const september = [event('2026-09-01'), event('2026-09-02')];
    expect(fiestaMovement(september, AUGUST, NOW)).toBeNull();
    expect(fiestaMovement([...september, event('2026-08-14'), event('2026-08-15')], AUGUST, NOW)?.eventCount).toBe(2);
  });

  it('names the year of the latest fiestas and counts only that year', () => {
    const january = at('2027-01-10');
    const movement = fiestaMovement(
      [event('2026-12-27'), event('2026-12-28'), event('2027-01-06'), event('2027-01-07')],
      [],
      january,
    );
    expect(movement).toMatchObject({ year: 2027, eventCount: 2 });
  });
});
