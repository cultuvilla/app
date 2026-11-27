// Integration test: write a municipality to the Firestore emulator and read
// it back. Verifies the data layer (factory output, wire-format roundtrip),
// not the security rules — those are covered in test/e2e/villageRules.test.ts.
// Writes bypass rules via withSecurityRulesDisabled.
import { describe, it, expect } from 'vitest';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { seed, firestoreOf } from '../helpers/roles';
import { makeMunicipality, makeActiveCommunity } from '../factories/villageFactory';

const getEnv = useRulesTestEnv();

describe('municipality roundtrip (emulator)', () => {
  it('persists a municipality and reads the same data back', async () => {
    const municipality = makeMunicipality({ name: 'Roundtrip Municipality' });
    let docId = '';
    await seed(getEnv(), async (ctx) => {
      const db = firestoreOf(ctx);
      const ref = await addDoc(collection(db, 'municipalities'), municipality);
      docId = ref.id;

      const snap = await getDoc(doc(db, 'municipalities', docId));
      expect(snap.exists()).toBe(true);
      const data = snap.data();
      expect(data?.name).toBe('Roundtrip Municipality');
      expect(data?.province).toBe('Salamanca');
      expect(data?.communityActive).toBe(false);
      expect(data?.community).toBeNull();
    });
  });

  it('persists a municipality with an active community', async () => {
    const municipality = makeActiveCommunity({ name: 'Active Community' });
    await seed(getEnv(), async (ctx) => {
      const db = firestoreOf(ctx);
      const ref = await addDoc(collection(db, 'municipalities'), municipality);

      const snap = await getDoc(doc(db, 'municipalities', ref.id));
      const data = snap.data() as
        | { communityActive?: boolean; community?: { organizerId?: string } }
        | undefined;
      expect(data?.communityActive).toBe(true);
      expect(data?.community?.organizerId).toBe('test-admin');
    });
  });
});
