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
    kind: 'prestamo', mode: 'prestamo', title: 'Taladro', description: null, category: 'herramientas', imageURL: null, conditions: null,
    location: null, locationNote: null, status: 'available', heldBy: null, reserva: null, createdBy: 'member1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function request(uid: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    municipalityId: MUN, orgId: OPEN, cosaId: 'llave', cosaTitle: 'Llave del gimnasio', cosaKind: 'prestamo', cosaMode: 'prestamo',
    ownerUid: null, holderUid: null, requesterUid: uid, requesterName: name, message: null, fromOn: null, untilOn: null, status: 'pending',
    createdAt: serverTimestamp(), respondedAt: null, closedAt: null, overdueNotifiedOn: null, startAt: null, endAt: null, ...overrides,
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
    await setDoc(doc(db, 'cosas/pista'), {
      ...cosa({
        orgId: OPEN, audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', title: 'Pista de pádel', category: 'deporte',
        kind: 'reserva', mode: null, reserva: reservaConfig({ blackouts: ['2026-12-25'] }), createdBy: 'admin1',
      }),
      createdAt: new Date(), updatedAt: new Date(),
    });
    await setDoc(doc(db, 'cosas/pista/slots/2026-11-12T17:00:00.000Z'), {
      requestId: 'b1', startAt: new Date('2026-11-12T17:00:00.000Z'), endAt: new Date('2026-11-12T18:00:00.000Z'), status: 'accepted',
    });
  });
}

