import { seriesSummary, weekdayList } from '../seriesLabel';

const NAMES: Record<string, string> = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes' };
const t = (key: string, values?: Record<string, string>) => {
  const day = /^event\.weekdayLong\.(\d)$/.exec(key);
  if (day) return NAMES[day[1]!]!;
  return values ? `${key}:${Object.values(values).join('|')}` : key;
};

describe('weekdayList', () => {
  it('joins the days in week order, Spanish style', () => {
    expect(weekdayList([1], t)).toBe('lunes');
    expect(weekdayList([4, 2], t)).toBe('martes y jueves');
    expect(weekdayList([5, 1, 3], t)).toBe('lunes, miércoles y viernes');
  });
});

describe('seriesSummary', () => {
  it('names the days and the last date', () => {
    expect(
      seriesSummary({ frequency: 'weekly', weekdays: [2, 4], until: new Date(2026, 11, 15) }, new Date(2026, 10, 3), t),
    ).toBe('event.seriesSummary:martes y jueves|15 de Diciembre');
  });

  it("names a monthly series' day of the month instead of its weekday", () => {
    expect(
      seriesSummary({ frequency: 'monthly', weekdays: [2], until: new Date(2027, 9, 20) }, new Date(2026, 9, 20), t),
    ).toBe('event.seriesSummaryMonthly:20|20 de Octubre');
  });
});
