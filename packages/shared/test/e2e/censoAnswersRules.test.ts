// Firestore Rules e2e test for censoAnswers/{municipalityId}_{userId}: a
// villager's census answers are readable by that villager, the village's
// admins and app admins — never by other villagers or signed-out visitors.
import { describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asAnon, asUser, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const MUNI = 'mActive';
const OTHER_MUNI = 'mOther';
const ALICE = 'alice';
const BOB = 'bob';
const VADMIN = 'vadmin';
const ALICE_DOC = `censoAnswers/${MUNI}_${ALICE}`;

const answers = (userId = ALICE, municipalityId = MUNI) => ({
  municipalityId,
  userId,
  profileAnswers: { hijos: true, llegada: 1990 },
  updatedAt: new Date(),
});

async function seedVillage(withAnswers = true) {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `municipalities/${MUNI}`), { communityActive: true });
    for (const [uid, role] of [[ALICE, 'user'], [BOB, 'user'], [VADMIN, 'admin']] as const) {
      await setDoc(doc(db, `municipalities/${MUNI}/members/${uid}`), { userId: uid, role });
    }
    if (withAnswers) await setDoc(doc(db, ALICE_DOC), answers());
  });
}

const byVillage = (db: ReturnType<typeof asAnon>) =>
  query(collection(db, 'censoAnswers'), where('municipalityId', '==', MUNI));

describe('firestore.rules — censoAnswers reads', () => {
  it('owner can get their own answers', async () => {
    await seedVillage();
    await assertSucceeds(getDoc(doc(asUser(getEnv(), ALICE), ALICE_DOC)));
  });

  it('owner can get their own answers before any exist', async () => {
    await seedVillage(false);
    await assertSucceeds(getDoc(doc(asUser(getEnv(), ALICE), ALICE_DOC)));
  });

  it('another villager cannot get them', async () => {
    await seedVillage();
    await assertFails(getDoc(doc(asUser(getEnv(), BOB), ALICE_DOC)));
  });

  it('a signed-out visitor cannot get them', async () => {
    await seedVillage();
    await assertFails(getDoc(doc(asAnon(getEnv()), ALICE_DOC)));
  });

  it('the village admin can list the village answers', async () => {
    await seedVillage();
    await assertSucceeds(getDocs(byVillage(asUser(getEnv(), VADMIN))));
  });

  it('a plain villager cannot list the village answers', async () => {
    await seedVillage();
    await assertFails(getDocs(byVillage(asUser(getEnv(), BOB))));
  });

  it('nobody but an app admin can list the collection unfiltered', async () => {
    await seedVillage();
    await assertFails(getDocs(collection(asUser(getEnv(), VADMIN), 'censoAnswers')));
    const adminDb = await asAdmin(getEnv(), 'sadmin');
    await assertSucceeds(getDocs(collection(adminDb, 'censoAnswers')));
  });
});

describe('firestore.rules — censoAnswers writes', () => {
  it('owner can write their own answers for a village they belong to', async () => {
    await seedVillage(false);
    await assertSucceeds(setDoc(doc(asUser(getEnv(), ALICE), ALICE_DOC), answers()));
  });

  it("cannot write someone else's answers", async () => {
    await seedVillage(false);
    await assertFails(setDoc(doc(asUser(getEnv(), BOB), ALICE_DOC), answers()));
  });

  it('the doc id must be {municipalityId}_{uid}', async () => {
    await seedVillage(false);
    await assertFails(
      setDoc(doc(asUser(getEnv(), ALICE), `censoAnswers/${OTHER_MUNI}_${ALICE}`), answers()),
    );
  });

  it('cannot write answers for a village you are not a member of', async () => {
    await seedVillage(false);
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), ALICE), `censoAnswers/${OTHER_MUNI}_${ALICE}`),
        answers(ALICE, OTHER_MUNI),
      ),
    );
  });

  it('rejects an unknown field', async () => {
    await seedVillage(false);
    await assertFails(
      setDoc(doc(asUser(getEnv(), ALICE), ALICE_DOC), { ...answers(), sneaky: 1 }),
    );
  });

  // Its own village: under CI's live functions emulator, clearing the previous
  // test's members fires purgeMemberCensoAnswers, which could delete a freshly
  // seeded mActive answers doc before this test reaches it.
  it('owner and village admin may delete; another villager may not', async () => {
    const DEL = 'mDelete';
    const delDoc = `censoAnswers/${DEL}_${ALICE}`;
    await seed(getEnv(), async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `municipalities/${DEL}`), { communityActive: true });
      await setDoc(doc(db, `municipalities/${DEL}/members/${ALICE}`), { userId: ALICE, role: 'user' });
      await setDoc(doc(db, `municipalities/${DEL}/members/${BOB}`), { userId: BOB, role: 'user' });
      await setDoc(doc(db, `municipalities/${DEL}/members/${VADMIN}`), { userId: VADMIN, role: 'admin' });
      await setDoc(doc(db, delDoc), answers(ALICE, DEL));
    });
    await assertFails(deleteDoc(doc(asUser(getEnv(), BOB), delDoc)));
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), VADMIN), delDoc)));
  });
});
