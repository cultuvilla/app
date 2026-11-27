// Trigger test for onEventUpdated's sign-up sweep. Drives the handler via
// firebase-functions-test's wrap()/makeChange() against the Firestore
// emulator (admin SDK env is wired up in setup/admin.setup.ts).
//
// The branch under test is destructive — turning in-app sign-ups off on an
// event deletes every registration on it — so what it does NOT fire on is as
// load-bearing as what it does.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { onEventUpdated } from '../../events/notificationTriggers';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(onEventUpdated);

// File-unique namespace: the functions suite shares one emulator boot and
// other files really delete registrations, whose Eventarc deliveries can
// arrive during this file's tests.
const EVENT_ID = 'sd-e1';
const MUNICIPALITY_ID = 'sd-mun';

interface EventShape {
  title: string;
  status: string;
  municipalityId: string;
  signupEnabled: boolean;
}

function event(overrides: Partial<EventShape> = {}): EventShape {
  return {
    title: 'Torneo de frontenis',
    status: 'published',
    municipalityId: MUNICIPALITY_ID,
    signupEnabled: true,
    ...overrides,
  };
}

async function fireTrigger(before: EventShape, after: EventShape): Promise<void> {
  const change = ft.makeChange(
    ft.firestore.makeDocumentSnapshot(
      before,
      `events/${EVENT_ID}`,
    ),
    ft.firestore.makeDocumentSnapshot(
      after,
      `events/${EVENT_ID}`,
    ),
  );
  await wrapped({
    data: change,
    params: { eventId: EVENT_ID },
  });
}

/** Schema-conformant write so the handler's typed converter can read it back. */
async function seedRegistration(id: string, userId: string): Promise<void> {
  await admin.firestore().doc(`events/${EVENT_ID}/registrations/${id}`).set({
    status: 'confirmed',
    userId,
    personId: `${userId}-self`,
    name: 'Alguien',
    position: 1,
    isMember: true,
    checkedInAt: null,
    registeredAt: new Date(),
  });
  await admin.firestore().doc(`events/${EVENT_ID}/registrationPrivate/${id}`).set({
    telephone: '600000000',
    answers: {},
  });
}

async function registrationIds(): Promise<string[]> {
  const snap = await admin.firestore().collection(`events/${EVENT_ID}/registrations`).get();
  return snap.docs.map((d) => d.id);
}

async function notificationsFor(uid: string): Promise<admin.firestore.QuerySnapshot> {
  return admin.firestore().collection(`users/${uid}/notifications`).get();
}

describe('onEventUpdated — sign-ups turned off', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('deletes every registration and its private doc, and notifies each person once', async () => {
    await seedRegistration('r1', 'sd-alice');
    // Two seats booked by the same account (a parent and a child) must produce
    // one notification, not two.
    await seedRegistration('r2', 'sd-bob');
    await seedRegistration('r3', 'sd-bob');

    await fireTrigger(event({ signupEnabled: true }), event({ signupEnabled: false }));

    expect(await registrationIds()).toEqual([]);
    const privates = await admin
      .firestore()
      .collection(`events/${EVENT_ID}/registrationPrivate`)
      .get();
    expect(privates.size).toBe(0);

    const alice = await notificationsFor('sd-alice');
    expect(alice.size).toBe(1);
    expect(alice.docs[0].data()['type']).toBe('signups_disabled');
    expect(alice.docs[0].data()['eventId']).toBe(EVENT_ID);
    expect(alice.docs[0].data()['municipalityId']).toBe(MUNICIPALITY_ID);
    expect(alice.docs[0].data()['body']).toContain('Torneo de frontenis');
    expect((await notificationsFor('sd-bob')).size).toBe(1);
  });

  it('deletes the group-invite links, which now point at seats that are gone', async () => {
    await seedRegistration('r1', 'sd-alice');
    await admin.firestore().doc(`events/${EVENT_ID}/seatTokens/tok-1`).set({
      registrationId: 'r1',
      groupId: 'g-1',
      createdBy: 'sd-alice',
      createdAt: new Date(),
    });

    await fireTrigger(event({ signupEnabled: true }), event({ signupEnabled: false }));

    const tokens = await admin.firestore().collection(`events/${EVENT_ID}/seatTokens`).get();
    expect(tokens.size).toBe(0);
  });

  it('is redelivery-safe: a second delivery writes no second notification', async () => {
    await seedRegistration('r1', 'sd-alice');

    await fireTrigger(event({ signupEnabled: true }), event({ signupEnabled: false }));
    await fireTrigger(event({ signupEnabled: true }), event({ signupEnabled: false }));

    expect((await notificationsFor('sd-alice')).size).toBe(1);
  });

  it('leaves the roster alone on an edit that does not touch the flag', async () => {
    await seedRegistration('r1', 'sd-alice');

    await fireTrigger(event({ title: 'Antes' }), event({ title: 'Después' }));

    expect(await registrationIds()).toEqual(['r1']);
    // The unrelated event_updated branch still fires — that is its job.
    const notifs = await notificationsFor('sd-alice');
    expect(notifs.docs.map((d) => d.data()['type'])).toEqual(['event_updated']);
  });

  it('does not re-sweep an event whose sign-ups were already off', async () => {
    // A walk-in registration an organizer recorded after the flag went off:
    // addWalkInRegistration is deliberately still open on such an event, so a
    // later unrelated edit must not delete what it wrote.
    await seedRegistration('r1', 'sd-alice');

    await fireTrigger(
      event({ signupEnabled: false, title: 'Antes' }),
      event({ signupEnabled: false, title: 'Después' }),
    );

    expect(await registrationIds()).toEqual(['r1']);
  });
});
