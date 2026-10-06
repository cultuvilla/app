import { describe, expect, it } from 'vitest';
import { WRAPPED_FRESH_DAYS, freshWrapped } from '../../src/wrapped/wrappedFreshness';
import { wrappedId, yearOfWrappedId } from '../../src/models/wrapped/WrappedDataModel';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

function row(year: number, rangeEnd: string, computedAt: string) {
  return { year, rangeEnd: at(rangeEnd), computedAt: at(computedAt) };
}

describe('freshWrapped', () => {
  const august = row(2026, '2026-08-31', '2026-09-03');

  it('shows the newest Wrapped while it is recent', () => {
    expect(freshWrapped([august], at('2026-09-20'))).toBe(august);
  });

  it('counts the window from whichever came last: the fiestas or the build', () => {
    const builtLate = row(2026, '2026-08-31', '2026-10-15');
    const justInside = new Date(at('2026-10-15').getTime() + (WRAPPED_FRESH_DAYS - 1) * DAY);
    expect(freshWrapped([builtLate], justInside)).toBe(builtLate);
  });

  it('stops showing it once the window has passed', () => {
    const after = new Date(at('2026-09-03').getTime() + (WRAPPED_FRESH_DAYS + 1) * DAY);
    expect(freshWrapped([august], after)).toBeNull();
  });

  it('only ever offers the newest year', () => {
    const lastYear = row(2025, '2025-08-31', '2026-09-01');
    expect(freshWrapped([lastYear, august], at('2026-09-20'))).toBe(august);
  });

  it('has nothing to offer for no Wrapped', () => {
    expect(freshWrapped([], at('2026-09-20'))).toBeNull();
  });
});

describe('yearOfWrappedId', () => {
  it('reads the year back out of a Wrapped id', () => {
    expect(yearOfWrappedId(wrappedId('mun1', 2026))).toBe(2026);
    expect(yearOfWrappedId(wrappedId('a_b', 2025))).toBe(2025);
  });

  it('rejects anything that is not one', () => {
    expect(yearOfWrappedId('mun1')).toBeNull();
    expect(yearOfWrappedId('mun1_26')).toBeNull();
    expect(yearOfWrappedId(null)).toBeNull();
  });
});
