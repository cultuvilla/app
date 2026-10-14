// Firestore Rules e2e test for /municipalities/{municipalityId}.
// Verifies: anyone can read; only app admins can create; once a community
// is active, its admin can update the community subfield.
//
// Uses @firebase/rules-unit-testing to mount the live firestore.rules file
// against the firestore emulator and execute requests under different auth
// contexts.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, asAdmin, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

describe('firestore.rules — /municipalities/{municipalityId}', () => {
  it('anyone can read a municipality', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'municipalities/m1'), { name: 'Salamanca' });
    });

    const anon = asAnon(getEnv());
    await assertSucceeds(getDoc(doc(anon, 'municipalities/m1')));
  });

  it('non-admin cannot create a municipality', async () => {
    const alice = asUser(getEnv(), 'alice');
    await assertFails(setDoc(doc(alice, 'municipalities/m1'), { name: 'Nope' }));
  });

  it('app admin can create a municipality', async () => {
    const admin = await asAdmin(getEnv(), 'admin-1');
    await assertSucceeds(setDoc(doc(admin, 'municipalities/m1'), { name: 'Salamanca' }));
  });

  it('village admin can update the community subfield on their municipality', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'municipalities/m1'), {
        name: 'Salamanca',
        communityActive: true,
        community: { description: 'old' },
      });
      await setDoc(doc(ctx.firestore(), 'municipalities/m1/members/alice'), {
        role: 'admin',
      });
    });

    const alice = asUser(getEnv(), 'alice');
    await assertSucceeds(
      updateDoc(doc(alice, 'municipalities/m1'), { 'community.description': 'new' }),
    );
  });

  // community.fiestas rides the existing community allow-update: affectedKeys()
  // only reports the top-level `community` key, and fiestas is not on the
  // diff-lock list. Pinned so a future tightening of that list cannot silently
  // take the admin's ability to declare the village's fiestas away.
  it('village admin can declare community.fiestas', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'municipalities/m1'), {
        name: 'Matabuena',
        communityActive: true,
        community: { description: 'old', fiestas: [] },
      });
      await setDoc(doc(ctx.firestore(), 'municipalities/m1/members/alice'), { role: 'admin' });
    });

    const alice = asUser(getEnv(), 'alice');
    await assertSucceeds(
      updateDoc(doc(alice, 'municipalities/m1'), {
        'community.fiestas': [
          { id: 'agosto', name: 'Fiestas de agosto', anchor: { month: 8, day: 23, days: 6 }, years: {} },
        ],
      }),
    );
  });

  it('a plain member cannot declare community.fiestas', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'municipalities/m1'), {
        name: 'Matabuena',
        communityActive: true,
        community: { description: 'old', fiestas: [] },
      });
      await setDoc(doc(ctx.firestore(), 'municipalities/m1/members/bob'), { role: 'user' });
    });

    const bob = asUser(getEnv(), 'bob');
    await assertFails(
      updateDoc(doc(bob, 'municipalities/m1'), { 'community.fiestas': [] }),
    );
  });

  // peopleCount is a server-maintained counter shown to every visitor; a
  // village admin must not be able to inflate their pueblo's population.
  it('village admin cannot write peopleCount, but can still edit the village', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'municipalities/m1'), {
        name: 'Matabuena',
        communityActive: true,
        community: { description: 'old' },
        peopleCount: 12,
      });
      await setDoc(doc(ctx.firestore(), 'municipalities/m1/members/alice'), { role: 'admin' });
    });

    const alice = asUser(getEnv(), 'alice');
    await assertFails(updateDoc(doc(alice, 'municipalities/m1'), { peopleCount: 9000 }));
    await assertFails(
      updateDoc(doc(alice, 'municipalities/m1'), { 'community.description': 'new', peopleCount: 13 }),
    );
    await assertSucceeds(
      updateDoc(doc(alice, 'municipalities/m1'), { 'community.description': 'new' }),
    );
  });

  it('non-member cannot update a municipality', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'municipalities/m1'), { name: 'Salamanca' });
    });

    const bob = asUser(getEnv(), 'bob');
    await assertFails(updateDoc(doc(bob, 'municipalities/m1'), { name: 'Hacked' }));
  });
});
