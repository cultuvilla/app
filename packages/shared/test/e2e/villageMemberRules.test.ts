// Firestore Rules e2e test for collection-group queries on 'members'.
// Verifies: a signed-in user can list their own membership rows across all
// municipalities via a collection-group query, and can also list another
// user's memberships (member docs are individually public, so this is an
// intentional relaxation for public profile screens); anonymous users
// cannot list at all; and direct per-doc reads continue to work for anyone
// (regression guard).
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  collectionGroup,
  where,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const ALICE = 'alice';
const BOB = 'bob';
const NOW = new Date();

async function seedActiveMunicipality(id = 'mActive') {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `municipalities/${id}`), { name: 'Activo', communityActive: true });
  });
}

async function seedInactiveMunicipality(id = 'mInactive') {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `municipalities/${id}`), { name: 'Inactivo', communityActive: false });
  });
}

function memberDocData() {
  return {
    userId: ALICE,
    role: 'user',
    joinedAt: NOW,
    profileAnswers: {},
    profileCompletedAt: null,
  };
}

async function seedAliceMemberships() {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'municipalities/m1'), { name: 'Salamanca' });
    await setDoc(doc(db, 'municipalities/m1/members/alice'), {
      userId: ALICE,
      role: 'member',
      joinedAt: NOW,
    });
    await setDoc(doc(db, 'municipalities/m2'), { name: 'Ávila' });
    await setDoc(doc(db, 'municipalities/m2/members/alice'), {
      userId: ALICE,
      role: 'member',
      joinedAt: NOW,
    });
  });
}

describe('firestore.rules — members collection-group', () => {
  it('signed-in user can list their own memberships via collection group', async () => {
    await seedAliceMemberships();
    const db = asUser(getEnv(), ALICE);
    await assertSucceeds(
      getDocs(query(collectionGroup(db, 'members'), where('userId', '==', ALICE))),
    );
  });

  it('signed-in user can list ANOTHER user\'s memberships via collection group', async () => {
    await seedAliceMemberships();
    const db = asUser(getEnv(), BOB);
    await assertSucceeds(
      getDocs(query(collectionGroup(db, 'members'), where('userId', '==', ALICE))),
    );
  });

  it('anonymous user cannot list memberships via collection group', async () => {
    await seedAliceMemberships();
    const db = asAnon(getEnv());
    await assertFails(
      getDocs(query(collectionGroup(db, 'members'), where('userId', '==', ALICE))),
    );
  });

  it('regression: direct doc read on /municipalities/{m}/members/{uid} still works for anyone', async () => {
    await seedAliceMemberships();
    const db = asAnon(getEnv());
    await assertSucceeds(getDoc(doc(db, 'municipalities/m1/members/alice')));
  });
});

describe('firestore.rules — self-join membership create', () => {
  it('owner can self-join an active village as role user', async () => {
    await seedActiveMunicipality();
    const db = asUser(getEnv(), ALICE);
    await assertSucceeds(
      setDoc(doc(db, 'municipalities/mActive/members/alice'), memberDocData()),
    );
  });

  it('owner cannot self-join an inactive village', async () => {
    await seedInactiveMunicipality();
    const db = asUser(getEnv(), ALICE);
    await assertFails(
      setDoc(doc(db, 'municipalities/mInactive/members/alice'), memberDocData()),
    );
  });

  it('owner cannot self-join as role admin', async () => {
    await seedActiveMunicipality();
    const db = asUser(getEnv(), ALICE);
    await assertFails(
      setDoc(doc(db, 'municipalities/mActive/members/alice'), {
        ...memberDocData(),
        role: 'admin',
      }),
    );
  });

  it('user cannot create a membership doc for someone else', async () => {
    await seedActiveMunicipality();
    const db = asUser(getEnv(), 'mallory');
    await assertFails(
      setDoc(doc(db, 'municipalities/mActive/members/alice'), memberDocData()),
    );
  });

  it('anonymous user cannot self-join', async () => {
    await seedActiveMunicipality();
    const db = asAnon(getEnv());
    await assertFails(
      setDoc(doc(db, 'municipalities/mActive/members/alice'), memberDocData()),
    );
  });

});

