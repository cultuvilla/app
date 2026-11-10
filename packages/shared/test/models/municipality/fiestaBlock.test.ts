import { describe, it, expect } from 'vitest';
import {
  DayKeySchema,
  madridInstant,
  FiestaBlockSchema,
  buildFiestaBlock,
  fiestaBlockId,
  madridDayRange,
  madridMonth,
  madridYear,
} from '../../../src/models/municipality/FiestaBlockModel';

describe('FiestaBlockSchema', () => {
  it('accepts a name and a month', () => {
    expect(FiestaBlockSchema.parse({ id: 'carmen', name: 'Carmen', month: 8 })).toEqual({
      id: 'carmen',
      name: 'Carmen',
      month: 8,
    });
  });

  it('rejects an empty name and an impossible month', () => {
    expect(FiestaBlockSchema.safeParse({ id: 'x', name: '', month: 8 }).success).toBe(false);
    expect(FiestaBlockSchema.safeParse({ id: 'x', name: 'X', month: 0 }).success).toBe(false);
    expect(FiestaBlockSchema.safeParse({ id: 'x', name: 'X', month: 13 }).success).toBe(false);
    expect(FiestaBlockSchema.safeParse({ id: 'x', name: 'X', month: 7.5 }).success).toBe(false);
  });

  // The profile holds what is true every year; days belong to one year's Wrapped.
  it('drops days a stale writer tries to keep', () => {
    const b = buildFiestaBlock({ id: 'santiago', name: 'Santiago', month: 7 });
    expect(Object.keys(b).sort()).toEqual(['id', 'month', 'name']);
  });
});

describe('fiestaBlockId', () => {
  it('slugifies the name, accent-stripped', () => {
    expect(fiestaBlockId('Fiestas de Agosto', [])).toBe('fiestas-de-agosto');
    expect(fiestaBlockId('San Sebastián', [])).toBe('san-sebastian');
  });

  it('suffixes to stay unique', () => {
    expect(fiestaBlockId('Santiago', ['santiago'])).toBe('santiago-2');
    expect(fiestaBlockId('Santiago', ['santiago', 'santiago-2'])).toBe('santiago-3');
  });

  it('falls back rather than producing an empty id', () => {
    expect(fiestaBlockId('   ', [])).toBe('fiesta');
    expect(fiestaBlockId('!!!', ['fiesta'])).toBe('fiesta-2');
  });
});

describe('DayKeySchema', () => {
  it('accepts a real calendar day', () => {
    expect(DayKeySchema.safeParse('2026-08-14').success).toBe(true);
    expect(DayKeySchema.safeParse('2028-02-29').success).toBe(true);
  });

  it('rejects days that do not exist and other formats', () => {
    for (const bad of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-8-14', '14/08/2026', '']) {
      expect(DayKeySchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('madridDayRange', () => {
  it('spans whole Madrid days, first to last inclusive', () => {
    const r = madridDayRange('2026-08-14', '2026-08-28');
    expect(r.start.toISOString()).toBe('2026-08-13T22:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-08-28T21:59:59.999Z');
  });

  it('covers a single day', () => {
    const r = madridDayRange('2026-07-25', '2026-07-25');
    expect(r.end.getTime() - r.start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  // 25 October 2026 is 25 hours long in Madrid; a range across it must not end an hour early.
  it('stays whole across a DST change', () => {
    const r = madridDayRange('2026-10-24', '2026-10-26');
    expect(r.start.toISOString()).toBe('2026-10-23T22:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-26T22:59:59.999Z');
  });

  it('crosses a month and a year end', () => {
    expect(madridDayRange('2026-12-30', '2026-12-31').end.toISOString()).toBe('2026-12-31T22:59:59.999Z');
  });
});

describe('madridYear / madridMonth', () => {
  it('reads the Madrid calendar, not UTC', () => {
    // 23:30 UTC on 31 December is already New Year in Madrid.
    expect(madridYear(new Date('2026-12-31T23:30:00Z'))).toBe(2027);
    expect(madridMonth(new Date('2026-12-31T23:30:00Z'))).toBe(1);
    expect(madridYear(new Date('2026-12-31T22:59:59Z'))).toBe(2026);
    expect(madridMonth(new Date('2026-08-31T22:30:00Z'))).toBe(9);
  });
});

describe('madridInstant on the days the clocks change', () => {
  // Spain enters summer time on Sunday 29 Mar 2026 (02:00 CET → 03:00 CEST, at 01:00Z)
  // and leaves it on Sunday 25 Oct 2026 (03:00 CEST → 02:00 CET, at 01:00Z).
  it('keeps the hours before the spring change on winter time', () => {
    expect(madridInstant('2026-03-29', '00:00').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(madridInstant('2026-03-29', '01:00').toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(madridInstant('2026-03-29', '01:30').toISOString()).toBe('2026-03-29T00:30:00.000Z');
  });

  it('maps a wall time the spring change skips forward', () => {
    expect(madridInstant('2026-03-29', '02:30').toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(madridInstant('2026-03-29', '03:00').toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('takes the first of the two autumn occurrences', () => {
    expect(madridInstant('2026-10-25', '01:00').toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(madridInstant('2026-10-25', '02:30').toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(madridInstant('2026-10-25', '03:00').toISOString()).toBe('2026-10-25T02:00:00.000Z');
  });
});
