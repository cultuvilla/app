// packages/shared/test/e2e/socioRules.test.ts
// The socio roster: who reads names, who reads contact data, who adds whom.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const ORG = 'org1';
const AYTO = 'ayto1';

function socio(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'typed',
    displayName: 'Paco',
    uid: null,
    personId: null,
    responsibleUid: null,
    adminTitle: null,
    altaAt: new Date(),
    bajaAt: null,
    createdBy: 'admin1',
    ...overrides,
  };
}

async function seed(sociosListVisible = false) {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const org = { name: 'Asociación', type: 'asociación', status: 'approved', municipalityId: 'mun1', sociosListVisible };
    await setDoc(doc(db, `organizations/${ORG}`), org);
    await setDoc(doc(db, `organizations/${AYTO}`), { ...org, type: 'ayuntamiento' });
    for (const [uid, role] of [['admin1', 'admin'], ['admin2', 'admin'], ['member1', 'member'], ['member2', 'member']]) {
      await setDoc(doc(db, `organizations/${ORG}/members/${uid}`), { userId: uid, joinedAt: new Date(), role });
    }
    await setDoc(doc(db, `organizations/${AYTO}/members/admin1`), { userId: 'admin1', joinedAt: new Date(), role: 'admin' });
    await setDoc(doc(db, `organizations/${ORG}/socios/m1`), socio({ kind: 'member', displayName: 'Uno', uid: 'member1', createdBy: 'member1' }));
    await setDoc(doc(db, `organizations/${ORG}/socios/m2`), socio({ kind: 'member', displayName: 'Dos', uid: 'member2', createdBy: 'member2' }));
    await setDoc(doc(db, `organizations/${ORG}/socios/a2`), socio({ kind: 'member', displayName: 'Admin', uid: 'admin2', createdBy: 'admin2' }));
    await setDoc(doc(db, `organizations/${ORG}/socios/p1`), socio({ kind: 'persona', displayName: 'Hija', personId: 'kid1', responsibleUid: 'member1', createdBy: 'member1' }));
    await setDoc(doc(db, `organizations/${ORG}/socios/t1`), socio());
    await setDoc(doc(db, `organizations/${ORG}/socioPrivate/m2`), { phone: '600', email: null, consentAnsweredAt: new Date() });
    await setDoc(doc(db, `organizations/${ORG}/socioPrivate/t1`), { phone: '611', email: null, consentAnsweredAt: null });
    await setDoc(doc(db, 'persons/kid2'), { createdBy: 'member1', isPublic: false, userId: null });
    await setDoc(doc(db, 'persons/stranger'), { createdBy: 'someoneElse', isPublic: true, userId: null });
  });
}

describe('socios — reads', () => {
  beforeEach(async () => { await seed(); });

  it('an org admin reads the whole roster', async () => {
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'admin1'), `organizations/${ORG}/socios`)));
  });

  it('a member cannot read the whole roster while the estatutos setting is off', async () => {
    await assertFails(getDocs(collection(asUser(getEnv(), 'member1'), `organizations/${ORG}/socios`)));
  });

  it('a member reads their own row and the personas they answer for', async () => {
    const db = asUser(getEnv(), 'member1');
    const coll = collection(db, `organizations/${ORG}/socios`);
    await assertSucceeds(getDocs(query(coll, where('uid', '==', 'member1'))));
    await assertSucceeds(getDocs(query(coll, where('responsibleUid', '==', 'member1'))));
    await assertFails(getDoc(doc(db, `organizations/${ORG}/socios/m2`)));
  });

  it('with the estatutos setting on, a member reads every name', async () => {
    await seed(true);
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'member1'), `organizations/${ORG}/socios`)));
  });

  it('a non-member never reads the roster, even with the setting on', async () => {
    await seed(true);
    await assertFails(getDocs(collection(asUser(getEnv(), 'outsider'), `organizations/${ORG}/socios`)));
  });
});

