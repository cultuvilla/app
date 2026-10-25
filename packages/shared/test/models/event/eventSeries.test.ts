import { describe, it, expect } from 'vitest';
import {
  EventSeriesSchema,
  MAX_SERIES_DAYS,
  firstOfEachSeries,
  grownFeedSize,
  isoWeekday,
  seriesSpanDays,
  weeklyOccurrences,
} from '../../../src/models/event/EventSeriesModel';
import { EventDataSchema, buildEventData } from '../../../src/models/event/EventDataModel';

// Local-time constructors on purpose: occurrences keep the organizer's wall
// clock, so the assertions read hours and weekdays in the same zone.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('isoWeekday', () => {
  it('numbers Monday 1 through Sunday 7', () => {
    expect(isoWeekday(at(2026, 10, 19))).toBe(1); // lunes
    expect(isoWeekday(at(2026, 10, 25))).toBe(7); // domingo
  });
});

describe('weeklyOccurrences', () => {
  it('emits every chosen weekday from the first day through until, inclusive', () => {
    // Tuesday 20 Oct 2026, 18:00–19:30, Tuesdays and Thursdays until Tue 3 Nov.
    const out = weeklyOccurrences(
      { startDate: at(2026, 10, 20, 18), endDate: at(2026, 10, 20, 19, 30) },
      { weekdays: [2, 4], until: at(2026, 11, 3) },
    );
    expect(out.map((o) => o.startDate.getDate())).toEqual([20, 22, 27, 29, 3]);
    for (const o of out) {
      expect(o.startDate.getHours()).toBe(18);
      expect(o.endDate?.getHours()).toBe(19);
      expect(o.endDate?.getMinutes()).toBe(30);
      expect(o.endDate?.getDate()).toBe(o.startDate.getDate());
    }
  });

  it('starts on the next chosen weekday when the first day is not one of them', () => {
    const out = weeklyOccurrences(
      { startDate: at(2026, 10, 20, 10), endDate: null },
      { weekdays: [5], until: at(2026, 11, 1) },
    );
    expect(out.map((o) => o.startDate.getDate())).toEqual([23, 30]);
    expect(out.every((o) => o.endDate === null)).toBe(true);
  });

  it('keeps the wall-clock time across a DST change', () => {
    // Spain leaves summer time on Sunday 25 Oct 2026.
    const out = weeklyOccurrences(
      { startDate: at(2026, 10, 19, 18), endDate: null },
      { weekdays: [1], until: at(2026, 11, 2) },
    );
    expect(out.map((o) => o.startDate.getHours())).toEqual([18, 18, 18]);
  });

  it('never runs past the cap', () => {
    const out = weeklyOccurrences(
      { startDate: at(2026, 1, 1, 9), endDate: null },
      { weekdays: [1, 2, 3, 4, 5, 6, 7], until: at(2028, 1, 1) },
    );
    expect(out).toHaveLength(MAX_SERIES_DAYS + 1);
  });

  it('is empty when until is before the first day', () => {
    expect(
      weeklyOccurrences({ startDate: at(2026, 10, 20, 9), endDate: null }, { weekdays: [2], until: at(2026, 10, 19) }),
    ).toEqual([]);
  });
});

describe('seriesSpanDays', () => {
  it('counts calendar days between the first day and until', () => {
    expect(seriesSpanDays(at(2026, 10, 20, 18), at(2026, 10, 27))).toBe(7);
  });
});

describe('firstOfEachSeries', () => {
  const ev = (id: string, seriesId: string | null) => ({
    id,
    series: seriesId ? { id: seriesId, index: 0, weekdays: [1], until: at(2026, 12, 1) } : null,
  });

  it('keeps one row per series, the first it meets, and every standalone event', () => {
    const rows = [ev('a1', 'a'), ev('x', null), ev('a2', 'a'), ev('b1', 'b'), ev('y', null), ev('b2', 'b')];
    expect(firstOfEachSeries(rows).map((r) => r.id)).toEqual(['a1', 'x', 'b1', 'y']);
  });
});

describe('series on the event model', () => {
  const base = {
    title: 'Yoga',
    description: '',
    startDate: at(2026, 10, 20, 18),
    location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'Plaza' },
    organizerUserIds: ['u'],
    organizerOrgIds: [],
    createdBy: 'u',
    municipalityId: 'm',
    villageName: 'Villa',
    villageSlug: 'villa',
    villageCoordinates: null,
  };

  it('defaults to a standalone event', () => {
    expect(buildEventData(base).series).toBeNull();
  });

  it('carries the series it was given', () => {
    const series = { id: 's', index: 2, weekdays: [2, 4], until: at(2026, 12, 1) };
    expect(buildEventData({ ...base, series }).series).toEqual(series);
  });

  it('reads a doc stored before the field as standalone', () => {
    const { series: _s, ...legacy } = buildEventData(base);
    expect(EventDataSchema.parse(legacy).series).toBeNull();
  });

  it('rejects a weekday outside 1–7 and an empty weekday list', () => {
    expect(() => EventSeriesSchema.parse({ id: 's', index: 0, weekdays: [0], until: new Date() })).toThrow();
    expect(() => EventSeriesSchema.parse({ id: 's', index: 0, weekdays: [], until: new Date() })).toThrow();
  });
});

describe('grownFeedSize', () => {
  const daily = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `d${String(i)}`, series: { id: 'daily', index: i, weekdays: [1], until: new Date() } }));
  const solo = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${String(i)}`, series: null }));
  const opts = { targetCards: 20, max: 400 };

  it('doubles a full page that one series has crowded into too few cards', () => {
    expect(grownFeedSize([...daily(49), ...solo(1)], 50, opts)).toBe(100);
  });

  it('stays put once the page shows enough cards', () => {
    expect(grownFeedSize([...daily(30), ...solo(20)], 50, opts)).toBe(50);
  });

  it('stays put when the page was not full — there is nothing more to read', () => {
    expect(grownFeedSize(daily(30), 50, opts)).toBe(50);
  });

  it('never passes the ceiling', () => {
    expect(grownFeedSize(daily(400), 400, opts)).toBe(400);
    expect(grownFeedSize(daily(300), 300, opts)).toBe(400);
  });
});
