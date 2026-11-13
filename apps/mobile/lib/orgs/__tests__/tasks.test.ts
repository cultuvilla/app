import { offsetLabel, parseIntIn, parseTimeOfDay, recurrenceLabel, taskWhenLabel } from '../tasks';

const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k);

describe('task labels and inputs', () => {
  it('reads a time of day typed by hand', () => {
    expect(parseTimeOfDay('9:30')).toBe('09:30');
    expect(parseTimeOfDay(' 10.00 ')).toBe('10:00');
    expect(parseTimeOfDay('18h15')).toBe('18:15');
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('mañana')).toBeNull();
  });

  it('reads a whole number in range, a minus included', () => {
    expect(parseIntIn('-60', -730, 730)).toBe(-60);
    expect(parseIntIn('−3', -730, 730)).toBe(-3);
    expect(parseIntIn('2,5', 1, 10)).toBeNull();
    expect(parseIntIn('0', 1, 10)).toBeNull();
  });

  it('labels when, how it repeats and the template offset', () => {
    expect(taskWhenLabel(t, { dueOn: null, time: null })).toBe('groups.tasks.noDate');
    expect(taskWhenLabel(t, { dueOn: '2026-08-14', time: '10:00' })).toMatch(/^groups\.tasks\.dueAt:.+\|10:00$/);
    expect(recurrenceLabel(t, { kind: 'afterDone', unit: 'month', interval: 12, anchorOn: null })).toBe('groups.tasks.recurs.afterDone.month:12');
    expect(offsetLabel(t, -60)).toBe('groups.tasks.templates.offsetBefore:60');
    expect(offsetLabel(t, 0)).toBe('groups.tasks.templates.offsetSame');
    expect(offsetLabel(t, 2)).toBe('groups.tasks.templates.offsetAfter:2');
  });
});
