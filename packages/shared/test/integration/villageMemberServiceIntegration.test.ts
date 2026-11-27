// Integration test for villageMemberService.getUserMemberships.
//
// Seeds municipality/{m}/members/{uid} docs via withSecurityRulesDisabled
// (we're testing the service's query shape, not the rules — rules are
// covered by test/e2e/villageMemberRules.test.ts), then calls the service
// and verifies it returns the right rows across municipalities.
//
// Why this layer exists: catches "wrong collection name" / "wrong where
// clause" bugs in the service that a mocked-Firestore unit test cannot.
//
// The service calls getDb() from the shared firebase singleton.  For these
// tests we spy on getDb() to return an authenticated-context Firestore from
// @firebase/rules-unit-testing so the collectionGroup rule (requires auth)
// is satisfied without initialising the full Firebase JS SDK.
import { describe, it, expect, afterAll, vi } from 'vitest';
import { doc, setDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, seed, firestoreOf } from '../helpers/roles';
import { getUserMemberships } from '../../src/services/villageMemberService';
import * as firebaseModule from '../../src/firebase';

const getEnv = useRulesTestEnv();

afterAll(() => {
  vi.restoreAllMocks();
});

describe('villageMemberService — getUserMemberships', () => {
  it('returns memberships for the caller across municipalities', async () => {
    await seed(getEnv(), async (ctx) => {
      const db = firestoreOf(ctx);
      const now = new Date();
      await setDoc(doc(db, 'municipalities/m1/members/alice'), {
        userId: 'alice', role: 'user', joinedAt: now, profileAnswers: {},
        profileCompletedAt: null,
      });
      await setDoc(doc(db, 'municipalities/m2/members/alice'), {
        userId: 'alice', role: 'admin', joinedAt: now, profileAnswers: {},
        profileCompletedAt: null,
      });
      await setDoc(doc(db, 'municipalities/m3/members/bob'), {
        userId: 'bob', role: 'user', joinedAt: now, profileAnswers: {},
        profileCompletedAt: null,
      });
    });

    // Spy on getDb() so the service uses the authenticated-context Firestore
    // from the rules-testing environment.  The collectionGroup rule requires
    // auth (resource.data.userId == request.auth.uid), so we use the context
    // for 'alice' — the user whose memberships we're querying.
    const aliceDb = asUser(getEnv(), 'alice');
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(aliceDb);

    const memberships = await getUserMemberships('alice');

    expect(memberships.map((m) => m.municipalityId).sort()).toEqual(['m1', 'm2']);
    expect(memberships.find((m) => m.municipalityId === 'm2')?.role).toBe('admin');

    vi.restoreAllMocks();
  });

  it('returns empty for a user with no memberships', async () => {
    const nobodyDb = asUser(getEnv(), 'nobody');
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(nobodyDb);

    const memberships = await getUserMemberships('nobody');
    expect(memberships).toEqual([]);

    vi.restoreAllMocks();
  });
});
