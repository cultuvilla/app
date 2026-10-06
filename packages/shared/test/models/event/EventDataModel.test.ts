import { describe, it, expect } from 'vitest';
import {
  EventDataSchema,
  buildEventData,
  isEventFull,
  isEventSignupOpen,
  isEventOngoing,
  isStartDayOver,
  isGroupSignupEvent,
  MAX_SIGNUP_GROUP_SIZE,
  upcomingThenPast,
} from '../../../src/models/event/EventDataModel';

const validEvent = {
  title: 'Fiesta',
  description: 'Annual fiesta',
  startDate: new Date('2026-06-15T18:00:00Z'),
  endDate: null,
  location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'Plaza Mayor' },
  imageURL: null,
  maxAttendees: 100,
  telephoneRequired: false,
  status: 'published' as const,
  organizerUserIds: ['u'],
  organizerOrgIds: [],
  createdBy: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  municipalityId: 'm-1',
  villageName: 'Villa', villageSlug: 'villa',
  villageCoverImage: null,
  villageCoordinates: { lat: 40.4, lng: -3.7 },
  confirmedCount: 0,
  totalCount: 0,
  commentCount: 0,
  readCount: 0,
  endBoundary: new Date('2026-06-15T18:00:00Z'),
};

describe('EventDataSchema', () => {
  it('parses a complete valid event', () => {
    expect(() => EventDataSchema.parse(validEvent)).not.toThrow();
  });

  it('requires confirmedCount and totalCount', () => {
    const { confirmedCount: _c, totalCount: _t, ...rest } = validEvent;
    expect(() => EventDataSchema.parse(rest)).toThrow();
  });

  it('rejects a missing required field', () => {
    const { title: _title, ...rest } = validEvent;
    expect(() => EventDataSchema.parse(rest)).toThrow();
  });

  it('rejects an unknown status value', () => {
    expect(() => EventDataSchema.parse({ ...validEvent, status: 'archived' })).toThrow();
  });
});

describe('buildEventData', () => {
  it('fills defaults for optional fields', () => {
    const built = buildEventData({
      title: 'X', description: 'Y',
      startDate: new Date('2026-06-15T18:00:00Z'),
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      organizerUserIds: ['u'],
      organizerOrgIds: [],
      createdBy: 'u',
      municipalityId: 'm', villageName: 'M', villageSlug: 'villa',
      villageCoordinates: { lat: 1, lng: 2 },
    });
    expect(built.status).toBe('published');
    expect(built.telephoneRequired).toBe(false);
    expect(built.endDate).toBeNull();
    // Single-day: the feed key falls back to startDate.
    expect(built.endBoundary).toEqual(new Date('2026-06-15T18:00:00Z'));
    expect(built.readCount).toBe(0);
    expect(built.commentCount).toBe(0);
    // Seeing who is going is what drives sign-ups in a pueblo, so a new event
    // shows its roster to fellow villagers unless the organizer opts out.
    expect(built.attendeesVisibility).toBe('members');
    // In-app sign-ups are on unless the organizer turns them off.
    expect(built.signupEnabled).toBe(true);
    expect(built.signupInfo).toBeNull();
    expect('reactionCounts' in built).toBe(false);
    expect(() => EventDataSchema.parse(built)).not.toThrow();
  });

  it('passes through a multi-day endDate', () => {
    const built = buildEventData({
      title: 'X', description: 'Y',
      startDate: new Date('2026-06-15T18:00:00Z'),
      endDate: new Date('2026-06-17T18:00:00Z'),
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      organizerUserIds: ['u'],
      organizerOrgIds: [],
      createdBy: 'u',
      municipalityId: 'm', villageName: 'M', villageSlug: 'villa',
      villageCoordinates: { lat: 1, lng: 2 },
    });
    expect(built.endDate).toEqual(new Date('2026-06-17T18:00:00Z'));
    // Multi-day: the feed key tracks endDate, so the event stays visible until
    // its last day is over.
    expect(built.endBoundary).toEqual(new Date('2026-06-17T18:00:00Z'));
    expect(() => EventDataSchema.parse(built)).not.toThrow();
  });

  it('defaults requiresPayment to false when omitted', () => {
    const built = buildEventData({
      title: 'X', description: 'Y',
      startDate: new Date('2026-06-15T18:00:00Z'),
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      organizerUserIds: ['u'],
      organizerOrgIds: [],
      createdBy: 'u',
      municipalityId: 'm', villageName: 'M', villageSlug: 'villa',
      villageCoordinates: { lat: 1, lng: 2 },
    });
    expect(built.requiresPayment).toBe(false);
    expect(() => EventDataSchema.parse(built)).not.toThrow();
  });

  it('preserves requiresPayment: true', () => {
    const built = buildEventData({
      title: 'X', description: 'Y',
      startDate: new Date('2026-06-15T18:00:00Z'),
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      organizerUserIds: ['u'],
      organizerOrgIds: [],
      createdBy: 'u',
      municipalityId: 'm', villageName: 'M', villageSlug: 'villa',
      villageCoordinates: { lat: 1, lng: 2 },
      requiresPayment: true,
    });
    expect(built.requiresPayment).toBe(true);
  });
});

