// firestore.rules — an organization's join policy.
//
// `open` orgs keep instant self-service joining. `approval` orgs take join
// requests instead, which an org admin resolves through the
// respondToOrgJoinRequest callable; only they may hold private events.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collectionGroup,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asUser, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const MID = 'mun1';
const OPEN = 'openOrg';
const CLOSED = 'closedOrg';
const LEGACY = 'legacyOrg';

const member = (userId: string, role = 'member') => ({ userId, joinedAt: new Date(), role });
const joinRequest = (userId: string) => ({
  userId,
  orgId: CLOSED,
  municipalityId: MID,
  createdAt: new Date(),
});

beforeEach(async () => {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    const org = (joinPolicy?: string) => ({
      name: 'Peña',
      type: 'peña',
      status: 'approved',
      municipalityId: MID,
      requestedBy: 'founder',
      ...(joinPolicy ? { joinPolicy } : {}),
    });
    await setDoc(doc(db, `organizations/${OPEN}`), org('open'));
    await setDoc(doc(db, `organizations/${CLOSED}`), org('approval'));
    await setDoc(doc(db, `organizations/${LEGACY}`), org());
    for (const orgId of [OPEN, CLOSED, LEGACY]) {
      await setDoc(doc(db, `organizations/${orgId}/members/founder`), member('founder', 'admin'));
    }
    await setDoc(doc(db, `organizations/${CLOSED}/members/socio`), member('socio'));
    await setDoc(doc(db, `organizations/${CLOSED}/joinRequests/pending`), joinRequest('pending'));
  });
});

describe('self-join follows the org join policy', () => {
  it('anyone may self-join an open org', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertSucceeds(setDoc(doc(db, `organizations/${OPEN}/members/joiner`), member('joiner')));
  });

  it('an org without a policy set is open', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertSucceeds(setDoc(doc(db, `organizations/${LEGACY}/members/joiner`), member('joiner')));
  });

  it('nobody may self-join an approval org', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertFails(setDoc(doc(db, `organizations/${CLOSED}/members/joiner`), member('joiner')));
  });

  it('an org admin may still add someone to an approval org', async () => {
    const db = asUser(getEnv(), 'founder');
    await assertSucceeds(setDoc(doc(db, `organizations/${CLOSED}/members/joiner`), member('joiner')));
  });
});

describe('join requests', () => {
  const path = (uid: string, orgId = CLOSED) => `organizations/${orgId}/joinRequests/${uid}`;

  it('a user may ask to join an approval org', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertSucceeds(setDoc(doc(db, path('joiner')), joinRequest('joiner')));
  });

  it('an open org takes no requests (just join it)', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertFails(setDoc(doc(db, path('joiner', OPEN)), { ...joinRequest('joiner'), orgId: OPEN }));
  });

  it('nobody may file a request on behalf of someone else', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertFails(setDoc(doc(db, path('victim')), joinRequest('victim')));
  });

  it('a current member cannot request again', async () => {
    const db = asUser(getEnv(), 'socio');
    await assertFails(setDoc(doc(db, path('socio')), joinRequest('socio')));
  });

  it('rejects an unknown field', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertFails(setDoc(doc(db, path('joiner')), { ...joinRequest('joiner'), note: 'hola' }));
  });

  it('the requester and org admins can read a request; others cannot', async () => {
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'pending'), path('pending'))));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'founder'), path('pending'))));
    await assertFails(getDoc(doc(asUser(getEnv(), 'socio'), path('pending'))));
  });

  it('org admins can list the org requests; plain members cannot', async () => {
    const reqs = `organizations/${CLOSED}/joinRequests`;
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'founder'), reqs)));
    await assertFails(getDocs(collection(asUser(getEnv(), 'socio'), reqs)));
  });

  it('a user can list their own requests across orgs, and only theirs', async () => {
    const mine = (uid: string) =>
      query(collectionGroup(asUser(getEnv(), uid), 'joinRequests'), where('userId', '==', uid));
    await assertSucceeds(getDocs(mine('pending')));
    await assertFails(getDocs(collectionGroup(asUser(getEnv(), 'pending'), 'joinRequests')));
  });

  it('the requester may withdraw; nobody may edit a request', async () => {
    await assertFails(
      updateDoc(doc(asUser(getEnv(), 'founder'), path('pending')), { createdAt: new Date() }),
    );
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'pending'), path('pending'))));
  });

  it('an app admin can read any request', async () => {
    const adminDb = await asAdmin(getEnv(), 'sadmin');
    await assertSucceeds(getDoc(doc(adminDb, path('pending'))));
  });
});

describe('join policy on the org doc', () => {
  it('an org admin may switch the policy', async () => {
    const db = asUser(getEnv(), 'founder');
    await assertSucceeds(updateDoc(doc(db, `organizations/${OPEN}`), { joinPolicy: 'approval' }));
  });

  it('rejects an unknown policy value', async () => {
    const db = asUser(getEnv(), 'founder');
    await assertFails(updateDoc(doc(db, `organizations/${OPEN}`), { joinPolicy: 'invite' }));
  });
});
