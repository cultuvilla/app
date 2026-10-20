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
    expect(seriesSummary({ weekdays: [2, 4], until: new Date(2026, 11, 15) }, t)).toBe(
      'event.seriesSummary:martes y jueves|15 de Diciembre',
    );
  });
});
