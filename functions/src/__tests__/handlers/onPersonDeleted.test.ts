// Handler tests for onPersonDeleted: a deleted persona gives up its seats on
// upcoming events through the same cancellation a holder's own cancel runs.
// Runs against the Firestore + Auth emulators via firebase-admin; the trigger
// is invoked in-process through firebase-functions-test's wrap().

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';

vi.mock('../../auth/secret', () => ({
  RESEND_API_KEY: { value: () => 'TEST_RESEND_KEY' },
}));
vi.mock('resend', () => ({
  Resend: vi.fn(function ResendMock(this: { emails: { send: () => Promise<unknown> } }) {
    this.emails = { send: () => Promise.resolve({ data: { id: 'x' }, error: null }) };
  }),
}));

import { onPersonDeleted } from '../../events/onPersonDeleted';

const ft = functionsTestFactory({
  projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test',
});

const MUNICIPALITY_ID = 'mun-1';
const OWNER = 'alice';
const FRIEND = 'bob';
const ORGANIZER = 'creator-1';
const PERSONA = 'alice-Ana';
const DAY = 24 * 60 * 60 * 1000;

const db = () => admin.firestore();

async function seedEvent(eventId: string, opts: { endsInMs: number; groupSize?: number }) {
  const now = new Date();
  const end = new Date(now.getTime() + opts.endsInMs);
  await db()
    .doc(`events/${eventId}`)
    .set({
      signupFields: [],
      signupGroupSize: opts.groupSize ?? 1,
      title: `Evento ${eventId}`,
      description: 'Una fiesta',
      startDate: end,
      endDate: null,
      location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'Plaza Mayor' },
      imageURL: null,
      maxAttendees: 1,
      telephoneRequired: false,
      requiresPayment: false,
      attendeesVisibility: 'members',
      status: 'published',
      organizerUserIds: [ORGANIZER],
      organizerOrgIds: [],
      createdBy: ORGANIZER,
      createdAt: now,
      updatedAt: now,
      municipalityId: MUNICIPALITY_ID,
      villageName: 'Villarriba',
      villageSlug: 'villarriba',
      villageCoverImage: null,
      villageCoordinates: null,
      confirmedCount: 1,
      totalCount: 1,
      endBoundary: end,
      commentCount: 0,
      readCount: 0,
    });
}

interface SeedSeat {
  eventId: string;
  id: string;
  userId: string;
  personId: string;
  groupId?: string | null;
  groupOwnerId?: string | null;
}

async function seedSeat(seat: SeedSeat) {
  await db()
    .doc(`events/${seat.eventId}/registrations/${seat.id}`)
    .set({
      userId: seat.userId,
      personId: seat.personId,
      name: seat.personId,
      status: 'confirmed',
      position: 0,
      registeredAt: new Date(),
      isMember: false,
      checkedInAt: null,
      paidAt: null,
      photoURL: null,
      personUserId: null,
      isPersonPublic: true,
      groupId: seat.groupId ?? null,
      groupOwnerId: seat.groupOwnerId ?? null,
      isOpenSeat: false,
    });
}

async function seatExists(eventId: string, id: string): Promise<boolean> {
  return (await db().doc(`events/${eventId}/registrations/${id}`).get()).exists;
}

async function deletePersona(personId: string) {
  const snap = ft.firestore.makeDocumentSnapshot(
    { createdBy: OWNER, userId: null, givenName: 'Ana' },
    `persons/${personId}`,
  );
  await ft.wrap(onPersonDeleted)({ data: snap, params: { personId } });
}

describe('onPersonDeleted', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('cancels the persona seat on an upcoming event, as its holder', async () => {
    await seedEvent('soon', { endsInMs: 7 * DAY });
    await seedSeat({ eventId: 'soon', id: 'r1', userId: OWNER, personId: PERSONA });

    await deletePersona(PERSONA);

    expect(await seatExists('soon', 'r1')).toBe(false);
    const audit = await db().collection('events/soon/registrationEvents').get();
    expect(audit.docs.map((d) => d.get('action'))).toEqual(['cancelled_self']);
    expect(audit.docs[0].get('actorUserId')).toBe(OWNER);
  });

  it('keeps the seat on an event that is already over', async () => {
    await seedEvent('done', { endsInMs: -DAY });
    await seedSeat({ eventId: 'done', id: 'r1', userId: OWNER, personId: PERSONA });

    await deletePersona(PERSONA);

    expect(await seatExists('done', 'r1')).toBe(true);
  });

  it('leaves other personas alone', async () => {
    await seedEvent('soon', { endsInMs: 7 * DAY });
    await seedSeat({ eventId: 'soon', id: 'r1', userId: OWNER, personId: PERSONA });
    await seedSeat({ eventId: 'soon', id: 'r2', userId: OWNER, personId: 'alice-Luis' });

    await deletePersona(PERSONA);

    expect(await seatExists('soon', 'r1')).toBe(false);
    expect(await seatExists('soon', 'r2')).toBe(true);
  });

  it("dissolves the owner's group, as the owner cancelling it would", async () => {
    await seedEvent('pair', { endsInMs: 7 * DAY, groupSize: 2 });
    const group = { groupId: 'g1', groupOwnerId: OWNER };
    await seedSeat({ eventId: 'pair', id: 'r1', userId: OWNER, personId: PERSONA, ...group });
    await seedSeat({ eventId: 'pair', id: 'r2', userId: OWNER, personId: 'alice-Luis', ...group });

    await deletePersona(PERSONA);

    expect(await seatExists('pair', 'r1')).toBe(false);
    expect(await seatExists('pair', 'r2')).toBe(false);
  });

  it("hands a claimed seat back to someone else's group instead of dissolving it", async () => {
    await seedEvent('pair', { endsInMs: 7 * DAY, groupSize: 2 });
    const group = { groupId: 'g1', groupOwnerId: FRIEND };
    await seedSeat({ eventId: 'pair', id: 'r1', userId: FRIEND, personId: 'bob-Bob', ...group });
    await seedSeat({ eventId: 'pair', id: 'r2', userId: OWNER, personId: PERSONA, ...group });

    await deletePersona(PERSONA);

    expect(await seatExists('pair', 'r1')).toBe(true);
    const released = await db().doc('events/pair/registrations/r2').get();
    expect(released.get('isOpenSeat')).toBe(true);
    expect(released.get('personId')).toBe('');
  });

  it('is a no-op on redelivery', async () => {
    await seedEvent('soon', { endsInMs: 7 * DAY });
    await seedSeat({ eventId: 'soon', id: 'r1', userId: OWNER, personId: PERSONA });

    await deletePersona(PERSONA);
    await deletePersona(PERSONA);

    const audit = await db().collection('events/soon/registrationEvents').get();
    expect(audit.size).toBe(1);
  });
});
