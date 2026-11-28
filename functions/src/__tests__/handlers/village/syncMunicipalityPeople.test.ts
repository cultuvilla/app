import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncMunicipalityPeople } from '../../../village/syncMunicipalityPeople';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncMunicipalityPeople);

interface Link { municipalityId: string; barrioId: string | null }
interface PartialDate { year: number | null; month: number | null; day: number | null }
interface BurialPlace { municipalityId: string; placeId: string }
interface Person { givenName: string; middleNames: string[]; firstSurname: string | null; secondSurname: string | null; nickname: string | null; municipalityLinks: Link[]; photoURL: string | null; userId: string | null; isPublic: boolean; deathDate: PartialDate | null; burialPlace: BurialPlace | null }

function person(overrides: Partial<Person> = {}): Person {
  return { givenName: 'Álvaro', middleNames: [], firstSurname: 'García', secondSurname: null, nickname: null, municipalityLinks: [], photoURL: null, userId: null, isPublic: true, deathDate: null, burialPlace: null, ...overrides };
}

/** Delivers a write event; `stale` skips mirroring `after` into the store (a late delivery). */
async function fire(before: Person | null, after: Person | null, personId = 'p1', stale = false): Promise<void> {
  if (!stale) {
    const ref = admin.firestore().doc(`persons/${personId}`);
    await (after ? ref.set(after) : ref.delete());
  }
  const beforeSnap = ft.firestore.makeDocumentSnapshot(before ?? {}, `persons/${personId}`);
  const afterSnap = ft.firestore.makeDocumentSnapshot(after ?? {}, `persons/${personId}`);
  await wrapped({ data: ft.makeChange(beforeSnap, afterSnap), params: { personId } });
}

beforeAll(async () => { await resetEmulators(); });
beforeEach(async () => { await resetEmulators(); });
afterAll(() => { ft.cleanup(); });

describe('syncMunicipalityPeople', () => {
  it('creates an alphabetically sortable row for a dependent persona', async () => {
    await fire(null, person({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] }));
    const row = await admin.firestore().doc('municipalityPeople/m1_p1').get();
    expect(row.data()).toMatchObject({ municipalityId: 'm1', personId: 'p1', displayName: 'Álvaro García', sortName: 'alvaro garcia', userId: null });
  });

  // A private persona stays in the directory — the roster shows the name and
  // uses the projected flag to decide the row leads nowhere.
  it('projects the privacy flag, defaulting a pre-privacy person doc to public', async () => {
    await fire(null, person({ isPublic: false, municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] }));
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).get('isPublic')).toBe(false);

    await resetEmulators();
    const legacy = person({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] }) as Partial<Person>;
    delete legacy.isPublic;
    await fire(null, legacy as Person);
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).get('isPublic')).toBe(true);
  });

  // The barrio roster reads this projection, so the row must carry the barrio
  // from the person's link for THAT municipality — not a global one.
  it('projects the barrio of each municipality link', async () => {
    await fire(null, person({
      municipalityLinks: [
        { municipalityId: 'm1', barrioId: 'b1' },
        { municipalityId: 'm2', barrioId: null },
      ],
    }));
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).get('barrioId')).toBe('b1');
    expect((await admin.firestore().doc('municipalityPeople/m2_p1').get()).get('barrioId')).toBeNull();
  });

  it('shows the apodo in parentheses in displayName but keeps sortName on the full name', async () => {
    await fire(
      null,
      person({ nickname: 'Varo', municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] }),
    );
    const row = await admin.firestore().doc('municipalityPeople/m1_p1').get();
    expect(row.data()).toMatchObject({ displayName: 'Álvaro García (Varo)', sortName: 'alvaro garcia' });
  });

  it('adds and removes rows when municipality links change', async () => {
    await fire(
      person({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] }),
      person({ municipalityLinks: [{ municipalityId: 'm2', barrioId: 'b2' }], userId: 'u1' }),
    );
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).exists).toBe(false);
    expect((await admin.firestore().doc('municipalityPeople/m2_p1').get()).get('userId')).toBe('u1');
  });

  it('removes all directory rows when the person is deleted', async () => {
    await admin.firestore().doc('municipalityPeople/m1_p1').set({ municipalityId: 'm1' });
    await fire(person({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] }), null);
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).exists).toBe(false);
  });

  it('does not create a directory row for a deceased persona (death date set)', async () => {
    await fire(
      null,
      person({
        municipalityLinks: [{ municipalityId: 'm1', barrioId: null }],
        deathDate: { year: 2020, month: null, day: null },
      }),
    );
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).exists).toBe(false);
  });

  it('does not create a directory row for a persona buried in a cemetery (no death date)', async () => {
    await fire(
      null,
      person({
        municipalityLinks: [{ municipalityId: 'm1', barrioId: null }],
        burialPlace: { municipalityId: 'm1', placeId: 'cem1' },
      }),
    );
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).exists).toBe(false);
  });

  it('removes the directory row when a living resident becomes deceased', async () => {
    await fire(null, person({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] }));
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).exists).toBe(true);

    await fire(
      person({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] }),
      person({
        municipalityLinks: [{ municipalityId: 'm1', barrioId: null }],
        deathDate: { year: 2021, month: 3, day: null },
      }),
    );
    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).exists).toBe(false);
  });

  it('keeps a deleted person gone when a late update arrives after the delete', async () => {
    const linked = person({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] });
    await fire(null, linked);
    await fire(linked, null);

    await fire(linked, person({ ...linked, nickname: 'Varo' }), 'p1', true);

    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).exists).toBe(false);
  });

  it('projects the current person when a late event carries an older version', async () => {
    const m1 = person({ municipalityLinks: [{ municipalityId: 'm1', barrioId: null }] });
    const m2 = person({ municipalityLinks: [{ municipalityId: 'm2', barrioId: null }] });
    await fire(m1, m2);

    // The m2 → m1 move was superseded; the store still says m2.
    await fire(m2, m1, 'p1', true);

    expect((await admin.firestore().doc('municipalityPeople/m1_p1').get()).exists).toBe(false);
    expect((await admin.firestore().doc('municipalityPeople/m2_p1').get()).exists).toBe(true);
  });
});
