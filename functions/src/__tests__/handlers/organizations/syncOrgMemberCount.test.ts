// Trigger tests for syncOrgMemberCount. Drives the handler via
// firebase-functions-test's wrap()/makeChange() against the Firestore emulator.
// Modeled on functions/src/__tests__/handlers/interaction/syncEntityInteractionCounts.test.ts.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncOrgMemberCount } from '../../../organizations/syncOrgMemberCount';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncOrgMemberCount);

const ORG_ID = 'org-1';

interface MemberShape {
  userId: string;
  role: string;
}

function member(overrides: Partial<MemberShape> = {}): MemberShape {
  return { userId: 'user-1', role: 'member', ...overrides };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value ? (value as Record<string, unknown>) : {};
}

async function fireMemberTrigger(
  before: MemberShape | null,
  after: MemberShape | null,
  userId = 'user-1',
  orgId = ORG_ID,
): Promise<void> {
  const path = `organizations/${orgId}/members/${userId}`;
  const beforeSnap = ft.firestore.makeDocumentSnapshot(asRecord(before), path);
  const afterSnap = ft.firestore.makeDocumentSnapshot(asRecord(after), path);
  const change = ft.makeChange(beforeSnap, afterSnap);
  await wrapped({ data: change, params: { orgId, userId } });
}

async function seedOrg(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin.firestore().doc(`organizations/${id}`).set({ memberCount: 0, ...extra });
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

describe('syncOrgMemberCount', () => {
  it('increments memberCount when a member is added', async () => {
    await seedOrg(ORG_ID);
    await fireMemberTrigger(null, member());

    const org = await admin.firestore().doc(`organizations/${ORG_ID}`).get();
    expect(org.get('memberCount')).toBe(1);
  });

  it('decrements memberCount when a member is removed', async () => {
    await seedOrg(ORG_ID, { memberCount: 3 });
    await fireMemberTrigger(member(), null);

    const org = await admin.firestore().doc(`organizations/${ORG_ID}`).get();
    expect(org.get('memberCount')).toBe(2);
  });

  it('no-ops on a role change (before and after both exist)', async () => {
    await seedOrg(ORG_ID, { memberCount: 5 });
    await fireMemberTrigger(member({ role: 'member' }), member({ role: 'admin' }));

    const org = await admin.firestore().doc(`organizations/${ORG_ID}`).get();
    expect(org.get('memberCount')).toBe(5);
  });

  it('swallows NOT_FOUND when the org was already deleted', async () => {
    // No seed for organizations/gone.
    await expect(fireMemberTrigger(member(), null, 'user-1', 'gone')).resolves.not.toThrow();
  });
});
