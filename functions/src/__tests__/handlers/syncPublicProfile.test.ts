// Trigger test for syncPublicProfile: publicProfiles/{uid} must mirror only the
// public fields of users/{uid}, and disappear with the account.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { syncPublicProfile } from '../../users/syncPublicProfile';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncPublicProfile);

const USER_ID = 'user-1';

type UserShape = Record<string, unknown>;

function user(overrides: UserShape = {}): UserShape {
  return {
    displayName: 'Ana García',
    email: 'ana@test',
    telephone: '600123456',
    activeMunicipalityId: 'muni-1',
    personId: 'person-1',
    ...overrides,
  };
}

async function fireTrigger(before: UserShape | null, after: UserShape | null): Promise<void> {
  const path = `users/${USER_ID}`;
  const change = ft.makeChange(
    ft.firestore.makeDocumentSnapshot(before ?? {}, path),
    ft.firestore.makeDocumentSnapshot(after ?? {}, path),
  );
  await wrapped({ data: change, params: { userId: USER_ID } } as unknown as Parameters<typeof wrapped>[0]);
}

const projection = () => admin.firestore().doc(`publicProfiles/${USER_ID}`).get();

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('syncPublicProfile', () => {
  it('projects only the public fields, never email or telephone', async () => {
    await fireTrigger(null, user());

    const snap = await projection();
    expect(snap.data()).toEqual({ displayName: 'Ana García', activeMunicipalityId: 'muni-1' });
  });

  it('defaults a missing displayName and village so the strict converter parses', async () => {
    await fireTrigger(null, { email: 'ana@test', telephone: null });

    expect((await projection()).data()).toEqual({ displayName: '', activeMunicipalityId: null });
  });

  it('follows a name or active-village change', async () => {
    await fireTrigger(null, user());
    await fireTrigger(user(), user({ displayName: 'Ana Pérez', activeMunicipalityId: null }));

    expect((await projection()).data()).toEqual({ displayName: 'Ana Pérez', activeMunicipalityId: null });
  });

  it('deletes the projection when the account doc is deleted', async () => {
    await fireTrigger(null, user());
    await fireTrigger(user(), null);

    expect((await projection()).exists).toBe(false);
  });
});
