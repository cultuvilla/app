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
    await setDoc(doc(db, `municipalities/${M}/members/rival`), { role: 'member', joinedAt: new Date() });
    await setDoc(doc(db, 'events/s1'), {
      ...occurrence('member', series()),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'events/existing'), {
      ...occurrence('member', series({ index: 1 }), new Date('2026-11-05T17:00:00Z')),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
});

describe('firestore.rules — weekly event series', () => {
  it('creates a whole series in one batch', async () => {
    const db = asUser(getEnv(), 'member');
    const batch = writeBatch(db);
    batch.set(doc(db, 'events/o0'), occurrence('member', series({ id: 'o0' })));
    batch.set(doc(db, 'events/o1'), occurrence('member', series({ id: 'o0', index: 1 }), new Date('2026-11-05T17:00:00Z')));
    await assertSucceeds(batch.commit());
  });

  // Every occurrence runs the create rule and reads the same root and member
  // doc. The emulator does not enforce the per-request access cap on batches,
  // so this pins the rules' verdict at the cap's length, not the production
  // budget — that relies on repeated reads of one path being cached.
  it('creates the longest series the cap allows — a daily one, 184 occurrences — in one batch', async () => {
    const db = asUser(getEnv(), 'member');
    const batch = writeBatch(db);
    const until = new Date(START.getTime() + 183 * 86_400_000);
    for (let i = 0; i < 184; i += 1) {
      const start = new Date(START.getTime() + i * 86_400_000);
      batch.set(doc(db, `events/long${String(i)}`), occurrence('member', series({ id: 'long0', index: i, until }), start));
    }
    await assertSucceeds(batch.commit());
  });

  it('refuses an occurrence slotted into somebody else\'s series', async () => {
    const db = asUser(getEnv(), 'rival');
    // Earlier-dated, so a collapsed list would show it instead of the real one.
    await assertFails(
      setDoc(doc(db, 'events/impostor'), occurrence('rival', series({ index: 1 }), new Date('2026-11-01T17:00:00Z'))),
    );
    // Nor can it claim to be the root under a different id.
    await assertFails(setDoc(doc(db, 'events/impostor0'), occurrence('rival', series({ index: 0 }))));
    // Nor can the creator stretch the series by restating its rule.
    const member = asUser(getEnv(), 'member');
    await assertFails(
      setDoc(doc(member, 'events/stretch'), occurrence('member', series({ index: 9, until: new Date('2027-04-01T00:00:00Z') }), new Date('2027-03-30T17:00:00Z'))),
    );
    await assertFails(setDoc(doc(member, 'events/otherdays'), occurrence('member', series({ index: 9, weekdays: [1] }))));
    // Pointing at a root that does not exist is refused too.
    await assertFails(
      setDoc(doc(db, 'events/orphan'), occurrence('rival', series({ id: 'nope', index: 1 }))),
    );
  });

  it('refuses an occurrence whose village or visibility differs from its root', async () => {
    const db = asUser(getEnv(), 'member');
    await getEnv().withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, 'municipalities/m2/members/member'), { role: 'member', joinedAt: new Date() });
      // A vetted member of an approval peña, so a private occurrence is refused
      // for its mismatch with the root alone.
      await setDoc(doc(admin, 'organizations/pena'), { joinPolicy: 'approval', municipalityId: M });
      await setDoc(doc(admin, 'organizations/pena/members/member'), { role: 'member', joinedAt: new Date() });
    });
    await assertSucceeds(
      setDoc(doc(db, 'events/pena0'), {
        ...occurrence('member', series({ id: 'pena0' })),
        visibility: 'organization',
        visibilityOrgId: 'pena',
      }),
    );
    await assertFails(
      setDoc(doc(db, 'events/elsewhere'), { ...occurrence('member', series({ index: 2 })), municipalityId: 'm2' }),
    );
    await assertFails(
      setDoc(doc(db, 'events/hidden'), {
        ...occurrence('member', series({ index: 2 })),
        visibility: 'organization',
        visibilityOrgId: 'pena',
      }),
    );
    // The same occurrence, matching its root, is fine.
    await assertSucceeds(setDoc(doc(db, 'events/fine'), occurrence('member', series({ index: 2 }))));
  });

  it('accepts a late slot on the last day across the autumn clock change', async () => {
    const db = asUser(getEnv(), 'member');
    // Madrid leaves summer time on 25 Oct 2026: midnight is 22:00Z on the 24th,
    // and 23:30 local on the 25th is 22:30Z — 24.5 h later.
    const until = new Date('2026-10-24T22:00:00Z');
    const late = new Date('2026-10-25T22:30:00Z');
    await assertSucceeds(
      setDoc(doc(db, 'events/dst0'), {
        ...occurrence('member', series({ id: 'dst0', until }), late),
      }),
    );
  });

  it('still accepts an event with no series key at all, as installed binaries send', async () => {
    const db = asUser(getEnv(), 'member');
    const { series: _s, ...legacy } = occurrence('member', null);
    await assertSucceeds(setDoc(doc(db, 'events/legacy'), legacy));
  });

  it('rejects a malformed series', async () => {
    const db = asUser(getEnv(), 'member');
    for (const bad of [
      series({ id: 'bad', weekdays: [] }),
      series({ id: 'bad', weekdays: [0] }),
      series({ id: 'bad', weekdays: [2, 9] }),
      series({ id: '' }),
      series({ id: 'bad', index: -1 }),
      { ...series({ id: 'bad' }), extra: true },
      'weekly',
    ]) {
      await assertFails(setDoc(doc(db, 'events/bad'), occurrence('member', bad)));
    }
  });

  it('rejects an occurrence after until, and a series longer than the cap', async () => {
    const db = asUser(getEnv(), 'member');
    await assertFails(
      setDoc(doc(db, 'events/late'), occurrence('member', series({ id: 'late' }), new Date('2026-12-20T17:00:00Z'))),
    );
    await assertFails(
      setDoc(
        doc(db, 'events/toolong'),
        occurrence('member', series({ id: 'toolong', until: new Date('2027-06-01T00:00:00Z') })),
      ),
    );
  });

  it('never lets an update move an event in or out of a series', async () => {
    const db = asUser(getEnv(), 'member');
    await assertFails(updateDoc(doc(db, 'events/existing'), { series: null }));
    await assertFails(updateDoc(doc(db, 'events/existing'), { 'series.until': new Date('2027-01-01') }));
    await assertSucceeds(updateDoc(doc(db, 'events/existing'), { status: 'cancelled' }));
  });

  it('keeps one visibility across a series', async () => {
    const db = asUser(getEnv(), 'member');
    await assertFails(
      updateDoc(doc(db, 'events/existing'), { visibility: 'organization', visibilityOrgId: 'pena' }),
    );
  });

  it('lets anyone list a public series by its id', async () => {
    const db = asUser(getEnv(), 'stranger');
    await assertSucceeds(
      getDocs(query(collection(db, 'events'), where('series.id', '==', 's1'), where('visibility', '==', 'public'))),
    );
  });
});

