// Firestore Rules e2e test for top-level /moderationEvents/{eventId} — the
// audit log the setContentVisibility callable appends to via the admin SDK.
// Verifies: a village admin reads events of their own municipality (single doc
// and the municipality-scoped list query), app admins read anything, everyone
// else is denied, and no client — admins included — can write.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, asAdmin, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const MUNI = 'muni-1';
const OTHER_MUNI = 'muni-2';
const VILLAGE_ADMIN = 'vadmin';
const OTHER_VILLAGE_ADMIN = 'vadmin-2';
const PLAIN_MEMBER = 'member';
const OUTSIDER = 'bob';
const APP_ADMIN = 'sadmin';

const EVENT = 'mod-1';
const OTHER_EVENT = 'mod-2';

function moderationEvent(municipalityId: string) {
  return {
    municipalityId,
    collection: 'news',
    docId: 'news-1',
    action: 'hide',
    actorUserId: VILLAGE_ADMIN,
    reason: 'spam',
    at: new Date(),
  };
}

async function seedFixtures() {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, `municipalities/${MUNI}/members/${VILLAGE_ADMIN}`), { role: 'admin' });
    await setDoc(doc(db, `municipalities/${MUNI}/members/${PLAIN_MEMBER}`), { role: 'user' });
    await setDoc(doc(db, `municipalities/${OTHER_MUNI}/members/${OTHER_VILLAGE_ADMIN}`), { role: 'admin' });
    await setDoc(doc(db, `moderationEvents/${EVENT}`), moderationEvent(MUNI));
    await setDoc(doc(db, `moderationEvents/${OTHER_EVENT}`), moderationEvent(OTHER_MUNI));
  });
}

describe('firestore.rules — /moderationEvents/{eventId}', () => {
  describe('read', () => {
    it('a village admin can read an event of their municipality', async () => {
      await seedFixtures();
      await assertSucceeds(getDoc(doc(asUser(getEnv(), VILLAGE_ADMIN), `moderationEvents/${EVENT}`)));
    });

    it('a village admin can list their municipality’s events', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(
        getDocs(query(collection(db, 'moderationEvents'), where('municipalityId', '==', MUNI))),
      );
    });

    it('a village admin cannot read another municipality’s event', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(asUser(getEnv(), VILLAGE_ADMIN), `moderationEvents/${OTHER_EVENT}`)));
    });

    it('an unscoped list is denied to a village admin', async () => {
      await seedFixtures();
      await assertFails(getDocs(collection(asUser(getEnv(), VILLAGE_ADMIN), 'moderationEvents')));
    });

    it('an app admin can read any event and list the whole log', async () => {
      await seedFixtures();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertSucceeds(getDoc(doc(db, `moderationEvents/${OTHER_EVENT}`)));
      await assertSucceeds(getDocs(collection(db, 'moderationEvents')));
    });

    it('a plain member (role user) cannot read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(asUser(getEnv(), PLAIN_MEMBER), `moderationEvents/${EVENT}`)));
    });

    it('an outsider cannot read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(asUser(getEnv(), OUTSIDER), `moderationEvents/${EVENT}`)));
    });

    it('anonymous cannot read', async () => {
      await seedFixtures();
      await assertFails(getDoc(doc(asAnon(getEnv()), `moderationEvents/${EVENT}`)));
    });
  });

  describe('write (server-side only — all client writes denied)', () => {
    it('a village admin cannot create an event', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertFails(setDoc(doc(db, 'moderationEvents/new-1'), moderationEvent(MUNI)));
    });

    it('an app admin cannot create an event', async () => {
      await seedFixtures();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertFails(setDoc(doc(db, 'moderationEvents/new-2'), moderationEvent(MUNI)));
    });

    it('a village admin cannot rewrite an event', async () => {
      await seedFixtures();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertFails(updateDoc(doc(db, `moderationEvents/${EVENT}`), { action: 'unhide' }));
    });

    it('an app admin cannot delete an event', async () => {
      await seedFixtures();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertFails(deleteDoc(doc(db, `moderationEvents/${EVENT}`)));
    });
  });
});