describe('isEventFull', () => {
  const base = EventDataSchema.parse({
    title: 'X', description: 'Y',
    startDate: new Date('2026-06-15T18:00:00Z'),
    endDate: null,
    location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
    imageURL: null, maxAttendees: null,
    telephoneRequired: false, status: 'published',
    organizerUserIds: ['u'], organizerOrgIds: [], createdBy: 'u',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    municipalityId: 'm', villageName: 'M', villageSlug: 'villa',
    villageCoverImage: null,
    villageCoordinates: { lat: 1, lng: 2 },
    confirmedCount: 0, totalCount: 0,
    commentCount: 0, readCount: 0,
    endBoundary: new Date('2026-06-15T18:00:00Z'),
  });

  it('returns false when maxAttendees is null', () => {
    expect(isEventFull(base, 999)).toBe(false);
  });

  it('returns true when confirmedCount reaches maxAttendees', () => {
    expect(isEventFull({ ...base, maxAttendees: 5 }, 5)).toBe(true);
  });

  it('returns false when confirmedCount is below maxAttendees', () => {
    expect(isEventFull({ ...base, maxAttendees: 5 }, 4)).toBe(false);
  });
});

describe('isEventSignupOpen', () => {
  const base = EventDataSchema.parse({
    title: 'X', description: 'Y',
    startDate: new Date('2026-06-15T18:00:00Z'),
    endDate: null,
    location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
    imageURL: null, maxAttendees: null,
    telephoneRequired: false, status: 'published',
    organizerUserIds: ['u'], organizerOrgIds: [], createdBy: 'u',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    municipalityId: 'm', villageName: 'M', villageSlug: 'villa',
    villageCoverImage: null,
    villageCoordinates: { lat: 1, lng: 2 },
    confirmedCount: 0, totalCount: 0,
    commentCount: 0, readCount: 0,
    endBoundary: new Date('2026-06-15T18:00:00Z'),
  });

  it('returns true only for status published', () => {
    expect(isEventSignupOpen({ ...base, status: 'published' })).toBe(true);
    expect(isEventSignupOpen({ ...base, status: 'cancelled' })).toBe(false);
    expect(isEventSignupOpen({ ...base, status: 'completed' })).toBe(false);
  });

  it('returns false when the organizer turned off in-app sign-ups', () => {
    expect(isEventSignupOpen({ ...base, status: 'published', signupEnabled: false })).toBe(false);
  });

  it('defaults signupEnabled to true and signupInfo to null on legacy docs', () => {
    expect(base.signupEnabled).toBe(true);
    expect(base.signupInfo).toBeNull();
  });
});

describe('isEventOngoing', () => {
  const now = new Date('2026-06-15T21:00:00Z'); // 23:00 Madrid, still the 15th
  it('true: published, started earlier same Madrid day', () => {
    expect(isEventOngoing({ status: 'published', startDate: new Date('2026-06-15T16:00:00Z'), endDate: null }, now)).toBe(true);
  });
  it('false: before start', () => {
    expect(isEventOngoing({ status: 'published', startDate: new Date('2026-06-15T22:00:00Z'), endDate: null }, now)).toBe(false);
  });
  it('false: single-day Madrid start-day is over', () => {
    expect(isEventOngoing({ status: 'published', startDate: new Date('2026-06-14T16:00:00Z'), endDate: null }, now)).toBe(false);
  });
  it('false: not published', () => {
    expect(isEventOngoing({ status: 'cancelled', startDate: new Date('2026-06-15T16:00:00Z'), endDate: null }, now)).toBe(false);
  });
  it('true: multi-day event still within its endDate Madrid day', () => {
    // Started two days ago, ends today (the 15th) — still ongoing.
    expect(
      isEventOngoing(
        { status: 'published', startDate: new Date('2026-06-13T10:00:00Z'), endDate: new Date('2026-06-15T10:00:00Z') },
        now,
      ),
    ).toBe(true);
  });
  it('false: multi-day event whose endDate Madrid day is over', () => {
    expect(
      isEventOngoing(
        { status: 'published', startDate: new Date('2026-06-13T10:00:00Z'), endDate: new Date('2026-06-14T10:00:00Z') },
        now,
      ),
    ).toBe(false);
  });
});