describe('socioPrivate — contact data', () => {
  beforeEach(async () => { await seed(true); });

  it('an org admin reads contact data', async () => {
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/socioPrivate/m2`)));
  });

  it('an org admin lists every contact doc; a member cannot', async () => {
    await assertSucceeds(getDocs(collection(asUser(getEnv(), 'admin1'), `organizations/${ORG}/socioPrivate`)));
    await assertFails(getDocs(collection(asUser(getEnv(), 'member1'), `organizations/${ORG}/socioPrivate`)));
  });

  it('a socio reads their own contact data', async () => {
    await assertSucceeds(getDoc(doc(asUser(getEnv(), 'member2'), `organizations/${ORG}/socioPrivate/m2`)));
  });

  it("a member never reads another socio's contact data, even with the list visible", async () => {
    await assertFails(getDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socioPrivate/m2`)));
  });

  it('a member answers the consent question for their own row', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socioPrivate/m1`), {
        phone: null, email: 'uno@x.es', consentAnsweredAt: new Date(),
      }),
    );
  });

  it("a member cannot write another member's contact data", async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socioPrivate/m2`), {
        phone: '6', email: null, consentAnsweredAt: new Date(),
      }),
    );
  });

  it("an admin cannot overwrite a member's own answer", async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/socioPrivate/m2`), {
        phone: '6', email: null, consentAnsweredAt: null,
      }),
    );
  });

  it('a contact doc with an unknown field is rejected', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socioPrivate/m1`), {
        phone: null, email: null, consentAnsweredAt: new Date(), address: 'x',
      }),
    );
  });
});

describe('socios — writes', () => {
  beforeEach(async () => { await seed(); });

  it('an admin types in a socio with contact data in one batch', async () => {
    const db = asUser(getEnv(), 'admin1');
    const batch = writeBatch(db);
    batch.set(doc(db, `organizations/${ORG}/socios/new1`), socio());
    batch.set(doc(db, `organizations/${ORG}/socioPrivate/new1`), { phone: '622', email: null, consentAnsweredAt: null });
    await assertSucceeds(batch.commit());
  });

  it('a plain member cannot type in a socio', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socios/new1`), socio({ createdBy: 'member1' })));
  });

  it('nobody creates a member row from the client', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/socios/new1`), socio({ kind: 'member', uid: 'member1' })),
    );
  });

  it('the ayuntamiento keeps no roster', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${AYTO}/socios/new1`), socio()));
  });

  it('a member adds a persona they created', async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socios/new1`),
        socio({ kind: 'persona', personId: 'kid2', responsibleUid: 'member1', createdBy: 'member1' }),
      ),
    );
  });

  it("a member cannot add someone else's persona", async () => {
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socios/new1`),
        socio({ kind: 'persona', personId: 'stranger', responsibleUid: 'member1', createdBy: 'member1' }),
      ),
    );
  });

  it('a non-member cannot add a persona', async () => {
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'persons/kid3'), { createdBy: 'outsider', isPublic: false, userId: null });
    });
    await assertFails(
      setDoc(
        doc(asUser(getEnv(), 'outsider'), `organizations/${ORG}/socios/new1`),
        socio({ kind: 'persona', personId: 'kid3', responsibleUid: 'outsider', createdBy: 'outsider' }),
      ),
    );
  });

  it('the responsible member gives their persona the baja', async () => {
    await assertSucceeds(updateDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socios/p1`), { bajaAt: serverTimestamp() }));
  });

  it("a member cannot give another member's row the baja", async () => {
    await assertFails(updateDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socios/m2`), { bajaAt: serverTimestamp() }));
  });

  it("an admin cannot give a member's own row the baja (that is leaving the org)", async () => {
    await assertFails(updateDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/socios/m2`), { bajaAt: serverTimestamp() }));
  });

  it('an admin gives a typed socio the baja, and nobody deletes a row', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(updateDoc(doc(db, `organizations/${ORG}/socios/t1`), { bajaAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, `organizations/${ORG}/socios/t1`)));
  });

  it('a baja date must be the server time', async () => {
    await assertFails(updateDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/socios/t1`), { bajaAt: new Date(2000, 0, 1) }));
  });

  it('an admin gives another admin a title, but not a plain member', async () => {
    const db = asUser(getEnv(), 'admin1');
    await assertSucceeds(updateDoc(doc(db, `organizations/${ORG}/socios/a2`), { adminTitle: 'tesorero' }));
    await assertFails(updateDoc(doc(db, `organizations/${ORG}/socios/m1`), { adminTitle: 'tesorero' }));
  });

  it('a plain member cannot set a title', async () => {
    await assertFails(updateDoc(doc(asUser(getEnv(), 'member1'), `organizations/${ORG}/socios/a2`), { adminTitle: 'presidente' }));
  });

  it('an unknown title is rejected', async () => {
    await assertFails(updateDoc(doc(asUser(getEnv(), 'admin1'), `organizations/${ORG}/socios/a2`), { adminTitle: 'rey' }));
  });
});