describe('firestore.rules — monthly series and yearly events', () => {
  const monthly = (over: Record<string, unknown> = {}) => series({ frequency: 'monthly', weekdays: [2], ...over });

  it('creates a monthly series running a year, and still a weekly one tagged as such', async () => {
    const db = asUser(getEnv(), 'member');
    const until = new Date('2027-11-03T00:00:00Z');
    const batch = writeBatch(db);
    batch.set(doc(db, 'events/m0'), occurrence('member', monthly({ id: 'm0', until })));
    batch.set(doc(db, 'events/m1'), occurrence('member', monthly({ id: 'm0', index: 1, until }), new Date('2026-12-03T17:00:00Z')));
    await assertSucceeds(batch.commit());
    await assertSucceeds(setDoc(doc(db, 'events/w0'), occurrence('member', series({ id: 'w0', frequency: 'weekly' }))));
  });

  it('caps a monthly series at a year and a weekly one at six months', async () => {
    const db = asUser(getEnv(), 'member');
    const beyondYear = new Date('2027-11-10T00:00:00Z');
    await assertFails(setDoc(doc(db, 'events/m0'), occurrence('member', monthly({ id: 'm0', until: beyondYear }))));
    await assertFails(
      setDoc(doc(db, 'events/w0'), occurrence('member', series({ id: 'w0', frequency: 'weekly', until: new Date('2027-06-01T00:00:00Z') }))),
    );
  });

  it('rejects an unknown frequency, and an occurrence whose frequency differs from its root', async () => {
    const db = asUser(getEnv(), 'member');
    await assertFails(setDoc(doc(db, 'events/d0'), occurrence('member', series({ id: 'd0', frequency: 'daily' }))));
    await assertFails(
      setDoc(doc(db, 'events/odd'), occurrence('member', monthly({ index: 2 }), new Date('2026-11-10T17:00:00Z'))),
    );
  });

  it('accepts a yearly event, but never one that is also a series or not a boolean', async () => {
    const db = asUser(getEnv(), 'member');
    await assertSucceeds(setDoc(doc(db, 'events/fiestas'), { ...occurrence('member', null), repeatsYearly: true }));
    await assertFails(setDoc(doc(db, 'events/y0'), { ...occurrence('member', series({ id: 'y0' })), repeatsYearly: true }));
    await assertFails(setDoc(doc(db, 'events/y1'), { ...occurrence('member', null), repeatsYearly: 'yes' }));
    await assertFails(updateDoc(doc(db, 'events/existing'), { repeatsYearly: true }));
    await assertSucceeds(updateDoc(doc(db, 'events/fiestas'), { repeatsYearly: false }));
  });

  it('accepts a varying date only on one yearly or monthly edition', async () => {
    const db = asUser(getEnv(), 'member');
    const single = occurrence('member', null);
    await assertSucceeds(setDoc(doc(db, 'events/v0'), { ...single, repeatsYearly: true, repeatDateVaries: true }));
    await assertSucceeds(setDoc(doc(db, 'events/v1'), { ...single, repeatsMonthly: true, repeatDateVaries: true }));
    // A monthly event on a fixed day is a series, and nothing else varies.
    await assertFails(setDoc(doc(db, 'events/v2'), { ...single, repeatsMonthly: true }));
    await assertFails(setDoc(doc(db, 'events/v3'), { ...single, repeatDateVaries: true }));
    await assertFails(
      setDoc(doc(db, 'events/v4'), { ...single, repeatsYearly: true, repeatsMonthly: true, repeatDateVaries: true }),
    );
    await assertFails(
      setDoc(doc(db, 'events/v5'), {
        ...occurrence('member', series({ id: 'v5' })),
        repeatsMonthly: true,
        repeatDateVaries: true,
      }),
    );
    await assertFails(setDoc(doc(db, 'events/v6'), { ...single, repeatsMonthly: 'yes', repeatDateVaries: true }));
  });
});