describe('isStartDayOver', () => {
  it('false later same Madrid day', () => {
    expect(isStartDayOver(new Date('2026-06-15T08:00:00Z'), new Date('2026-06-15T21:00:00Z'))).toBe(false);
  });
  it('true next Madrid day', () => {
    expect(isStartDayOver(new Date('2026-06-15T08:00:00Z'), new Date('2026-06-15T23:30:00Z'))).toBe(true);
  });
});

describe('attendeesVisibility', () => {
  it('defaults to members when the field is absent (converter-safe)', () => {
    const built = buildEventData({
      title: 'X', description: 'Y',
      startDate: new Date('2026-06-15T18:00:00Z'),
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      organizerUserIds: ['u'], organizerOrgIds: [], createdBy: 'u',
      municipalityId: 'm', villageName: 'M', villageSlug: 'villa',
      villageCoordinates: { lat: 1, lng: 2 },
    });
    const { attendeesVisibility: _v, ...withoutField } = built;
    expect(EventDataSchema.parse(withoutField).attendeesVisibility).toBe('members');
  });

  it('carries an organizer-only roster through the builder', () => {
    const built = buildEventData({
      title: 'X', description: 'Y',
      startDate: new Date('2026-06-15T18:00:00Z'),
      location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
      organizerUserIds: ['u'], organizerOrgIds: [], createdBy: 'u',
      municipalityId: 'm', villageName: 'M', villageSlug: 'villa',
      villageCoordinates: { lat: 1, lng: 2 },
      attendeesVisibility: 'organizers',
    });
    expect(built.attendeesVisibility).toBe('organizers');
    expect(() => EventDataSchema.parse(built)).not.toThrow();
  });

  it('rejects an unknown visibility value', () => {
    expect(() =>
      EventDataSchema.parse({ ...validEvent, attendeesVisibility: 'public' }),
    ).toThrow();
  });
});

function baseEventInput() {
  return {
    title: 'X',
    description: 'Y',
    startDate: new Date('2026-06-15T18:00:00Z'),
    location: { coordinates: { lat: 1, lng: 2 }, displayName: 'Plaza' },
    organizerUserIds: ['u'],
    organizerOrgIds: [],
    createdBy: 'u',
    municipalityId: 'm',
    villageName: 'M', villageSlug: 'villa',
    villageCoordinates: { lat: 1, lng: 2 },
  };
}

describe('signupGroupSize', () => {
  it('defaults to individual sign-up', () => {
    const event = buildEventData(baseEventInput());
    expect(event.signupGroupSize).toBe(1);
    expect(isGroupSignupEvent(event)).toBe(false);
  });

  it('carries a group size through and reports it as a group event', () => {
    const event = buildEventData({ ...baseEventInput(), signupGroupSize: 2 });
    expect(event.signupGroupSize).toBe(2);
    expect(isGroupSignupEvent(event)).toBe(true);
  });

  it('parses an event stored before group sign-ups existed', () => {
    const { signupGroupSize: _omitted, ...stored } = buildEventData(baseEventInput());
    expect(EventDataSchema.parse(stored).signupGroupSize).toBe(1);
  });

  it('rejects a group size past the cap or below one', () => {
    const stored = buildEventData(baseEventInput());
    for (const size of [0, MAX_SIGNUP_GROUP_SIZE + 1, 2.5]) {
      expect(() => EventDataSchema.parse({ ...stored, signupGroupSize: size })).toThrow();
    }
  });
});

describe('upcomingThenPast', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const ev = (id: string, start: string, end: string | null = null) => ({
    id,
    startDate: new Date(start),
    endDate: end ? new Date(end) : null,
  });

  it('lists upcoming soonest first, then past most recent first', () => {
    const ordered = upcomingThenPast(
      [
        ev('past-old', '2025-07-01T18:00:00Z'),
        ev('next-month', '2026-09-01T18:00:00Z'),
        ev('past-recent', '2026-08-01T18:00:00Z'),
        ev('tomorrow', '2026-08-11T18:00:00Z'),
      ],
      now,
    );
    expect(ordered.map((e) => e.id)).toEqual(['tomorrow', 'next-month', 'past-recent', 'past-old']);
  });

  it('counts a multi-day event still running as upcoming', () => {
    const ordered = upcomingThenPast(
      [ev('done', '2026-08-01T18:00:00Z'), ev('fiestas', '2026-08-05T18:00:00Z', '2026-08-15T18:00:00Z')],
      now,
    );
    expect(ordered.map((e) => e.id)).toEqual(['fiestas', 'done']);
  });
});
