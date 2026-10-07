// Firestore Rules e2e test for /users/{userId}.
// Verifies the onboarding write path, including the documented race where the
// syncPersonDenormalization Cloud Function (admin SDK) pre-creates the user doc
// carrying only `displayName` before the client's createUserProfile runs.
//
// Uses @firebase/rules-unit-testing to mount the live firestore.rules file
// against the firestore emulator and execute requests under different auth
// contexts.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asAnon, asUser, asUserWithEmail, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const OWNER = 'uid-1';
const OTHER = 'uid-2';
const OWNER_EMAIL = 'ana@example.com';

// Mirrors the merge payload written by createUserProfile() in
// packages/shared/src/services/userService.ts — note it always includes
// `createdAt` (the converter is bypassed so the schema-required field is set
// explicitly).
const createUserProfilePayload = () => ({
  email: 'ana@example.com',
  telephone: null,
  activeMunicipalityId: null,
  personId: 'p1',
  createdAt: serverTimestamp(),
  termsAcceptedAt: serverTimestamp(),
  termsVersion: '1.0',
});

// Simulates syncPersonDenormalization writing users/{uid} first with only
// displayName (admin SDK bypasses rules).
async function seedTriggerCreatedUserDoc(userId: string) {
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${userId}`), { displayName: 'Ana' });
  });
}

describe('firestore.rules — /users/{userId}', () => {
  // The account doc carries email and telephone. Other people's names come
  // from publicProfiles/{uid}; nobody but the owner (and app admins) reads this.
  describe('read access is owner- or app-admin-only', () => {
    async function seedProfile(userId: string) {
      await seed(getEnv(), async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${userId}`), {
          ...createUserProfilePayload(),
          displayName: 'Ana',
          createdAt: new Date(),
          termsAcceptedAt: new Date(),
        });
      });
    }

    it('denies a signed-out get', async () => {
      await seedProfile(OWNER);
      await assertFails(getDoc(doc(asAnon(getEnv()), `users/${OWNER}`)));
    });

    it('denies a signed-out list', async () => {
      await seedProfile(OWNER);
      await assertFails(getDocs(collection(asAnon(getEnv()), 'users')));
    });

    it("denies another signed-in user's get", async () => {
      await seedProfile(OWNER);
      await assertFails(getDoc(doc(asUser(getEnv(), OTHER), `users/${OWNER}`)));
    });

    it('denies a signed-in list', async () => {
      await seedProfile(OWNER);
      await assertFails(getDocs(collection(asUser(getEnv(), OTHER), 'users')));
    });

    it('allows the owner to get their own doc', async () => {
      await seedProfile(OWNER);
      await assertSucceeds(getDoc(doc(asUser(getEnv(), OWNER), `users/${OWNER}`)));
    });

    it('allows the owner to get their own doc before it exists', async () => {
      await assertSucceeds(getDoc(doc(asUser(getEnv(), OWNER), `users/${OWNER}`)));
    });

    it('allows an app admin to get any doc', async () => {
      await seedProfile(OWNER);
      const adminDb = await asAdmin(getEnv(), 'sadmin');
      await assertSucceeds(getDoc(doc(adminDb, `users/${OWNER}`)));
    });
  });

  describe('create (no pre-existing doc)', () => {
    it('owner can create their own profile', async () => {
      const ownerDb = asUserWithEmail(getEnv(), OWNER, OWNER_EMAIL);
      await assertSucceeds(
        setDoc(doc(ownerDb, `users/${OWNER}`), createUserProfilePayload(), { merge: true }),
      );
    });

    it('rejects a create whose email is not the verified auth email', async () => {
      const ownerDb = asUserWithEmail(getEnv(), OWNER, OWNER_EMAIL);
      await assertFails(
        setDoc(
          doc(ownerDb, `users/${OWNER}`),
          { ...createUserProfilePayload(), email: 'someone-else@example.com' },
          { merge: true },
        ),
      );
    });

    it('rejects a create when the auth token carries no email', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(
        setDoc(doc(ownerDb, `users/${OWNER}`), createUserProfilePayload(), { merge: true }),
      );
    });

    it('cannot create a profile for another user', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(
        setDoc(doc(ownerDb, `users/${OTHER}`), createUserProfilePayload(), { merge: true }),
      );
    });

    it('rejects an unknown extra key on create', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(
        setDoc(
          doc(ownerDb, `users/${OWNER}`),
          { ...createUserProfilePayload(), sneaky: true },
          { merge: true },
        ),
      );
    });

    it('rejects a create missing the consent fields', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      const withoutConsent = {
        email: 'ana@example.com',
        telephone: null,
        activeMunicipalityId: null,
        personId: 'p1',
        createdAt: serverTimestamp(),
      };
      await assertFails(
        setDoc(doc(ownerDb, `users/${OWNER}`), withoutConsent, { merge: true }),
      );
    });
  });

  describe('onboarding race: trigger created the doc first', () => {
    it('owner can merge createUserProfile payload onto a trigger-created doc', async () => {
      // syncPersonDenormalization wrote { displayName } first.
      await seedTriggerCreatedUserDoc(OWNER);
      // createUserProfile uses setDoc(merge); because the doc exists this is an
      // UPDATE, and the payload carries `createdAt`. This is the real onboarding
      // write and must be allowed. The update guard requires the payload's
      // `email` to match the auth token's verified email.
      const ownerDb = asUserWithEmail(getEnv(), OWNER, createUserProfilePayload().email);
      await assertSucceeds(
        setDoc(doc(ownerDb, `users/${OWNER}`), createUserProfilePayload(), { merge: true }),
      );
    });

    it('still blocks a client from writing displayName itself', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(
        setDoc(
          doc(ownerDb, `users/${OWNER}`),
          { ...createUserProfilePayload(), displayName: 'Hacked Name' },
          { merge: true },
        ),
      );
    });

    it('blocks overwriting displayName even when merging onto the stub', async () => {
      await seedTriggerCreatedUserDoc(OWNER);
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(
        setDoc(
          doc(ownerDb, `users/${OWNER}`),
          { ...createUserProfilePayload(), displayName: 'Hacked Name' },
          { merge: true },
        ),
      );
    });
  });

  describe('email update must match the verified auth token', () => {
    async function seedFullyFormedProfile() {
      await seed(getEnv(), async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${OWNER}`), {
          ...createUserProfilePayload(),
          email: OWNER_EMAIL,
          displayName: 'Ana',
          createdAt: new Date(),
        });
      });
    }

    it('denies setting email to a value that does not match the auth token', async () => {
      await seedFullyFormedProfile();
      const ownerDb = asUserWithEmail(getEnv(), OWNER, OWNER_EMAIL);
      await assertFails(
        setDoc(
          doc(ownerDb, `users/${OWNER}`),
          { email: 'spoofed@example.com' },
          { merge: true },
        ),
      );
    });

    it('allows setting email to a value matching the auth token', async () => {
      await seedFullyFormedProfile();
      const ownerDb = asUserWithEmail(getEnv(), OWNER, 'new@example.com');
      await assertSucceeds(
        setDoc(
          doc(ownerDb, `users/${OWNER}`),
          { email: 'new@example.com' },
          { merge: true },
        ),
      );
    });

    it('allows a telephone-only update regardless of the auth token email', async () => {
      await seedFullyFormedProfile();
      const ownerDb = asUserWithEmail(getEnv(), OWNER, OWNER_EMAIL);
      await assertSucceeds(
        setDoc(doc(ownerDb, `users/${OWNER}`), { telephone: '600123456' }, { merge: true }),
      );
    });
  });

  describe('createdAt immutability', () => {
    it('blocks resetting createdAt on a fully-formed profile', async () => {
      await seed(getEnv(), async (ctx) => {
        await setDoc(doc(ctx.firestore(), `users/${OWNER}`), {
          ...createUserProfilePayload(),
          displayName: 'Ana',
          createdAt: new Date(),
        });
      });
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(
        setDoc(
          doc(ownerDb, `users/${OWNER}`),
          { createdAt: serverTimestamp() },
          { merge: true },
        ),
      );
    });
  });
});

describe('firestore.rules — /publicProfiles/{userId}', () => {
  async function seedPublicProfile(userId: string) {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), `publicProfiles/${userId}`), {
        displayName: 'Ana',
        activeMunicipalityId: null,
      });
    });
  }

  it('lets anyone, signed out included, get one profile', async () => {
    await seedPublicProfile(OWNER);
    await assertSucceeds(getDoc(doc(asAnon(getEnv()), `publicProfiles/${OWNER}`)));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), OTHER), `publicProfiles/${OWNER}`)));
  });

  it('denies listing the collection, signed in or not', async () => {
    await seedPublicProfile(OWNER);
    await assertFails(getDocs(collection(asAnon(getEnv()), 'publicProfiles')));
    await assertFails(getDocs(collection(asUser(getEnv(), OTHER), 'publicProfiles')));
  });

  it('denies client writes, even by the owner (function-owned)', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), OWNER), `publicProfiles/${OWNER}`), {
        displayName: 'Ana',
        activeMunicipalityId: null,
      }),
    );
  });
});
