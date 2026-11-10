// packages/shared/test/e2e/cosatecaRules.test.ts
// The cosateca: who sees a group's cosas (its integrantes, or the pueblo when
// the group opened it), who offers and edits them, and who may ask. Every
// later move of a request is the callable's, so clients never update one.
import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const MUN = 'mun1';
const OPEN = 'ayto';
const CLOSED = 'pena';

function cosa(overrides: Record<string, unknown> = {}) {
  return {
    municipalityId: MUN, orgId: CLOSED, audience: 'integrantes', ownerUid: 'member1', ownerName: 'Ana',
    kind: 'prestamo', title: 'Taladro', description: null, category: 'herramientas', imageURL: null, conditions: null,
    status: 'available', heldBy: null, createdBy: 'member1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function request(uid: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    municipalityId: MUN, orgId: OPEN, cosaId: 'llave', cosaTitle: 'Llave del gimnasio', cosaKind: 'prestamo', ownerUid: null,
    requesterUid: uid, requesterName: name, message: null, fromOn: null, untilOn: null, status: 'pending',
    createdAt: serverTimestamp(), respondedAt: null, closedAt: null, overdueNotifiedOn: null, ...overrides,
  };
}

async function seed() {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${OPEN}`), {
      name: 'Ayuntamiento', type: 'ayuntamiento', status: 'approved', municipalityId: MUN, cosateca: { enabled: true, audience: 'pueblo' },
    });
    await setDoc(doc(db, `organizations/${CLOSED}`), {
      name: 'Peña', type: 'peña', status: 'approved', municipalityId: MUN, cosateca: { enabled: true, audience: 'integrantes' },
    });
    await setDoc(doc(db, 'organizations/off'), { name: 'Off', type: 'peña', status: 'approved', municipalityId: MUN });
    for (const [org, uid, role] of [
      [OPEN, 'admin1', 'admin'], [CLOSED, 'admin2', 'admin'], [CLOSED, 'member1', 'member'], [CLOSED, 'member2', 'member'], ['off', 'member1', 'member'],
    ]) {
      await setDoc(doc(db, `organizations/${org}/members/${uid}`), { userId: uid, joinedAt: new Date(), role });
    }
    for (const [uid, name] of [['admin1', 'Alcalde'], ['admin2', 'Pepa'], ['member1', 'Ana'], ['member2', 'Luis'], ['vecino', 'Vecino'], ['forastero', 'Forastero']]) {
      await setDoc(doc(db, `publicProfiles/${uid}`), { displayName: name });
    }
    for (const uid of ['admin1', 'member1', 'member2', 'vecino']) {
      await setDoc(doc(db, `municipalities/${MUN}/members/${uid}`), { role: 'user' });
    }
    await setDoc(doc(db, 'cosas/taladro'), { ...cosa(), createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, 'cosas/llave'), {
      ...cosa({ orgId: OPEN, audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', title: 'Llave del gimnasio', category: 'deporte', createdBy: 'admin1' }),
      createdAt: new Date(), updatedAt: new Date(),
    });
    await setDoc(doc(db, 'cosaRequests/r1'), { ...request('vecino', 'Vecino'), createdAt: new Date() });
  });
}

const cosaRef = (uid: string, id: string) => doc(asUser(getEnv(), uid), `cosas/${id}`);
const requestRef = (uid: string, id: string) => doc(asUser(getEnv(), uid), `cosaRequests/${id}`);

beforeEach(async () => {
  await seed();
});

describe('cosas: reading', () => {
  it('integrantes read their group’s cosateca; the rest of the pueblo does not', async () => {
    await assertSucceeds(getDocs(query(collection(asUser(getEnv(), 'member2'), 'cosas'), where('orgId', '==', CLOSED))));
    await assertFails(getDoc(cosaRef('vecino', 'taladro')));
  });

  it('a pueblo cosateca is read by any village member, never by an outsider', async () => {
    await assertSucceeds(
      getDocs(query(collection(asUser(getEnv(), 'vecino'), 'cosas'), where('municipalityId', '==', MUN), where('audience', '==', 'pueblo'))),
    );
    await assertSucceeds(getDoc(cosaRef('vecino', 'llave')));
    await assertFails(getDoc(cosaRef('forastero', 'llave')));
  });
});

describe('cosas: offering', () => {
  it('an integrante offers their own under their public name', async () => {
    await assertSucceeds(setDoc(cosaRef('member1', 'n1'), cosa()));
  });

  it('an admin offers the group’s under the group’s name, with the group’s audience', async () => {
    await assertSucceeds(
      setDoc(cosaRef('admin1', 'n2'), cosa({ orgId: OPEN, audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', createdBy: 'admin1' })),
    );
  });

  it('refuses the wrong owner, audience, name or shape', async () => {
    const bad: [string, Record<string, unknown>][] = [
      ['member2', { createdBy: 'member2' }], // someone else's cosa
      ['member1', { ownerName: 'Otra' }],
      ['member1', { audience: 'pueblo' }],
      ['member1', { ownerUid: null, ownerName: 'Peña' }], // only admins offer the group's
      ['member1', { status: 'given' }],
      ['member1', { heldBy: { requestId: 'r', uid: 'x', name: 'X', untilOn: null } }],
      ['member1', { municipalityId: 'other' }],
      ['member1', { title: '' }],
      ['member1', { category: 'coches' }],
      ['member1', { extra: true }],
      ['member1', { orgId: 'off' }], // that group runs no cosateca
      ['vecino', { ownerUid: 'vecino', ownerName: 'Vecino', createdBy: 'vecino' }], // not an integrante
    ];
    for (const [uid, overrides] of bad) await assertFails(setDoc(cosaRef(uid, 'nx'), cosa(overrides)));
  });
});

describe('cosas: editing', () => {
  const edit = { title: 'Taladro percutor', status: 'paused', updatedAt: serverTimestamp() };

  it('the owner and the group’s admins edit and delete it', async () => {
    await assertSucceeds(updateDoc(cosaRef('member1', 'taladro'), edit));
    await assertSucceeds(updateDoc(cosaRef('admin2', 'taladro'), { status: 'available', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(cosaRef('admin2', 'taladro')));
  });

  it('nobody else, and nobody touches the function-owned fields', async () => {
    await assertFails(updateDoc(cosaRef('member2', 'taladro'), edit));
    await assertFails(deleteDoc(cosaRef('member2', 'taladro')));
    await assertFails(updateDoc(cosaRef('member1', 'taladro'), { audience: 'pueblo', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(cosaRef('member1', 'taladro'), { heldBy: { requestId: 'r', uid: 'x', name: 'X', untilOn: null }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(cosaRef('member1', 'taladro'), { status: 'given', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(cosaRef('member1', 'taladro'), { ownerUid: 'member2', updatedAt: serverTimestamp() }));
  });

  it('nobody changes what kind of cosa it is: its requests walk the kind they copied', async () => {
    await assertFails(updateDoc(cosaRef('member1', 'taladro'), { kind: 'regalo', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(cosaRef('admin2', 'taladro'), { kind: 'servicio', updatedAt: serverTimestamp() }));
  });
});

describe('cosaRequests', () => {
  it('a village member asks for a pueblo cosa as themself', async () => {
    await assertSucceeds(setDoc(requestRef('vecino', 'n1'), request('vecino', 'Vecino', { fromOn: '2026-07-01', untilOn: '2026-07-03' })));
  });

  it('an integrante asks for a cosa of their group', async () => {
    await assertSucceeds(
      setDoc(requestRef('member2', 'n2'), request('member2', 'Luis', { orgId: CLOSED, cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'member1' })),
    );
  });

  it('refuses asking for another, copying the cosa wrong, or what you may not see', async () => {
    const bad: [string, Record<string, unknown>][] = [
      ['vecino', { requesterUid: 'member2' }],
      ['vecino', { requesterName: 'Otro' }],
      ['vecino', { status: 'accepted' }],
      ['vecino', { cosaTitle: 'Otra cosa' }],
      ['vecino', { ownerUid: 'admin1' }],
      ['vecino', { fromOn: '2026-07-05', untilOn: '2026-07-01' }],
      ['vecino', { orgId: CLOSED, cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'member1' }], // integrantes only
      ['forastero', {}],
    ];
    for (const [uid, overrides] of bad) {
      const name = uid === 'forastero' ? 'Forastero' : 'Vecino';
      await assertFails(setDoc(requestRef(uid, 'nx'), request(uid, name, overrides)));
    }
  });

  it('nobody asks once the group has switched its cosateca off, or while the group is not approved', async () => {
    const taladro = request('member2', 'Luis', { orgId: CLOSED, cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'member1' });
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `organizations/${CLOSED}`), { cosateca: { enabled: false, audience: 'integrantes' } });
    });
    await assertFails(setDoc(requestRef('member2', 'n4'), taladro));
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `organizations/${CLOSED}`), { status: 'pending', cosateca: { enabled: true, audience: 'integrantes' } });
    });
    await assertFails(setDoc(requestRef('member2', 'n4'), taladro));
  });

  it('nobody asks for their own cosa', async () => {
    await assertFails(
      setDoc(requestRef('member1', 'n3'), request('member1', 'Ana', { orgId: CLOSED, cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'member1' })),
    );
  });

  it('the requester and the group’s admins read it; others do not', async () => {
    await assertSucceeds(getDoc(requestRef('vecino', 'r1')));
    await assertSucceeds(getDoc(requestRef('admin1', 'r1')));
    await assertSucceeds(getDocs(query(collection(asUser(getEnv(), 'admin1'), 'cosaRequests'), where('orgId', '==', OPEN))));
    await assertSucceeds(getDocs(query(collection(asUser(getEnv(), 'vecino'), 'cosaRequests'), where('requesterUid', '==', 'vecino'))));
    await assertFails(getDoc(requestRef('member2', 'r1')));
  });

  it('no client moves a request on or deletes it', async () => {
    await assertFails(updateDoc(requestRef('admin1', 'r1'), { status: 'accepted' }));
    await assertFails(updateDoc(requestRef('vecino', 'r1'), { status: 'cancelled' }));
    await assertFails(deleteDoc(requestRef('vecino', 'r1')));
  });
});

describe('organizations.cosateca', () => {
  it('an admin turns the cosateca on and opens it to the pueblo, in a well-formed setting only', async () => {
    const org = (uid: string) => doc(asUser(getEnv(), uid), `organizations/${CLOSED}`);
    await assertSucceeds(updateDoc(org('admin2'), { cosateca: { enabled: true, audience: 'pueblo' } }));
    await assertFails(updateDoc(org('admin2'), { cosateca: { enabled: true, audience: 'mundo' } }));
    await assertFails(updateDoc(org('admin2'), { cosateca: { enabled: 'yes', audience: 'pueblo' } }));
    await assertFails(updateDoc(org('member1'), { cosateca: { enabled: false, audience: 'integrantes' } }));
  });
});