const HOURS = { opensAt: '09:00', closesAt: '22:00' };
function reservaConfig(overrides: Record<string, unknown> = {}) {
  return {
    hours: { '1': HOURS, '2': HOURS, '3': HOURS, '4': HOURS, '5': HOURS, '6': null, '7': null },
    slotMinutes: 60, requiresApproval: false, maxActiveReservations: 2, bookingHorizonDays: 14, blackouts: [],
    ...overrides,
  };
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
      ['member1', { heldBy: { requestId: 'r', uid: 'x', name: 'X', untilOn: null, since: new Date() } }],
      ['member1', { mode: null }], // a prestamo has a mode
      ['member1', { mode: 'regalado' }],
      ['member1', { kind: 'regalo', mode: 'colectivizado' }], // only a prestamo has one
      ['member1', { locationNote: 'x'.repeat(121) }],
      ['member1', { location: { coordinates: { lat: 'norte', lng: -3 }, displayName: 'Plaza' } }],
      ['member1', { location: { coordinates: { lat: 40, lng: -3 } } }],
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

  it('nobody turns a prestamo colectivizado or back: its requests walk the mode they copied', async () => {
    await assertFails(updateDoc(cosaRef('member1', 'taladro'), { mode: 'colectivizado', updatedAt: serverTimestamp() }));
  });

  it('its manager says where it is kept: a pin and a note', async () => {
    await assertSucceeds(
      updateDoc(cosaRef('member1', 'taladro'), {
        location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'Calle Mayor 3' },
        locationNote: 'en el garaje',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(setDoc(cosaRef('member1', 'n5'), cosa({ mode: 'colectivizado', locationNote: 'almacén, estante 2' })));
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

  it('answers the Buzón’s queries: pending ones to my cosas, and to the group’s for its admins', async () => {
    const as = (uid: string) => collection(asUser(getEnv(), uid), 'cosaRequests');
    await assertSucceeds(getDocs(query(as('member1'), where('ownerUid', '==', 'member1'), where('status', '==', 'pending'))));
    await assertSucceeds(
      getDocs(query(as('admin1'), where('orgId', '==', OPEN), where('ownerUid', '==', null), where('status', '==', 'pending'))),
    );
    await assertSucceeds(getDocs(query(as('vecino'), where('requesterUid', '==', 'vecino'), where('status', '==', 'pending'))));
    await assertFails(
      getDocs(query(as('member2'), where('orgId', '==', OPEN), where('ownerUid', '==', null), where('status', '==', 'pending'))),
    );
  });

  it('no client moves a request on or deletes it', async () => {
    await assertFails(updateDoc(requestRef('admin1', 'r1'), { status: 'accepted' }));
    await assertFails(updateDoc(requestRef('vecino', 'r1'), { status: 'cancelled' }));
    await assertFails(deleteDoc(requestRef('vecino', 'r1')));
  });
});

describe('a colectivizado cosa', () => {
  const since = new Date('2026-10-03T10:00:00Z');
  beforeEach(async () => {
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // The peña's drill, colectivizado by member1 and held now by member2.
      await setDoc(doc(db, 'cosas/taladroComun'), {
        ...cosa({ mode: 'colectivizado', heldBy: { requestId: 'h1', uid: 'member2', name: 'Luis', untilOn: null, since } }),
        createdAt: new Date(), updatedAt: new Date(),
      });
      await setDoc(doc(db, 'cosaRequests/h2'), {
        ...request('admin2', 'Pepa', { orgId: CLOSED, cosaId: 'taladroComun', cosaTitle: 'Taladro', cosaMode: 'colectivizado', ownerUid: 'member1', holderUid: 'member2' }),
        createdAt: new Date(),
      });
    });
  });
  const ask = (uid: string, name: string, overrides: Record<string, unknown> = {}) =>
    request(uid, name, { orgId: CLOSED, cosaId: 'taladroComun', cosaTitle: 'Taladro', cosaMode: 'colectivizado', ownerUid: 'member1', holderUid: 'member2', ...overrides });

  it('is asked of its holder, with no return day — its owner may ask for it too', async () => {
    await assertSucceeds(setDoc(requestRef('admin2', 'c1'), ask('admin2', 'Pepa')));
    await assertSucceeds(setDoc(requestRef('member1', 'c2'), ask('member1', 'Ana')));
  });

  it('refuses its holder asking, a wrong holder, a mode copied wrong, or a return day', async () => {
    await assertFails(setDoc(requestRef('member2', 'cx'), ask('member2', 'Luis')));
    await assertFails(setDoc(requestRef('admin2', 'cx'), ask('admin2', 'Pepa', { holderUid: null })));
    await assertFails(setDoc(requestRef('admin2', 'cx'), ask('admin2', 'Pepa', { holderUid: 'member1' })));
    await assertFails(setDoc(requestRef('admin2', 'cx'), ask('admin2', 'Pepa', { cosaMode: 'prestamo' })));
    await assertFails(setDoc(requestRef('admin2', 'cx'), ask('admin2', 'Pepa', { untilOn: '2026-12-01' })));
  });

  it('a lent prestamo names no holder on its requests', async () => {
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'cosas/taladro'), { heldBy: { requestId: 'h9', uid: 'admin2', name: 'Pepa', untilOn: null, since } });
    });
    const taladro = { orgId: CLOSED, cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'member1' };
    await assertFails(setDoc(requestRef('member2', 'cy'), request('member2', 'Luis', { ...taladro, holderUid: 'admin2' })));
    await assertSucceeds(setDoc(requestRef('member2', 'cy'), request('member2', 'Luis', taladro)));
  });

  it('its holder reads the requests they answer, and finds them in the Buzón', async () => {
    await assertSucceeds(getDoc(requestRef('member2', 'h2')));
    await assertSucceeds(
      getDocs(query(collection(asUser(getEnv(), 'member2'), 'cosaRequests'), where('holderUid', '==', 'member2'), where('status', '==', 'pending'))),
    );
    await assertFails(
      getDocs(query(collection(asUser(getEnv(), 'member1'), 'cosaRequests'), where('holderUid', '==', 'member2'))),
    );
  });

  it('its holder talks in the request’s chat', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(getEnv(), 'member2'), 'cosaRequests/h2/chat/m1'), {
        authorUid: 'member2', authorName: 'Luis', body: 'Pásate por casa', createdAt: serverTimestamp(),
      }),
    );
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

