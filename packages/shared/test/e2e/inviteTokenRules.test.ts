// Firestore Rules e2e test: village invite tokens are retired, so no client —
// signed out, villager or admin — can read or write them.
import { describe, it } from 'vitest';
import { assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asAnon, asUser, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const MUNI = 'muni-1';
const tokens = `municipalities/${MUNI}/inviteTokens`;

async function seedVillage() {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `municipalities/${MUNI}`), { communityActive: true });
    await setDoc(doc(db, `municipalities/${MUNI}/members/vadmin`), { userId: 'vadmin', role: 'admin' });
    await setDoc(doc(db, `${tokens}/tok-1`), { createdAt: new Date(), usageCount: 0 });
  });
}

describe('firestore.rules — retired inviteTokens are closed to every client', () => {
  it('denies get and list to a signed-out visitor', async () => {
    await seedVillage();
    await assertFails(getDoc(doc(asAnon(getEnv()), `${tokens}/tok-1`)));
    await assertFails(getDocs(collection(asAnon(getEnv()), tokens)));
  });

  it('denies the village admin too, reading or minting', async () => {
    await seedVillage();
    const db = asUser(getEnv(), 'vadmin');
    await assertFails(getDocs(collection(db, tokens)));
    await assertFails(setDoc(doc(db, `${tokens}/tok-2`), { createdAt: new Date(), usageCount: 0 }));
  });

  it('denies an app admin', async () => {
    await seedVillage();
    const adminDb = await asAdmin(getEnv(), 'sadmin');
    await assertFails(getDoc(doc(adminDb, `${tokens}/tok-1`)));
  });
});
