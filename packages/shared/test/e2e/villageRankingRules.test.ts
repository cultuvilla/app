// Firestore Rules e2e test for /villageRankings/{rankingId}: public read so a
// guest's village page can show other pueblos, and function-owned writes so no
// client can push its own pueblo up the list.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const rankingPayload = () => ({
  computedAt: Timestamp.now(),
  villages: [
    { id: 'm1', name: 'Matabuena', slug: 'matabuena', province: 'Segovia', escudoUrl: null, manualEscudo: false, score: 9 },
  ],
});

describe('firestore.rules — /villageRankings/{rankingId}', () => {
  it('allows an unauthenticated client to read the ranking', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'villageRankings/top'), rankingPayload());
    });
    await assertSucceeds(getDoc(doc(asAnon(getEnv()), 'villageRankings/top')));
  });

  it('denies a client write to the ranking', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'uid-1'), 'villageRankings/top'), rankingPayload()));
  });
});