describe("a request's chat", () => {
  const chatRef = (uid: string, requestId: string, id: string) => doc(asUser(getEnv(), uid), `cosaRequests/${requestId}/chat/${id}`);
  const chatOf = (uid: string, requestId: string) => collection(asUser(getEnv(), uid), `cosaRequests/${requestId}/chat`);
  const message = (uid: string, name: string, overrides: Record<string, unknown> = {}) => ({
    authorUid: uid, authorName: name, body: 'El sábado a las 10', createdAt: serverTimestamp(), ...overrides,
  });

  beforeEach(async () => {
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // A personal cosa's request: requester member2, owner member1, group CLOSED (admin2).
      await setDoc(doc(db, 'cosaRequests/r2'), {
        ...request('member2', 'Luis', { orgId: CLOSED, cosaId: 'taladro', cosaTitle: 'Taladro', ownerUid: 'member1' }),
        createdAt: new Date(),
      });
      await setDoc(doc(db, 'cosaRequests/r2/chat/m1'), { ...message('member2', 'Luis'), createdAt: new Date() });
      await setDoc(doc(db, `municipalities/${MUN}/members/alcaldesa`), { role: 'admin' });
    });
  });

  it("the request's parties read and write it: requester, owner and the group's admins", async () => {
    for (const uid of ['member2', 'member1', 'admin2']) await assertSucceeds(getDocs(chatOf(uid, 'r2')));
    await assertSucceeds(setDoc(chatRef('member2', 'r2', 'n1'), message('member2', 'Luis')));
    await assertSucceeds(setDoc(chatRef('member1', 'r2', 'n2'), message('member1', 'Ana')));
    await assertSucceeds(setDoc(chatRef('admin2', 'r2', 'n3'), message('admin2', 'Pepa')));
    // A group's own cosa: its requester (a villager) and the group's admins.
    await assertSucceeds(setDoc(chatRef('vecino', 'r1', 'n4'), message('vecino', 'Vecino')));
    await assertSucceeds(getDocs(chatOf('admin1', 'r1')));
  });

  it('nobody else reads or writes it, not even another integrante or the village team', async () => {
    for (const uid of ['admin1', 'vecino', 'alcaldesa', 'forastero']) {
      await assertFails(getDocs(chatOf(uid, 'r2')));
      await assertFails(setDoc(chatRef(uid, 'r2', 'nx'), message(uid, uid)));
    }
    // member2 is an integrante of CLOSED, not of the ayuntamiento's request.
    await assertFails(getDocs(chatOf('member2', 'r1')));
  });

  it('refuses a message under another name, as someone else, empty or too long, and any edit', async () => {
    await assertFails(setDoc(chatRef('member2', 'r2', 'nx'), message('member2', 'Otro')));
    await assertFails(setDoc(chatRef('member2', 'r2', 'nx'), message('member1', 'Ana')));
    await assertFails(setDoc(chatRef('member2', 'r2', 'nx'), message('member2', 'Luis', { body: '' })));
    await assertFails(setDoc(chatRef('member2', 'r2', 'nx'), message('member2', 'Luis', { body: 'x'.repeat(2001) })));
    await assertFails(setDoc(chatRef('member2', 'r2', 'nx'), message('member2', 'Luis', { extra: true })));
    await assertFails(updateDoc(chatRef('member2', 'r2', 'm1'), { body: 'Cambiado' }));
  });

  it("its author deletes a message, and so do the group's and the village's admins; the other party does not", async () => {
    await assertFails(deleteDoc(chatRef('member1', 'r2', 'm1')));
    await assertSucceeds(deleteDoc(chatRef('alcaldesa', 'r2', 'm1')));
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'cosaRequests/r2/chat/m2'), { ...message('member2', 'Luis'), createdAt: new Date() });
      await setDoc(doc(ctx.firestore(), 'cosaRequests/r2/chat/m3'), { ...message('member2', 'Luis'), createdAt: new Date() });
    });
    await assertSucceeds(deleteDoc(chatRef('member2', 'r2', 'm2')));
    await assertSucceeds(deleteDoc(chatRef('admin2', 'r2', 'm3')));
  });

  it("another village's admin cannot delete a message; an app admin can", async () => {
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'municipalities/otro-pueblo/members/alcalde-otro'), { role: 'admin' });
      await setDoc(doc(ctx.firestore(), 'admins/app-admin'), { createdAt: new Date() });
    });
    await assertFails(deleteDoc(chatRef('alcalde-otro', 'r2', 'm1')));
    await assertSucceeds(deleteDoc(chatRef('app-admin', 'r2', 'm1')));
  });

  it('closes to new messages 14 days after the request ended; old ones stay readable', async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const ended = (days: number, status = 'returned') =>
      getEnv().withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), 'cosaRequests/r2'), { status, closedAt: new Date(Date.now() - days * DAY) });
      });
    await ended(13);
    await assertSucceeds(setDoc(chatRef('member2', 'r2', 'd13'), message('member2', 'Luis')));
    await ended(15);
    await assertFails(setDoc(chatRef('member2', 'r2', 'd15'), message('member2', 'Luis')));
    await assertFails(setDoc(chatRef('member1', 'r2', 'd15b'), message('member1', 'Ana')));
    await assertSucceeds(getDocs(chatOf('member2', 'r2')));
    await ended(15, 'declined');
    await assertFails(setDoc(chatRef('admin2', 'r2', 'd15c'), message('admin2', 'Pepa')));
    // Still in play, however old: open.
    await ended(400, 'lent');
    await assertSucceeds(setDoc(chatRef('member2', 'r2', 'd400'), message('member2', 'Luis')));
  });

  it('there is no chat under a request that does not exist', async () => {
    // The names are the ones their public profiles carry, so only the missing request refuses them.
    for (const [uid, name] of [['member1', 'Ana'], ['member2', 'Luis'], ['admin2', 'Pepa']] as const) {
      await assertFails(setDoc(chatRef(uid, 'gone', 'nx'), message(uid, name)));
      await assertFails(getDocs(chatOf(uid, 'gone')));
    }
  });
});

