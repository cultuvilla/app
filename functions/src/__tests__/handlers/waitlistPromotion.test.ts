// Handler test for onRegistrationDeleted (waitlistPromotion).
// Runs against the Firestore emulator via firebase-admin and uses
// firebase-functions-test to wrap the v2 trigger.
//
// Orchestrated by `pnpm test:functions` (root), which starts the emulator
// suite first.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { deleteAfterQuery, deleteBeforeUpdate } from '../helpers/deletedSubject';
import { onRegistrationDeleted } from '../../events/waitlistPromotion';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
// File-unique event + user namespace. The whole functions suite shares one
// emulator boot; other files exercise the *deployed* onRegistrationDeleted
// trigger by really deleting `events/e1/registrations/*` docs, and those
// Eventarc deliveries can arrive late — during this file's tests — promoting
// an extra waitlisted user and writing a second notification. This file only
// ever invokes the handler in-process via ft.wrap (no real deletes, REST
// reset fires no triggers), so a private event id + user ids keep that
// cross-file fallout from ever touching our assertions.
const EVENT_ID = 'wl-e1';

function regPath(regId: string): string {
  return `events/${EVENT_ID}/registrations/${regId}`;
}

async function seedEvent(opts: { title: string; maxAttendees: number | null }): Promise<void> {
  const now = new Date();
  await admin.firestore().doc(`events/${EVENT_ID}`).set({
    title: opts.title,
    description: 'Una fiesta',
    startDate: now,
    location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'plaza' },
    imageURL: null,
    maxAttendees: opts.maxAttendees,
    telephoneRequired: false,
    status: 'published',
    organizerUserIds: ['creator-1'],
    organizerOrgIds: [],
    createdBy: 'creator-1',
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

interface SeedReg {
  id: string;
  status: 'confirmed' | 'waitlisted';
  userId: string;
  name: string;
  position?: number;
}

async function seedRegistration(reg: SeedReg): Promise<void> {
  // Schema-conformant write (RegistrationDataSchema) so the trigger's typed
  // ref converter can normalize-and-parse the doc when it reads existing
  // waitlisted regs to promote.
  await admin.firestore().doc(regPath(reg.id)).set({
    status: reg.status,
    userId: reg.userId,
    personId: `${reg.userId}-self`,
    name: reg.name,
    position: reg.position ?? 0,
    isMember: false,
    checkedInAt: null,
    registeredAt: new Date(),
  });
}

async function invokeDelete(reg: SeedReg): Promise<void> {
  const snap = ft.firestore.makeDocumentSnapshot(
    { status: reg.status, userId: reg.userId, name: reg.name, position: reg.position ?? 0 },
    regPath(reg.id),
  );
  // v2 firestore trigger: pass a synthesized CloudEvent.
  const wrapped = ft.wrap(onRegistrationDeleted as unknown as Parameters<typeof ft.wrap>[0]);
  await wrapped({
    data: snap,
    params: { eventId: EVENT_ID, regId: reg.id },
  } as unknown as Parameters<typeof wrapped>[0]);
}

describe('onRegistrationDeleted (waitlist promotion)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('is a no-op when the deleted registration was waitlisted', async () => {
    await seedEvent({ title: 'Fiesta', maxAttendees: 1 });
    await seedRegistration({ id: 'r1', status: 'confirmed', userId: 'wl-alice', name: 'Alice' });
    await seedRegistration({
      id: 'r2',
      status: 'waitlisted',
      userId: 'wl-bob',
      name: 'Bob',
      position: 1,
    });

    await invokeDelete({ id: 'r2', status: 'waitlisted', userId: 'wl-bob', name: 'Bob', position: 1 });

    const stillConfirmed = await admin.firestore().doc(regPath('r1')).get();
    expect(stillConfirmed.data()?.status).toBe('confirmed');
  });

  it('is a no-op when the event has no maxAttendees cap', async () => {
    await seedEvent({ title: 'Open event', maxAttendees: null });
    await seedRegistration({
      id: 'r2',
      status: 'waitlisted',
      userId: 'wl-bob',
      name: 'Bob',
      position: 1,
    });

    await invokeDelete({ id: 'r1', status: 'confirmed', userId: 'wl-alice', name: 'Alice' });

    const bob = await admin.firestore().doc(regPath('r2')).get();
    expect(bob.data()?.status).toBe('waitlisted');
  });

  it('is a no-op when there is no one on the waitlist', async () => {
    await seedEvent({ title: 'Fiesta', maxAttendees: 2 });

    await invokeDelete({ id: 'r1', status: 'confirmed', userId: 'wl-alice', name: 'Alice' });

    // Should not have created any notifications.
    const notifs = await admin.firestore().collection('users/wl-alice/notifications').get();
    expect(notifs.size).toBe(0);
  });

  it('updates confirmedCount and totalCount on the event after deletion', async () => {
    // Seed an event with bogus counts to ensure the trigger recomputes from
    // the source of truth rather than trusting whatever was on the doc.
    const now = new Date();
    await admin.firestore().doc(`events/${EVENT_ID}`).set({
      title: 'Fiesta',
      description: 'Una fiesta',
      startDate: now,
      location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'plaza' },
      imageURL: null,
      maxAttendees: 5,
      telephoneRequired: false,
      status: 'published',
      organizerUserIds: ['creator-1'],
      organizerOrgIds: [],
      createdBy: 'creator-1',
      createdAt: now,
      updatedAt: now,
      municipalityId: MUNICIPALITY_ID,
      villageName: 'Villarriba',
      villageSlug: 'villarriba',
      villageCoverImage: null,
      villageCoordinates: null,
      confirmedCount: 999,
      totalCount: 999,
      endBoundary: now,
      commentCount: 0,
      readCount: 0,
    });
    await seedRegistration({ id: 'r2', status: 'confirmed', userId: 'wl-bob', name: 'Bob', position: 2 });
    await seedRegistration({ id: 'r3', status: 'waitlisted', userId: 'wl-carol', name: 'Carol', position: 3 });

    await invokeDelete({ id: 'r1', status: 'confirmed', userId: 'wl-alice', name: 'Alice' });

    const eventDoc = await admin.firestore().doc(`events/${EVENT_ID}`).get();
    // After the trigger handles the deletion: r3 is promoted from waitlist
    // to confirmed, so r2 and r3 are both confirmed. Counts come from
    // authoritative aggregates over the collection, overriding the bogus
    // 999s seeded above.
    expect(eventDoc.data()?.confirmedCount).toBe(2);
    expect(eventDoc.data()?.totalCount).toBe(2);
  });

  it('promotes the next waitlisted user and creates a notification', async () => {
    await seedEvent({ title: 'Fiesta del pueblo', maxAttendees: 2 });
    await seedRegistration({
      id: 'r2',
      status: 'waitlisted',
      userId: 'wl-bob',
      name: 'Bob',
      position: 1,
    });
    await seedRegistration({
      id: 'r3',
      status: 'waitlisted',
      userId: 'wl-carol',
      name: 'Carol',
      position: 2,
    });

    await invokeDelete({ id: 'r1', status: 'confirmed', userId: 'wl-alice', name: 'Alice' });

    const bob = await admin.firestore().doc(regPath('r2')).get();
    expect(bob.data()?.status).toBe('confirmed');

    const carol = await admin.firestore().doc(regPath('r3')).get();
    expect(carol.data()?.status).toBe('waitlisted');

    const notifs = await admin.firestore().collection('users/wl-bob/notifications').get();
    expect(notifs.size).toBe(1);
    const notif = notifs.docs[0].data();
    expect(notif.type).toBe('waitlist_promoted');
    expect(notif.eventId).toBe(EVENT_ID);
    expect(notif.municipalityId).toBe(MUNICIPALITY_ID);
    expect(notif.read).toBe(false);
    expect(notif.body).toContain('Fiesta del pueblo');
    expect(notif.body).toContain('Bob');
  });

  it('ends quietly when the event itself is deleted under it (its delete cascades the registrations)', async () => {
    await seedEvent({ title: 'Fiesta', maxAttendees: null });
    const race = deleteBeforeUpdate(`events/${EVENT_ID}`);
    try {
      await expect(
        invokeDelete({ id: 'r1', status: 'confirmed', userId: 'wl-alice', name: 'Alice' }),
      ).resolves.not.toThrow();
    } finally {
      race.restore();
    }
    expect((await admin.firestore().doc(`events/${EVENT_ID}`).get()).exists).toBe(false);
  });

  it('promotes no one into a seat whose waitlisted registration was withdrawn meanwhile', async () => {
    await seedEvent({ title: 'Fiesta', maxAttendees: 1 });
    await seedRegistration({ id: 'r2', status: 'waitlisted', userId: 'wl-bob', name: 'Bob', position: 1 });

    const race = deleteAfterQuery(regPath('r2'));
    try {
      await expect(
        invokeDelete({ id: 'r1', status: 'confirmed', userId: 'wl-alice', name: 'Alice' }),
      ).resolves.not.toThrow();
    } finally {
      race.restore();
    }

    expect((await admin.firestore().doc(regPath('r2')).get()).exists).toBe(false);
    const notifs = await admin.firestore().collection('users/wl-bob/notifications').get();
    expect(notifs.size).toBe(0);
    const audit = await admin.firestore().collection(`events/${EVENT_ID}/registrationEvents`).get();
    expect(audit.size).toBe(0);
  });
});
