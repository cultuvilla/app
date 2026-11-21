import { describe, expect, it } from 'vitest';
import {
  buildEventData,
  buildFiestaEditionData,
  daysUntilFiestaEdition,
  editionBlock,
  editionContaining,
  EventDataSchema,
  FiestaEditionDataSchema,
  fiestaEditionId,
  fiestaEditionPhase,
  fiestaEditionProblem,
  fiestaEditionRange,
  fiestaProgrammeDays,
} from '../../../src/models';

const santiago = { startDay: '2026-07-24', endDay: '2026-07-26' };

describe('fiesta editions', () => {
  it('has one id per block and year', () => {
    expect(fiestaEditionId('m1', 'santiago', 2026)).toBe('m1_santiago_2026');
  });

  it('builds a doc the schema accepts', () => {
    const data = buildFiestaEditionData({
      municipalityId: 'm1', villageSlug: 'villa', blockId: 'santiago', year: 2026, ...santiago, proposedBy: 'u1',
      createdAt: new Date('2026-06-01'),
    });
    expect(FiestaEditionDataSchema.parse(data)).toEqual(data);
    expect(data.updatedAt).toEqual(data.createdAt);
  });

  it('refuses a day that is not a calendar day', () => {
    expect(() => FiestaEditionDataSchema.shape.startDay.parse('2026-02-30')).toThrow();
  });

  it('is upcoming, running, then over, by Madrid day', () => {
    expect(fiestaEditionPhase(santiago, '2026-07-23')).toBe('upcoming');
    expect(fiestaEditionPhase(santiago, '2026-07-24')).toBe('running');
    expect(fiestaEditionPhase(santiago, '2026-07-26')).toBe('running');
    expect(fiestaEditionPhase(santiago, '2026-07-27')).toBe('over');
  });

  it('counts the days to go', () => {
    expect(daysUntilFiestaEdition(santiago, '2026-07-01')).toBe(23);
    expect(daysUntilFiestaEdition(santiago, '2026-07-25')).toBe(0);
  });

  it('spans whole Madrid days', () => {
    const { start, end } = fiestaEditionRange(santiago);
    expect(start.toISOString()).toBe('2026-07-23T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-26T21:59:59.999Z');
  });

  it('explains a range that cannot be the year’s edition', () => {
    expect(fiestaEditionProblem(2026, '2026-07-24', '2026-07-26')).toBeNull();
    expect(fiestaEditionProblem(2026, '2026-07-26', '2026-07-24')).toBe('order');
    expect(fiestaEditionProblem(2026, '2025-07-24', '2025-07-26')).toBe('year');
    expect(fiestaEditionProblem(2026, '2026-12-28', '2027-01-06')).toBeNull();
    expect(fiestaEditionProblem(2026, '2026-07-01', '2026-08-01')).toBe('too-long');
    expect(fiestaEditionProblem(2026, '2026-07-01', '2026-07-31')).toBeNull();
  });

  it('finds the edition an event’s Madrid day falls in', () => {
    const editions = [{ id: 'a', ...santiago }, { id: 'b', startDay: '2026-08-14', endDay: '2026-08-17' }];
    // 23:30 UTC on the 23rd is already the 24th in Madrid.
    expect(editionContaining(editions, new Date('2026-07-23T23:30:00Z'))?.id).toBe('a');
    expect(editionContaining(editions, new Date('2026-07-23T20:00:00Z'))).toBeNull();
    expect(editionContaining(editions, new Date('2026-08-17T10:00:00Z'))?.id).toBe('b');
  });

  it('names its block only while the block exists', () => {
    const fiestas = [{ id: 'santiago', name: 'Santiago', month: 7 }];
    expect(editionBlock({ blockId: 'santiago' }, fiestas)?.name).toBe('Santiago');
    expect(editionBlock({ blockId: 'gone' }, fiestas)).toBeNull();
  });
});

describe('fiestaProgrammeDays', () => {
  const ev = (id: string, iso: string) => ({ id, startDate: new Date(iso) });
  const events = [
    ev('verbena', '2026-07-24T21:00:00Z'),
    ev('misa', '2026-07-25T10:00:00Z'),
    ev('pregon', '2026-07-24T18:00:00Z'),
    // 23:00 UTC on the 25th is the 26th in Madrid.
    ev('charanga', '2026-07-25T23:00:00Z'),
  ];

  it('groups by Madrid day, in start order', () => {
    const days = fiestaProgrammeDays(events);
    expect(days.map((d) => d.day)).toEqual(['2026-07-24', '2026-07-25', '2026-07-26']);
    expect(days[0]?.events.map((e) => e.id)).toEqual(['pregon', 'verbena']);
    expect(days[2]?.events.map((e) => e.id)).toEqual(['charanga']);
  });

  it('puts today first while the fiestas are on', () => {
    expect(fiestaProgrammeDays(events, '2026-07-25').map((d) => d.day)).toEqual(['2026-07-25', '2026-07-26', '2026-07-24']);
  });

  it('is empty without events', () => {
    expect(fiestaProgrammeDays([])).toEqual([]);
  });
});

describe('events on a programme', () => {
  const base = {
    title: 'Pregón', description: '', startDate: new Date('2026-07-24T18:00:00Z'),
    location: { coordinates: { lat: 40, lng: -3 }, displayName: 'Plaza' },
    organizerUserIds: ['u1'], organizerOrgIds: [], createdBy: 'u1',
    municipalityId: 'm1', villageName: 'Villa', villageSlug: 'villa', villageCoordinates: null,
  };

  it('defaults to no edition, and an event that predates the field reads as none', () => {
    const data = buildEventData(base);
    expect(data.fiestaEditionId).toBeNull();
    const { fiestaEditionId: _dropped, ...legacy } = data;
    expect(EventDataSchema.parse(legacy).fiestaEditionId).toBeNull();
  });

  it('keeps the edition it is tagged with, but never on a series', () => {
    expect(buildEventData({ ...base, fiestaEditionId: 'm1_santiago_2026' }).fiestaEditionId).toBe('m1_santiago_2026');
    const series = { id: 's1', index: 0, frequency: 'weekly' as const, weekdays: [5], until: new Date('2026-08-01') };
    expect(buildEventData({ ...base, series, fiestaEditionId: 'm1_santiago_2026' }).fiestaEditionId).toBeNull();
  });
});
