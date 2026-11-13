// Firestore Rules e2e test for studioPairings, the server-only web studio
// sign-in pairings. A pairing id rides in a public QR code, and an approved
// pairing redeems a session for its user, so no client — signed in or not, the
// approving user included — may read or write one.
import { describe, it } from 'vitest';
import { assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asAnon, asUser, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const USER = 'uid-user';
const PATH = 'studioPairings/pairing-1';

function seedPairing(data: Record<string, unknown>): Promise<void> {
  return seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, PATH), data);
  });
}

const pairing = () => ({
  claimSecretHash: 'abc',
  code: 'K7P2',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  uid: USER,
  approvedAt: new Date(),
});

describe('firestore.rules — studioPairings', () => {
  it('hides a pairing from everyone, its own user and app admins included', async () => {
    await seedPairing(pairing());
    await assertFails(getDoc(doc(asAnon(getEnv()), PATH)));
    await assertFails(getDoc(doc(asUser(getEnv(), USER), PATH)));
    await assertFails(getDoc(doc(await asAdmin(getEnv(), 'uid-admin'), PATH)));
    await assertFails(getDocs(collection(asUser(getEnv(), USER), 'studioPairings')));
  });

  it('lets no client create or approve a pairing', async () => {
    await assertFails(setDoc(doc(asAnon(getEnv()), PATH), { ...pairing(), uid: null }));
    await seedPairing({ ...pairing(), uid: null, approvedAt: null });
    await assertFails(updateDoc(doc(asUser(getEnv(), USER), PATH), { uid: USER }));
  });
});
