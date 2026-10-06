import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => {
  const m = createFakeFirestoreModule();
  return { ...m, query: vi.fn(m.query) };
});

import { query } from 'firebase/firestore';
import {
  getMunicipalityPeople,
  getMunicipalityPeopleByBarrio,
} from '../../src/services/municipalityPersonService';

function row(municipalityId: string, barrioId: string | null, sortName: string) {
  return { municipalityId, barrioId, sortName, personId: sortName };
}

function lastConstraints(): unknown[] {
  const calls = vi.mocked(query).mock.calls;
  return (calls[calls.length - 1] as unknown[]).slice(1);
}

describe('municipalityPersonService', () => {
  beforeEach(() => {
    resetFakeFirestore();
    vi.mocked(query).mockClear();
    fakeStore()['municipalityPeople/p1'] = row('m1', 'b1', 'ana');
    fakeStore()['municipalityPeople/p2'] = row('m1', 'b2', 'luis');
    fakeStore()['municipalityPeople/p3'] = row('m1', null, 'marta');
    fakeStore()['municipalityPeople/p4'] = row('m2', 'b1', 'pedro');
  });

  it('getMunicipalityPeople lists the whole village directory by sortName', async () => {
    const people = await getMunicipalityPeople('m1');

    expect(people.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(lastConstraints()).toEqual([
      { _type: 'where', field: 'municipalityId', op: '==', value: 'm1' },
      { _type: 'orderBy', field: 'sortName', dir: 'asc' },
    ]);
  });

  it('getMunicipalityPeopleByBarrio narrows to one barrio of that village', async () => {
    const people = await getMunicipalityPeopleByBarrio('m1', 'b1');

    // p4 shares the barrio id but lives in another municipality.
    expect(people.map((p) => p.id)).toEqual(['p1']);
    expect(people[0]).toMatchObject({ municipalityId: 'm1', barrioId: 'b1', sortName: 'ana' });
    expect(lastConstraints()).toEqual([
      { _type: 'where', field: 'municipalityId', op: '==', value: 'm1' },
      { _type: 'where', field: 'barrioId', op: '==', value: 'b1' },
      { _type: 'orderBy', field: 'sortName', dir: 'asc' },
    ]);
  });
});
