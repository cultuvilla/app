// Firestore Rules e2e test for top-level /membershipEvents/{eventId}.
// Verifies: a village admin (member with role 'admin') can read events scoped
// to their municipality; an org admin can read events scoped to their org; a
// plain member and non-members cannot; app admins can read anything. No client
// — not even a village or app admin — can create/update/delete; those writes
// are owned by Cloud Functions via the admin SDK.
//
// Uses @firebase/rules-unit-testing to mount the live firestore.rules file
// against the firestore emulator under different auth contexts.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, asAdmin, seed, firestoreOf } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const MUNI = 'muni-1';
const ORG = 'org-1';
const VILLAGE_ADMIN = 'vadmin';
const PLAIN_MEMBER = 'member';
const ORG_ADMIN = 'oadmin';
const OUTSIDER = 'bob';
const APP_ADMIN = 'sadmin';

const VILLAGE_EVENT = 'ev-village';
const ORG_EVENT = 'ev-org';

function villageEvent() {
  return {
    scopeType: 'village',
    scopeId: MUNI,
    municipalityId: MUNI,
    actorUserId: VILLAGE_ADMIN,
    targetUserId: PLAIN_MEMBER,
    action: 'role_changed',
    fromRole: 'user',
    toRole: 'admin',
    at: new Date(),
  };
}

function orgEvent() {
  return {
    scopeType: 'org',
    scopeId: ORG,
    municipalityId: MUNI,
    actorUserId: ORG_ADMIN,
    targetUserId: OUTSIDER,
    action: 'added',
    fromRole: null,
    toRole: 'member',
    at: new Date(),
  };
}

async function seedFixtures() {
  await seed(getEnv(), async (ctx) => {
    const db = firestoreOf(ctx);
    await setDoc(doc(db, `municipalities/${MUNI}/members/${VILLAGE_ADMIN}`), { role: 'admin' });
    await setDoc(doc(db, `municipalities/${MUNI}/members/${PLAIN_MEMBER}`), { role: 'user' });
    await setDoc(doc(db, `organizations/${ORG}/members/${ORG_ADMIN}`), { role: 'admin' });
    await setDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`), villageEvent());
    await setDoc(doc(db, `membershipEvents/${ORG_EVENT}`), orgEvent());
  });
}

describe('firestore.rules — /membershipEvents/{eventId}', () => {
  describe('read', () => {
    it('a village admin can read a village-scoped event in their municipality', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(getDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`)));
    });

    it('a village admin can read an org-scoped event in their municipality', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(getDoc(doc(db, `membershipEvents/${ORG_EVENT}`)));
    });

    it('an org admin can read an event scoped to their org', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), ORG_ADMIN);
      await assertSucceeds(getDoc(doc(db, `membershipEvents/${ORG_EVENT}`)));
    });

    it('an app admin can read any event', async () => {
      await seedFixtures();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertSucceeds(getDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`)));
    });

    it('a plain member (role user) cannot read', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), PLAIN_MEMBER);
      await assertFails(getDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`)));
    });

    it('an outsider cannot read', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), OUTSIDER);
      await assertFails(getDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`)));
    });

    it('an org admin cannot read a village-scoped event (not a village admin)', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), ORG_ADMIN);
      await assertFails(getDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`)));
    });

    it('anonymous cannot read', async () => {
      await seedFixtures();
      const db = asAnon(getEnv());
      await assertFails(getDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`)));
    });
  });

  describe('write (server-side only — all client writes denied)', () => {
    it('a village admin cannot create an event', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertFails(setDoc(doc(db, `membershipEvents/new-1`), villageEvent()));
    });

    it('an app admin cannot create an event', async () => {
      await seedFixtures();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertFails(setDoc(doc(db, `membershipEvents/new-2`), villageEvent()));
    });

    it('a village admin cannot update an event', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertFails(updateDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`), { toRole: 'user' }));
    });

    it('a village admin cannot delete an event', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertFails(deleteDoc(doc(db, `membershipEvents/${VILLAGE_EVENT}`)));
    });
  });
});
