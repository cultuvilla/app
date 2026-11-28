// Handler test for the addWalkInRegistration callable, covering the custom
// signup-field answers an organizer fills in on the walk-in's behalf.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { wrapCallable } from '../helpers/functionsTest';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { addWalkInRegistration } from '../../events/addWalkInRegistration';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const EVENT_ID = 'e1';
const ORGANIZER_ID = 'creator-1';
const STRANGER_ID = 'nosy';

const SIZE = { id: 'size', label: 'Talla', type: 'select', required: true, options: ['S', 'M'] };

async function seedEvent(signupFields: unknown[] = []): Promise<void> {
  const now = new Date();
  await admin.firestore().doc(`events/${EVENT_ID}`).set({
    title: 'Carrera',
    description: 'Una carrera',
    startDate: now,
    location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'plaza' },
    imageURL: null,
    maxAttendees: null,
    telephoneRequired: false,
    requiresPayment: false,
    signupFields,
    status: 'published',
    organizerUserIds: [ORGANIZER_ID],
    organizerOrgIds: [],
    createdBy: ORGANIZER_ID,
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

interface CallableResult {
  registration: { id: string; status: 'confirmed' | 'waitlisted'; position: number };
}

async function callWalkIn(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = wrapCallable(ft, addWalkInRegistration);
  return await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  });
}

async function privateDocs(): Promise<Record<string, unknown>[]> {
  const snap = await admin.firestore().collection(`events/${EVENT_ID}/registrationPrivate`).get();
  return snap.docs.map((d) => d.data());
}

describe('addWalkInRegistration (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });
  beforeEach(async () => {
    await resetEmulators();
  });
  afterAll(() => {
    ft.cleanup();
  });

  it('denies a non-organizer', async () => {
    await seedEvent();
    await expect(
      callWalkIn({ uid: STRANGER_ID, data: { eventId: EVENT_ID, name: 'Ana' } }),
    ).rejects.toThrow(/organizador|permission/i);
  });

  it('stores the organizer-entered answers in the private doc', async () => {
    await seedEvent([SIZE]);
    await callWalkIn({
      uid: ORGANIZER_ID,
      data: { eventId: EVENT_ID, name: 'Ana', answers: { size: 'M' } },
    });
    // A walk-in has no persons doc, so `birthday` is written null rather than
    // omitted — every private doc carries the same shape.
    expect(await privateDocs()).toEqual([
      { name: 'Ana', phone: null, answers: { size: 'M' }, birthday: null },
    ]);
  });

  it('rejects a walk-in missing a required answer', async () => {
    await seedEvent([SIZE]);
    await expect(
      callWalkIn({ uid: ORGANIZER_ID, data: { eventId: EVENT_ID, name: 'Ana' } }),
    ).rejects.toThrow(/obligatorias|válida/i);
    const regs = await admin.firestore().collection(`events/${EVENT_ID}/registrations`).get();
    expect(regs.size).toBe(0);
  });

  it('writes no private doc when the event collects nothing', async () => {
    await seedEvent();
    await callWalkIn({ uid: ORGANIZER_ID, data: { eventId: EVENT_ID, name: 'Ana' } });
    expect(await privateDocs()).toHaveLength(0);
  });
});
