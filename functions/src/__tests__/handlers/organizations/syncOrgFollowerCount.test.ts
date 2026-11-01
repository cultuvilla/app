// Trigger tests for syncOrgFollowerCount. Drives the handler via
// firebase-functions-test's wrap()/makeChange() against the Firestore emulator.
// Modeled on functions/src/__tests__/handlers/interaction/syncEntityInteractionCounts.test.ts.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncOrgFollowerCount } from '../../../organizations/syncOrgFollowerCount';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncOrgFollowerCount);

const ORG_ID = 'org-1';

interface FollowerShape {
  userId: string;
}

function follower(): FollowerShape {
  return { userId: 'user-1' };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value ? (value as Record<string, unknown>) : {};
}

async function fireFollowerTrigger(
  before: FollowerShape | null,
  after: FollowerShape | null,
  userId = 'user-1',
  orgId = ORG_ID,
): Promise<void> {
  const path = `organizations/${orgId}/followers/${userId}`;
  const beforeSnap = ft.firestore.makeDocumentSnapshot(asRecord(before), path);
  const afterSnap = ft.firestore.makeDocumentSnapshot(asRecord(after), path);
  const change = ft.makeChange(beforeSnap, afterSnap);
  await wrapped({ data: change, params: { orgId, userId } } as unknown as Parameters<
    typeof wrapped
  >[0]);
}

async function seedOrg(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin.firestore().doc(`organizations/${id}`).set({ followerCount: 0, ...extra });
}

beforeAll(async () => {
  await resetEmulators();
});

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('syncOrgFollowerCount', () => {
  it('increments followerCount when someone follows', async () => {
    await seedOrg(ORG_ID);
    await fireFollowerTrigger(null, follower());

    const org = await admin.firestore().doc(`organizations/${ORG_ID}`).get();
    expect(org.get('followerCount')).toBe(1);
  });

  it('decrements followerCount when someone stops following', async () => {
    await seedOrg(ORG_ID, { followerCount: 3 });
    await fireFollowerTrigger(follower(), null);

    const org = await admin.firestore().doc(`organizations/${ORG_ID}`).get();
    expect(org.get('followerCount')).toBe(2);
  });

  it('swallows NOT_FOUND when the org was already deleted', async () => {
    // No seed for organizations/gone.
    await expect(fireFollowerTrigger(follower(), null, 'user-1', 'gone')).resolves.not.toThrow();
  });
});
