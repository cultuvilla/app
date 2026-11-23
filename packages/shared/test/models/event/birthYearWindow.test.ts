import { describe, it, expect } from 'vitest';
import {
  birthYearEligibility,
  buildEventData,
  EventDataSchema,
  hasBirthYearWindow,
  needsBirthYearConfirm,
} from '../../../src/models/event/EventDataModel';

const baseInput = {
  title: 'Taller infantil',
  description: '',
  startDate: new Date('2026-08-15T18:00:00Z'),
  location: { coordinates: { lat: 40.0, lng: -3.6 }, displayName: 'Plaza Mayor' },
  organizerUserIds: ['u1'],
  organizerOrgIds: [],
  createdBy: 'u1',
  municipalityId: 'm1',
  villageName: 'Villa', villageSlug: 'villa',
  villageCoordinates: null,
};

describe('event birth-year window — model', () => {
  it('defaults both ends to null when the creator sets no window', () => {
    const data = buildEventData(baseInput);
    expect(data.minBirthYear).toBeNull();
    expect(data.maxBirthYear).toBeNull();
    expect(hasBirthYearWindow(data)).toBe(false);
  });

  it('carries the window through the builder', () => {
    const data = buildEventData({ ...baseInput, minBirthYear: 2014, maxBirthYear: 2020 });
    expect(data.minBirthYear).toBe(2014);
    expect(data.maxBirthYear).toBe(2020);
    expect(hasBirthYearWindow(data)).toBe(true);
  });

  it('parses a legacy event doc that predates the fields', () => {
    const data = buildEventData(baseInput);
    const legacy: Record<string, unknown> = { ...data };
    delete legacy['minBirthYear'];
    delete legacy['maxBirthYear'];
    const parsed = EventDataSchema.parse(legacy);
    expect(parsed.minBirthYear).toBeNull();
    expect(parsed.maxBirthYear).toBeNull();
  });
});

describe('birthYearEligibility', () => {
  const open = { minBirthYear: null, maxBirthYear: null };
  const kids = { minBirthYear: 2014, maxBirthYear: 2020 };
  const mayores = { minBirthYear: null, maxBirthYear: 1960 };
  const quinta = { minBirthYear: 1985, maxBirthYear: 1985 };

  it('is ok for any year when no window is set — even an unknown one', () => {
    expect(birthYearEligibility(open, 1930)).toBe('ok');
    expect(birthYearEligibility(open, null)).toBe('ok');
  });

  it('reports too-old below the minimum and too-young above the maximum', () => {
    expect(birthYearEligibility(kids, 2013)).toBe('too-old');
    expect(birthYearEligibility(kids, 2021)).toBe('too-young');
  });

  it('treats both bounds as inclusive', () => {
    expect(birthYearEligibility(kids, 2014)).toBe('ok');
    expect(birthYearEligibility(kids, 2020)).toBe('ok');
    expect(birthYearEligibility(quinta, 1985)).toBe('ok');
  });

  it('leaves an open end unbounded', () => {
    expect(birthYearEligibility(mayores, 1900)).toBe('ok');
    expect(birthYearEligibility(mayores, 1961)).toBe('too-young');
  });

  it('reports unknown — never out-of-range — for a persona with no birth year', () => {
    expect(birthYearEligibility(kids, null)).toBe('unknown');
    expect(birthYearEligibility(kids, undefined)).toBe('unknown');
    expect(needsBirthYearConfirm(kids, null)).toBe(false);
  });

  it('asks for confirmation only when the year is known and outside', () => {
    expect(needsBirthYearConfirm(kids, 2013)).toBe(true);
    expect(needsBirthYearConfirm(kids, 2015)).toBe(false);
    expect(needsBirthYearConfirm(open, 2013)).toBe(false);
  });
});
