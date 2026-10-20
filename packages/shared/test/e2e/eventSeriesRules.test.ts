import { describe, it, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
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
const M = 'm1';
const START = new Date('2026-11-03T17:00:00Z');
const UNTIL = new Date('2026-12-15T00:00:00Z');

function occurrence(createdBy: string, series: unknown, startDate = START) {
  return {
    title: 'Yoga', description: '', startDate, endDate: null,
    location: { coordinates: { lat: 40.0, lng: -3.0 }, displayName: 'Plaza' },
    imageURL: null, maxAttendees: null, telephoneRequired: false, requiresPayment: false, signupFields: [],
    attendeesVisibility: 'members', signupGroupSize: 1, minBirthYear: null, maxBirthYear: null,
    signupEnabled: true, signupInfo: null,
    visibility: 'public', visibilityOrgId: null, series,
    status: 'published', organizerUserIds: [createdBy], organizerOrgIds: [],
    createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    municipalityId: M, villageName: 'Villa', villageSlug: 'villa',
    villageCoverImage: null, villageCoordinates: null,
    commentCount: 0, readCount: 0,
    endBoundary: startDate,
  };
}

const series = (over: Record<string, unknown> = {}) => ({ id: 's1', index: 0, weekdays: [2, 4], until: UNTIL, ...over });

beforeEach(async () => {
  await getEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `municipalities/${M}/members/member`), { role: 'member', joinedAt: new Date() });
    await setDoc(doc(db, 'events/existing'), {
      ...occurrence('member', series()),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
});

describe('firestore.rules — weekly event series', () => {
  it('creates a whole series in one batch', async () => {
    const db = asUser(getEnv(), 'member');
    const batch = writeBatch(db);
    batch.set(doc(db, 'events/o0'), occurrence('member', series()));
    batch.set(doc(db, 'events/o1'), occurrence('member', series({ index: 1 }), new Date('2026-11-05T17:00:00Z')));
    await assertSucceeds(batch.commit());
  });

  it('still accepts an event with no series key at all, as installed binaries send', async () => {
    const db = asUser(getEnv(), 'member');
    const { series: _s, ...legacy } = occurrence('member', null);
    await assertSucceeds(setDoc(doc(db, 'events/legacy'), legacy));
  });

  it('rejects a malformed series', async () => {
    const db = asUser(getEnv(), 'member');
    for (const bad of [
      series({ weekdays: [] }),
      series({ weekdays: [0] }),
      series({ id: '' }),
      series({ index: -1 }),
      { ...series(), extra: true },
      'weekly',
    ]) {
      await assertFails(setDoc(doc(db, 'events/bad'), occurrence('member', bad)));
    }
  });

  it('rejects an occurrence after until, and a series longer than the cap', async () => {
    const db = asUser(getEnv(), 'member');
    await assertFails(
      setDoc(doc(db, 'events/late'), occurrence('member', series(), new Date('2026-12-20T17:00:00Z'))),
    );
    await assertFails(
      setDoc(doc(db, 'events/long'), occurrence('member', series({ until: new Date('2027-06-01T00:00:00Z') }))),
    );
  });

  it('never lets an update move an event in or out of a series', async () => {
    const db = asUser(getEnv(), 'member');
    await assertFails(updateDoc(doc(db, 'events/existing'), { series: null }));
    await assertFails(updateDoc(doc(db, 'events/existing'), { 'series.until': new Date('2027-01-01') }));
    await assertSucceeds(updateDoc(doc(db, 'events/existing'), { status: 'cancelled' }));
  });

  it('lets anyone list a public series by its id', async () => {
    const db = asUser(getEnv(), 'stranger');
    await assertSucceeds(
      getDocs(query(collection(db, 'events'), where('series.id', '==', 's1'), where('visibility', '==', 'public'))),
    );
  });
});
