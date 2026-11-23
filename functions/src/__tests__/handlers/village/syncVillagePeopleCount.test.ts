import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncVillagePeopleCount } from '../../../village/syncVillagePeopleCount';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncVillagePeopleCount);

interface Row {
  municipalityId: string;
  personId: string;
  displayName: string;
  sortName: string;
  photoURL: string | null;
  userId: string | null;
  isPublic: boolean;
  barrioId: string | null;
}

function row(municipalityId: string, personId: string, overrides: Partial<Row> = {}): Row {
  return {
    municipalityId,
    personId,
    displayName: personId,
    sortName: personId,
    photoURL: null,
    userId: null,
    isPublic: true,
    barrioId: null,
    ...overrides,
  };
}

const rowPath = (r: Row) => `municipalityPeople/${r.municipalityId}_${r.personId}`;

/** Writes the projection the way the database would, then fires the trigger. */
async function write(before: Row | null, after: Row | null): Promise<void> {
  const path = rowPath((after ?? before) as Row);
  if (before && (!after || rowPath(before) !== rowPath(after))) {
    await admin.firestore().doc(rowPath(before)).delete();
  }
  if (after) await admin.firestore().doc(rowPath(after)).set(after);
  const beforeSnap = ft.firestore.makeDocumentSnapshot(before ?? {}, path);
  const afterSnap = ft.firestore.makeDocumentSnapshot(after ?? {}, path);
  await wrapped({
    data: ft.makeChange(beforeSnap, afterSnap),
    params: { rowId: path.split('/')[1] },
  } as unknown as Parameters<typeof wrapped>[0]);
}

async function seedMunicipality(id: string, peopleCount: number): Promise<void> {
  await admin.firestore().doc(`municipalities/${id}`).set({ name: id, peopleCount });
}

async function peopleCount(id: string): Promise<unknown> {
  return (await admin.firestore().doc(`municipalities/${id}`).get()).get('peopleCount');
}

beforeAll(async () => {
  await resetEmulators();
});

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('syncVillagePeopleCount', () => {
  it('counts a person joining the village', async () => {
    await seedMunicipality('m1', 0);
    await write(null, row('m1', 'p1'));
    await write(null, row('m1', 'p2'));

    expect(await peopleCount('m1')).toBe(2);
  });

  it('counts a person leaving the village', async () => {
    await seedMunicipality('m1', 0);
    await write(null, row('m1', 'p1'));
    await write(null, row('m1', 'p2'));
    await write(row('m1', 'p1'), null);

    expect(await peopleCount('m1')).toBe(1);
  });

  it('moves the count when a row changes village', async () => {
    await seedMunicipality('m1', 0);
    await seedMunicipality('m2', 0);
    await write(null, row('m1', 'p1'));
    await write(row('m1', 'p1'), row('m2', 'p1'));

    expect(await peopleCount('m1')).toBe(0);
    expect(await peopleCount('m2')).toBe(1);
  });

  // The recount is what heals drift: a stale stored value is replaced by the
  // true number on the next roster change, not nudged by one.
  it('recounts rather than increments, healing a drifted value', async () => {
    await seedMunicipality('m1', 41);
    await write(null, row('m1', 'p1'));

    expect(await peopleCount('m1')).toBe(1);
  });

  // syncMunicipalityPeople rewrites every row with a full set() on any person
  // edit (name, photo, barrio). Those must not touch the municipality doc.
  it('no-ops when a row is rewritten in the same village', async () => {
    await seedMunicipality('m1', 7);
    await admin.firestore().doc('municipalityPeople/m1_p1').set(row('m1', 'p1'));
    await write(row('m1', 'p1'), row('m1', 'p1', { displayName: 'Renamed', barrioId: 'b1' }));

    expect(await peopleCount('m1')).toBe(7);
  });

  // Trigger invocations for one village run in no particular order. Each
  // recount runs in a transaction with the municipality doc, so an invocation
  // that counted early cannot overwrite a later, larger count.
  it('ends on the true count when invocations overlap', async () => {
    await seedMunicipality('m1', 0);
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    await Promise.all(ids.map((id) => write(null, row('m1', id))));

    expect(await peopleCount('m1')).toBe(ids.length);
  });

  it('skips a municipality doc that does not exist', async () => {
    await expect(write(null, row('missing', 'p1'))).resolves.not.toThrow();
    expect((await admin.firestore().doc('municipalities/missing').get()).exists).toBe(false);
  });
});
