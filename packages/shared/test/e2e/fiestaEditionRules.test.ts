import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAnon, asUser, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const M = 'm1';
const ID = `${M}_santiago_2026`;

function edition(proposedBy: string, extra: Record<string, unknown> = {}) {
  return {
    municipalityId: M, villageSlug: 'villa', blockId: 'santiago', year: 2026,
    startDay: '2026-07-24', endDay: '2026-07-26', proposedBy,
    createdAt: new Date(), updatedAt: new Date(),
    ...extra,
  };
}

function event(createdBy: string, extra: Record<string, unknown> = {}) {
  const startDate = new Date('2026-07-24T18:00:00Z');
  return {
    title: 'Pregón', description: '', startDate, endDate: null,
    location: { coordinates: { lat: 40.0, lng: -3.0 }, displayName: 'Plaza' },
    imageURL: null, maxAttendees: null, telephoneRequired: false, requiresPayment: false, signupFields: [],
    attendeesVisibility: 'members', signupGroupSize: 1, minBirthYear: null, maxBirthYear: null,
    signupEnabled: true, signupInfo: null,
    visibility: 'public', visibilityOrgId: null, series: null,
    status: 'published', organizerUserIds: [createdBy], organizerOrgIds: [],
    createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    municipalityId: M, villageName: 'Villa', villageSlug: 'villa',
    villageCoverImage: null, villageCoordinates: null,
    commentCount: 0, readCount: 0,
    endBoundary: startDate,
    ...extra,
  };
}

beforeEach(async () => {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `municipalities/${M}/members/alice`), { role: 'user', joinedAt: new Date() });
    await setDoc(doc(db, `municipalities/${M}/members/bob`), { role: 'user', joinedAt: new Date() });
    await setDoc(doc(db, `municipalities/${M}/members/boss`), { role: 'admin', joinedAt: new Date() });
    await setDoc(doc(db, `municipalities/other/members/alice`), { role: 'user', joinedAt: new Date() });
  });
});

async function seedEdition(id = ID, data = edition('alice')) {
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore(), `fiestaEditions/${id}`), data);
  });
}

describe('firestore.rules — /fiestaEditions', () => {
  it('anyone reads an edition, signed in or not', async () => {
    await seedEdition();
    await assertSucceeds(getDoc(doc(asAnon(getEnv()), `fiestaEditions/${ID}`)));
  });

  it('a member proposes an edition under its block-and-year id', async () => {
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'alice'), `fiestaEditions/${ID}`), edition('alice')));
  });

  it('refuses an id that is not the block and year', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), `fiestaEditions/${M}_carmen_2026`), edition('alice')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), 'fiestaEditions/random'), edition('alice')));
  });

  it('refuses a non-member, a proposal in someone else’s name, and a bad shape', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), 'stranger'), `fiestaEditions/${ID}`), edition('stranger')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), `fiestaEditions/${ID}`), edition('bob')));
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), `fiestaEditions/${ID}`), edition('alice', { extra: 1 })));
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), `fiestaEditions/${ID}`), edition('alice', { endDay: '2026-07-20' })));
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), `fiestaEditions/${ID}`), edition('alice', { startDay: '2025-07-24' })));
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), `fiestaEditions/${ID}`), edition('alice', { startDay: '24/07/2026' })));
  });

  it('lets an edition run into the next year', async () => {
    const id = `${M}_nochevieja_2026`;
    await assertSucceeds(
      setDoc(
        doc(asUser(getEnv(), 'alice'), `fiestaEditions/${id}`),
        edition('alice', { blockId: 'nochevieja', startDay: '2026-12-30', endDay: '2027-01-02' }),
      ),
    );
  });

  it('the proposer and an admin correct the days; another member cannot', async () => {
    await seedEdition();
    await assertSucceeds(updateDoc(doc(asUser(getEnv(), 'alice'), `fiestaEditions/${ID}`), { startDay: '2026-07-23', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asUser(getEnv(), 'boss'), `fiestaEditions/${ID}`), { endDay: '2026-07-27', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(getEnv(), 'bob'), `fiestaEditions/${ID}`), { endDay: '2026-07-28', updatedAt: serverTimestamp() }));
  });

  it('a second proposal by another member is refused, not a second edition', async () => {
    await seedEdition();
    await assertFails(setDoc(doc(asUser(getEnv(), 'bob'), `fiestaEditions/${ID}`), edition('bob')));
  });

  it('nobody moves an edition to another block, year or proposer', async () => {
    await seedEdition();
    await assertFails(updateDoc(doc(asUser(getEnv(), 'boss'), `fiestaEditions/${ID}`), { proposedBy: 'boss' }));
    await assertFails(updateDoc(doc(asUser(getEnv(), 'boss'), `fiestaEditions/${ID}`), { year: 2027, startDay: '2027-07-24', endDay: '2027-07-26' }));
  });

  it('the proposer and an admin delete it; another member cannot', async () => {
    await seedEdition();
    await assertFails(deleteDoc(doc(asUser(getEnv(), 'bob'), `fiestaEditions/${ID}`)));
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), 'boss'), `fiestaEditions/${ID}`)));
  });
});

describe('firestore.rules — events on a fiesta edition', () => {
  it('an event names an edition of its own pueblo', async () => {
    await seedEdition();
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'alice'), 'events/e1'), event('alice', { fiestaEditionId: ID })));
  });

  it('an event without the field, or with null, is on no programme', async () => {
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'alice'), 'events/e1'), event('alice')));
    await assertSucceeds(setDoc(doc(asUser(getEnv(), 'alice'), 'events/e2'), event('alice', { fiestaEditionId: null })));
  });

  it('refuses an edition that does not exist or belongs to another pueblo', async () => {
    await seedEdition('other_santiago_2026', edition('alice', { municipalityId: 'other' }));
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), 'events/e1'), event('alice', { fiestaEditionId: 'other_santiago_2026' })));
    await assertFails(setDoc(doc(asUser(getEnv(), 'alice'), 'events/e2'), event('alice', { fiestaEditionId: 'missing' })));
  });

  it('an edit tags and untags an event, but only with an edition of its pueblo', async () => {
    await seedEdition();
    await seedEdition('other_santiago_2026', edition('alice', { municipalityId: 'other' }));
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'events/e1'), { ...event('alice'), createdAt: new Date(), updatedAt: new Date() });
    });
    const alice = asUser(getEnv(), 'alice');
    await assertSucceeds(updateDoc(doc(alice, 'events/e1'), { fiestaEditionId: ID }));
    await assertFails(updateDoc(doc(alice, 'events/e1'), { fiestaEditionId: 'other_santiago_2026' }));
    await assertSucceeds(updateDoc(doc(alice, 'events/e1'), { fiestaEditionId: null }));
  });

  it('an event keeps saving after its edition is deleted', async () => {
    await seed(getEnv(), async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'events/e1'), { ...event('alice', { fiestaEditionId: 'gone' }), createdAt: new Date(), updatedAt: new Date() });
    });
    await assertSucceeds(updateDoc(doc(asUser(getEnv(), 'alice'), 'events/e1'), { title: 'Pregón 2026' }));
  });
});