describe('firestore.rules — member doc no longer carries barrioId', () => {
  async function seedAliceMember() {
    await seed(getEnv(), async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'municipalities/mActive'), { name: 'Activo', communityActive: true });
      await setDoc(doc(db, 'municipalities/mActive/members/alice'), memberDocData());
    });
  }

  it('owner CANNOT write barrioId on their membership (residence lives on the person)', async () => {
    // Residence barrio is single-source-of-truth on persons.municipalityLinks;
    // the owner update rule no longer allows barrioId.
    await seedAliceMember();
    const db = asUser(getEnv(), ALICE);
    await assertFails(
      updateDoc(doc(db, 'municipalities/mActive/members/alice'), { barrioId: 'centro' }),
    );
  });

  it('owner CAN mark their censo complete on the membership', async () => {
    await seedAliceMember();
    const db = asUser(getEnv(), ALICE);
    await assertSucceeds(
      updateDoc(doc(db, 'municipalities/mActive/members/alice'), { profileCompletedAt: NOW }),
    );
  });

  // Census answers live in censoAnswers/, never on the public member doc.
  it('owner CANNOT write census answers onto the membership', async () => {
    await seedAliceMember();
    const db = asUser(getEnv(), ALICE);
    await assertFails(
      updateDoc(doc(db, 'municipalities/mActive/members/alice'), {
        profileAnswers: { q1: 'a' },
      }),
    );
  });

  it('a self-join CANNOT carry census answers on the membership', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'municipalities/mActive'), {
        name: 'Activo',
        communityActive: true,
      });
    });
    const db = asUser(getEnv(), ALICE);
    await assertFails(
      setDoc(doc(db, 'municipalities/mActive/members/alice'), {
        ...memberDocData(),
        profileAnswers: { q1: 'a' },
      }),
    );
  });
});

describe('firestore.rules — member role is function-owned (admins go through the callable)', () => {
  const VADMIN = 'vadmin';

  async function seedVillageWithAdmin() {
    await seed(getEnv(), async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'municipalities/mActive'), { name: 'Activo', communityActive: true });
      await setDoc(doc(db, 'municipalities/mActive/members/vadmin'), {
        ...memberDocData(),
        userId: VADMIN,
        role: 'admin',
      });
      await setDoc(doc(db, 'municipalities/mActive/members/alice'), memberDocData());
    });
  }

  it('a village admin CANNOT create a member with role admin from the client', async () => {
    await seedVillageWithAdmin();
    const db = asUser(getEnv(), VADMIN);
    await assertFails(
      setDoc(doc(db, 'municipalities/mActive/members/bob'), {
        ...memberDocData(),
        userId: 'bob',
        role: 'admin',
      }),
    );
  });

  it('a village admin CAN add a plain member (role user)', async () => {
    await seedVillageWithAdmin();
    const db = asUser(getEnv(), VADMIN);
    await assertSucceeds(
      setDoc(doc(db, 'municipalities/mActive/members/bob'), {
        ...memberDocData(),
        userId: 'bob',
      }),
    );
  });

  it('a village admin CANNOT promote a member to admin via a client update', async () => {
    await seedVillageWithAdmin();
    const db = asUser(getEnv(), VADMIN);
    await assertFails(
      updateDoc(doc(db, 'municipalities/mActive/members/alice'), { role: 'admin' }),
    );
  });

  it('a village admin CAN still update a member non-role field (profileCompletedAt)', async () => {
    await seedVillageWithAdmin();
    const db = asUser(getEnv(), VADMIN);
    await assertSucceeds(
      updateDoc(doc(db, 'municipalities/mActive/members/alice'), { profileCompletedAt: NOW }),
    );
  });
});