describe('reservas', () => {
  const pista = (overrides: Record<string, unknown> = {}) =>
    cosa({
      orgId: OPEN, audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', title: 'Pista de pádel', category: 'deporte',
      kind: 'reserva', mode: null, reserva: reservaConfig(), createdBy: 'admin1', ...overrides,
    });

  it('an admin offers a reserva with its weekly hours, and no closed days yet', async () => {
    await assertSucceeds(setDoc(cosaRef('admin1', 'p2'), pista()));
  });

  it('refuses a reserva without a sound config, and a config on any other kind', async () => {
    const bad: Record<string, unknown>[] = [
      { reserva: null },
      { reserva: reservaConfig({ blackouts: ['2026-12-25'] }) }, // closed days are the callable's
      { reserva: reservaConfig({ slotMinutes: 5 }) },
      { reserva: reservaConfig({ maxActiveReservations: 0 }) },
      { reserva: reservaConfig({ bookingHorizonDays: 365 }) },
      { reserva: reservaConfig({ hours: { '1': HOURS } }) },
      { reserva: reservaConfig({ hours: { ...reservaConfig().hours, '3': { opensAt: '22:00', closesAt: '09:00' } } }) },
      { reserva: reservaConfig({ hours: { ...reservaConfig().hours, '3': { opensAt: '9h', closesAt: '22:00' } } }) },
      { reserva: { ...reservaConfig(), extra: 1 } },
      { kind: 'prestamo' }, // a prestamo carries no reserva config
    ];
    for (const overrides of bad) await assertFails(setDoc(cosaRef('admin1', 'px'), pista(overrides)));
  });

  it('its manager edits the hours but never the closed days', async () => {
    await assertSucceeds(
      updateDoc(cosaRef('admin1', 'pista'), {
        reserva: reservaConfig({ blackouts: ['2026-12-25'], slotMinutes: 90 }),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(cosaRef('admin1', 'pista'), { reserva: reservaConfig({ blackouts: [] }), updatedAt: serverTimestamp() }),
    );
  });

  it('nobody books by writing a request: bookings go through the callable', async () => {
    await assertFails(
      setDoc(
        requestRef('vecino', 'b2'),
        request('vecino', 'Vecino', { cosaId: 'pista', cosaTitle: 'Pista de pádel', cosaKind: 'reserva' }),
      ),
    );
    // Nor smuggles a slot onto an ordinary request.
    await assertFails(setDoc(requestRef('vecino', 'b3'), request('vecino', 'Vecino', { startAt: new Date() })));
  });

  it('whoever sees the cosa sees which slots are taken; nobody writes them', async () => {
    const slots = (uid: string) => collection(asUser(getEnv(), uid), 'cosas/pista/slots');
    await assertSucceeds(getDocs(query(slots('vecino'), where('startAt', '>=', new Date('2026-11-09T00:00:00.000Z')))));
    await assertFails(getDocs(slots('forastero')));
    await assertFails(
      setDoc(doc(slots('vecino'), '2026-11-13T17:00:00.000Z'), {
        requestId: 'x', startAt: new Date('2026-11-13T17:00:00.000Z'), endAt: new Date('2026-11-13T18:00:00.000Z'), status: 'accepted',
      }),
    );
    await assertFails(deleteDoc(doc(slots('admin1'), '2026-11-12T17:00:00.000Z')));
  });
});
