// packages/shared/test/e2e/orgMemberRules.test.ts
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const MID = 'mun1';
const ORG = 'org1';

async function seed() {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${ORG}`), {
      name: 'Peña', description: null, imageURL: null, type: 'peña',
      status: 'approved', municipalityId: MID, requestedBy: 'creator',
      reviewedBy: 'vadmin', createdAt: new Date(), reviewedAt: new Date(),
    });
    await setDoc(doc(db, `organizations/${ORG}/members/creator`), { userId: 'creator', joinedAt: new Date(), role: 'admin' });
    await setDoc(doc(db, `organizations/${ORG}/members/member1`), { userId: 'member1', joinedAt: new Date(), role: 'member' });
    await setDoc(doc(db, `municipalities/${MID}/members/vadmin`), { userId: 'vadmin', role: 'admin', joinedAt: new Date(), profileAnswers: {}, profileCompletedAt: null });
  });
}

beforeEach(async () => { await seed(); });

describe('org members — roles', () => {
  it('nobody joins an org on their own: they ask, and an admin admits them', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertFails(setDoc(doc(db, `organizations/${ORG}/members/joiner`), { userId: 'joiner', joinedAt: new Date(), role: 'member' }));
  });

  it('a plain member cannot add a DIFFERENT user (no member-adds-member)', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertFails(setDoc(doc(db, `organizations/${ORG}/members/newbie`), { userId: 'newbie', joinedAt: new Date(), role: 'member' }));
  });

  it('an org admin can add another user as a plain member', async () => {
    const db = asUser(getEnv(), 'creator');
    await assertSucceeds(setDoc(doc(db, `organizations/${ORG}/members/newbie`), { userId: 'newbie', joinedAt: new Date(), role: 'member' }));
  });

  it('a user cannot self-join as an admin (role is function-owned)', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertFails(setDoc(doc(db, `organizations/${ORG}/members/joiner`), { userId: 'joiner', joinedAt: new Date(), role: 'admin' }));
  });

  it('a user cannot self-join with a mismatched userId (userId must equal the doc id)', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertFails(setDoc(doc(db, `organizations/${ORG}/members/joiner`), { userId: 'someoneElse', joinedAt: new Date(), role: 'member' }));
  });

  it('an org admin CANNOT change a role via client update (function-owned — use changeOrgMemberRole)', async () => {
    const db = asUser(getEnv(), 'creator');
    await assertFails(updateDoc(doc(db, `organizations/${ORG}/members/member1`), { role: 'admin' }));
  });

  it('an org admin CANNOT create an admin member from the client (role is function-owned)', async () => {
    const db = asUser(getEnv(), 'creator');
    await assertFails(setDoc(doc(db, `organizations/${ORG}/members/newadmin`), { userId: 'newadmin', joinedAt: new Date(), role: 'admin' }));
  });

  it('a plain member cannot change roles', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertFails(updateDoc(doc(db, `organizations/${ORG}/members/creator`), { role: 'member' }));
  });

  it('an org admin can remove a member', async () => {
    const db = asUser(getEnv(), 'creator');
    await assertSucceeds(deleteDoc(doc(db, `organizations/${ORG}/members/member1`)));
  });

  it('a member can remove themselves', async () => {
    const db = asUser(getEnv(), 'member1');
    await assertSucceeds(deleteDoc(doc(db, `organizations/${ORG}/members/member1`)));
  });

  it('a doc with an unknown field is rejected on create', async () => {
    const db = asUser(getEnv(), 'joiner');
    await assertFails(setDoc(doc(db, `organizations/${ORG}/members/joiner`), { userId: 'joiner', joinedAt: new Date(), role: 'member', evil: true }));
  });
});
