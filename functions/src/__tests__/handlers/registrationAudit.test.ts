// Handler tests for the roster audit log: `events/{eventId}/registrationEvents`.
//
// Cancellation is a hard delete, so these entries are the ONLY thing that
// survives a removal. Each case asserts the entry is written in the same
// operation as the mutation, and says who did it to whom.
// Runs against the Firestore + Auth emulators via firebase-admin.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';

vi.mock('../../auth/secret', () => ({
  RESEND_API_KEY: { value: () => 'TEST_RESEND_KEY' },
}));

vi.mock('resend', () => ({
  Resend: vi.fn(function ResendMock(this: {
    emails: { send: () => Promise<unknown> };
  }) {
    this.emails = { send: () => Promise.resolve({ data: { id: 'x' }, error: null }) };
  }),
}));

import { registerToEvent } from '../../events/registerToEvent';
import { cancelRegistration } from '../../events/cancelRegistration';
import { addWalkInRegistration } from '../../events/addWalkInRegistration';

const ft = functionsTestFactory({
  projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test',
});

const MUNICIPALITY_ID = 'mun-1';
const EVENT_ID = 'e1';
const ATTENDEE = 'alice';
const ORGANIZER = 'creator-1';

const db = () => admin.firestore();

async function seedEvent(signupGroupSize = 1) {
  const now = new Date();
  await db()
    .doc(`events/${EVENT_ID}`)
    .set({
      signupFields: [],
      signupGroupSize,
      title: 'Fiesta de San Juan',
      description: 'Una fiesta',
      startDate: now,
      endDate: null,
      location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'Plaza Mayor' },
      imageURL: null,
      maxAttendees: null,
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
      confirmedCount: 0,
      totalCount: 0,
      endBoundary: now,
      commentCount: 0,
      readCount: 0,
    });
}

async function seedPerson(personId: string, uid: string) {
  await db().doc(`persons/${personId}`).set({
    givenName: personId,
    middleNames: [],
    firstSurname: 'García',
    secondSurname: null,
    nickname: null,
    sex: null,
    birthday: null,
    deathDate: null,
    birthPlace: null,
    burialPlace: null,
    municipalityLinks: [],
    occupations: [],
    biography: null,
    photoURL: null,
    userId: uid,
    isPublic: true,
    createdBy: uid,
    createdAt: new Date(),
  });
}

async function seedUser(uid: string) {
  await db()
    .doc(`users/${uid}`)
    .set({
      displayName: uid,
      email: `${uid}@example.test`,
      telephone: null,
      activeMunicipalityId: MUNICIPALITY_ID,
      personId: null,
      createdAt: new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: '1.0.0',
    });
}

function call<T>(fn: unknown, uid: string | null, data: unknown): Promise<T> {
  const wrapped = ft.wrap(fn as Parameters<typeof ft.wrap>[0]);
  return wrapped({
    data,
    auth: uid ? { uid, token: {} } : undefined,
  });
}

interface RegisterResult {
  registrations: { id: string; status: string; position: number }[];
  openSeats: { registrationId: string; token: string }[];
}

function signUp(names: string[], openSeats = 0): Promise<RegisterResult> {
  return call<RegisterResult>(registerToEvent, ATTENDEE, {
    eventId: EVENT_ID,
    registrants: names.map((name) => ({ personId: `${ATTENDEE}-${name}`, name })),
    openSeats,
  });
}

type Entry = Record<string, unknown>;

async function auditLog(): Promise<Entry[]> {
  const snap = await db().collection(`events/${EVENT_ID}/registrationEvents`).get();
  return snap.docs.map((d) => d.data() as Entry);
}

describe('registration audit log', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
    await seedUser(ATTENDEE);
    await seedUser(ORGANIZER);
    await seedPerson(`${ATTENDEE}-Ana`, ATTENDEE);
    await seedPerson(`${ATTENDEE}-Luis`, ATTENDEE);
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('records a sign-up, naming the person and the status they got', async () => {
    await seedEvent();
    const { registrations } = await signUp(['Ana']);

    const entries = await auditLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      registrationId: registrations[0].id,
      action: 'signed_up',
      actorUserId: ATTENDEE,
      subjectUserId: ATTENDEE,
      personId: `${ATTENDEE}-Ana`,
      name: 'Ana',
      status: 'confirmed',
      groupId: null,
    });
  });

  it('records a self-cancellation as `cancelled_self`, and keeps it after the row is gone', async () => {
    await seedEvent();
    const { registrations } = await signUp(['Ana']);

    await call(cancelRegistration, ATTENDEE, {
      eventId: EVENT_ID,
      registrationId: registrations[0].id,
    });

    // The registration itself is hard-deleted — the log is all that is left.
    const reg = await db().doc(`events/${EVENT_ID}/registrations/${registrations[0].id}`).get();
    expect(reg.exists).toBe(false);

    const entries = await auditLog();
    expect(entries.map((e) => e['action']).sort()).toEqual(['cancelled_self', 'signed_up']);
    const cancelled = entries.find((e) => e['action'] === 'cancelled_self');
    expect(cancelled).toMatchObject({
      actorUserId: ATTENDEE,
      subjectUserId: ATTENDEE,
      name: 'Ana',
    });
  });

  it('distinguishes an organizer removing someone from that person leaving', async () => {
    await seedEvent();
    const { registrations } = await signUp(['Ana']);

    await call(cancelRegistration, ORGANIZER, {
      eventId: EVENT_ID,
      registrationId: registrations[0].id,
    });

    const removed = (await auditLog()).find((e) => e['action'] === 'removed_by_organizer');
    expect(removed).toMatchObject({
      actorUserId: ORGANIZER,
      subjectUserId: ATTENDEE,
      name: 'Ana',
    });
  });

  it('records one entry per lost seat when a whole group is cancelled', async () => {
    await seedEvent(2);
    const { registrations } = await signUp(['Ana', 'Luis']);

    await call(cancelRegistration, ATTENDEE, {
      eventId: EVENT_ID,
      registrationId: registrations[0].id,
    });

    const group = (await auditLog()).filter((e) => e['action'] === 'group_cancelled');
    expect(group).toHaveLength(2);
    expect(group.map((e) => e['name']).sort()).toEqual(['Ana', 'Luis']);
    expect(group.every((e) => e['groupId'] !== null)).toBe(true);
  });

  it('records a walk-in with the organizer as actor and no subject account', async () => {
    await seedEvent();

    await call(addWalkInRegistration, ORGANIZER, {
      eventId: EVENT_ID,
      name: 'Vecina de la puerta',
      answers: {},
    });

    const entries = await auditLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'walk_in_added',
      actorUserId: ORGANIZER,
      subjectUserId: '',
      personId: '',
      name: 'Vecina de la puerta',
    });
  });

  it('writes nothing when the cancellation is denied', async () => {
    await seedEvent();
    const { registrations } = await signUp(['Ana']);

    await expect(
      call(cancelRegistration, 'stranger', {
        eventId: EVENT_ID,
        registrationId: registrations[0].id,
      }),
    ).rejects.toThrow();

    expect((await auditLog()).map((e) => e['action'])).toEqual(['signed_up']);
  });
});
