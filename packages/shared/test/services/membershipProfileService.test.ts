import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: () => ({}) }));
vi.mock('firebase/firestore', () => createFakeFirestoreModule());

import type { ProfileFormField } from '../../src/models/municipality/CensoTypes';
import {
  answeredCountByKey,
  collectUsedValues,
  saveProfileAnswers,
} from '../../src/services/membershipProfileService';

describe('answeredCountByKey', () => {
  it('counts members with a non-empty answer per key, ignoring empties', () => {
    const members: Parameters<typeof answeredCountByKey>[0] = [
      { profileAnswers: { color: 'rojo', edad: 30 } },
      { profileAnswers: { color: 'azul', tags: [] as string[] } },
      { profileAnswers: { color: '', tags: ['a'] } },
    ];
    expect(answeredCountByKey(members)).toEqual({ color: 2, edad: 1, tags: 1 });
  });
});

describe('collectUsedValues', () => {
  it('gathers every distinct value per key, flattening multiselects', () => {
    const used = collectUsedValues([
      { profileAnswers: { barrio: 'norte', aficiones: ['pesca', 'mus'], edad: 30, socio: true } },
      { profileAnswers: { barrio: 'norte', aficiones: ['mus', 'baile'], edad: 41, socio: false } },
    ]);
    expect(used['barrio']).toEqual(new Set(['norte']));
    expect(used['aficiones']).toEqual(new Set(['pesca', 'mus', 'baile']));
    expect(used['edad']).toEqual(new Set([30, 41]));
    expect(used['socio']).toEqual(new Set([true, false]));
  });

  // An empty answer is not a value in use, so it must not block removing an
  // option from the schema; the key still appears, with an empty set.
  it('skips empty strings and empty arrays but keeps their key', () => {
    const used = collectUsedValues([{ profileAnswers: { barrio: '', aficiones: [] as string[] } }]);
    expect(used).toEqual({ barrio: new Set(), aficiones: new Set() });
  });

  it('is empty for no members', () => {
    expect(collectUsedValues([])).toEqual({});
  });
});

describe('saveProfileAnswers', () => {
  const fields: ProfileFormField[] = [
    { source: 'custom', key: 'barrio', label: 'Barrio', type: 'text', required: true },
    { source: 'custom', key: 'mote', label: 'Mote', type: 'text', required: false },
  ];
  const memberPath = 'municipalities/m1/members/u1';
  const answersPath = 'censoAnswers/m1_u1';

  beforeEach(() => {
    resetFakeFirestore();
    fakeStore()[memberPath] = { role: 'user', displayName: 'Ana' };
  });

  it('writes the answers to the private doc and marks the member complete', async () => {
    await saveProfileAnswers('m1', 'u1', fields, { barrio: 'norte' });
    const answers = fakeStore()[answersPath];
    expect(answers['municipalityId']).toBe('m1');
    expect(answers['userId']).toBe('u1');
    expect(answers['profileAnswers']).toEqual({ barrio: 'norte' });
    const member = fakeStore()[memberPath];
    expect((member['profileCompletedAt'] as { _isTimestamp?: boolean })._isTimestamp).toBe(true);
  });

  it('clears the completion flag when a required answer is missing', async () => {
    fakeStore()[memberPath] = { role: 'user', profileCompletedAt: new Date('2026-01-01') };
    await saveProfileAnswers('m1', 'u1', fields, { barrio: '  ', mote: 'el Rubio' });
    expect(fakeStore()[memberPath]['profileCompletedAt']).toBeNull();
    expect(fakeStore()[answersPath]['profileAnswers']).toEqual({ barrio: '  ', mote: 'el Rubio' });
  });

  // The member doc is world-readable: only whether the censo is complete may
  // land there, never what it says.
  it('never copies an answer onto the member doc', async () => {
    await saveProfileAnswers('m1', 'u1', fields, { barrio: 'norte', mote: 'el Rubio' });
    const member = fakeStore()[memberPath];
    expect(Object.keys(member).sort()).toEqual(['displayName', 'profileCompletedAt', 'role']);
    expect(JSON.stringify(member)).not.toMatch(/norte|Rubio/);
  });
});
