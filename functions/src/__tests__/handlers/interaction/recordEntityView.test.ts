// Handler test for the recordEntityView callable. Modeled on the
// setContentVisibility callable test's ft.wrap() harness — recordEntityView
// requires no auth, so no `auth` field is passed.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { wrapCallable } from '../../helpers/functionsTest';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { recordEntityView } from '../../../interaction/recordEntityView';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'm1';

interface CallableResult {
  ok: boolean;
}

async function callRecordEntityView(data: unknown): Promise<CallableResult> {
  const wrapped = wrapCallable(ft, recordEntityView);
  return await wrapped({ data });
}

async function seedEvent(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin.firestore().doc(`events/${id}`).set({ readCount: 0, ...extra });
}

describe('recordEntityView (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('increments readCount on the parent event', async () => {
    await seedEvent('e1');

    await callRecordEntityView({ entityKind: 'event', entityId: 'e1', municipalityId: MUNICIPALITY_ID });

    const eventDoc = await admin.firestore().doc('events/e1').get();
    expect(eventDoc.get('readCount')).toBe(1);
  });

  it('no-ops when the parent is missing', async () => {
    await expect(
      callRecordEntityView({ entityKind: 'event', entityId: 'missing', municipalityId: MUNICIPALITY_ID }),
    ).resolves.not.toThrow();
  });

  it('throws invalid-argument when a required field is missing', async () => {
    await expect(
      callRecordEntityView({ entityKind: 'event', entityId: 'e1' }),
    ).rejects.toThrow(/entityKind, entityId, municipalityId required/i);
  });

  it('throws invalid-argument for an unknown entityKind', async () => {
    await expect(
      callRecordEntityView({ entityKind: 'unknownKind', entityId: 'x1', municipalityId: MUNICIPALITY_ID }),
    ).rejects.toThrow(/unknown entityKind/i);
  });
});
