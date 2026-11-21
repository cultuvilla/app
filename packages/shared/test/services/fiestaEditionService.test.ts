import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => createFakeFirestoreModule());
vi.mock('../../src/services/municipalityService', () => ({
  getVillageSlug: vi.fn((id: string) => Promise.resolve(`slug-of-${id}`)),
}));

import {
  deleteFiestaEdition,
  getFiestaEdition,
  getFiestaEditions,
  saveFiestaEdition,
  watchFiestaEditions,
} from '../../src/services/fiestaEditionService';
import { watchFiestaProgrammeEvents } from '../../src/services/eventService';

const input = { municipalityId: 'm1', blockId: 'santiago', year: 2026, startDay: '2026-07-24', endDay: '2026-07-26', uid: 'u1' };

describe('fiestaEditionService', () => {
  beforeEach(() => {
    resetFakeFirestore();
  });

  it('proposes an edition under its block-and-year id', async () => {
    const id = await saveFiestaEdition(input);
    expect(id).toBe('m1_santiago_2026');
    expect(fakeStore()['fiestaEditions/m1_santiago_2026']).toMatchObject({
      municipalityId: 'm1',
      villageSlug: 'slug-of-m1',
      blockId: 'santiago',
      year: 2026,
      startDay: '2026-07-24',
      endDay: '2026-07-26',
      proposedBy: 'u1',
    });
  });

  it('corrects only the days of an edition that exists, keeping its proposer', async () => {
    await saveFiestaEdition(input);
    await saveFiestaEdition({ ...input, startDay: '2026-07-23', uid: 'admin' });
    expect(fakeStore()['fiestaEditions/m1_santiago_2026']).toMatchObject({ startDay: '2026-07-23', proposedBy: 'u1' });
  });

  it('reads a missing edition as null, and deletes one', async () => {
    expect(await getFiestaEdition('m1_santiago_2026')).toBeNull();
    await saveFiestaEdition(input);
    await deleteFiestaEdition('m1_santiago_2026');
    expect(fakeStore()['fiestaEditions/m1_santiago_2026']).toBeUndefined();
  });
});

describe('reading a village’s editions and their programme', () => {
  beforeEach(() => {
    resetFakeFirestore();
  });

  it('lists only the village’s editions, oldest first, live and once', async () => {
    const store = fakeStore();
    store['fiestaEditions/m1_carmen_2026'] = { municipalityId: 'm1', blockId: 'carmen', startDay: '2026-08-14' };
    store['fiestaEditions/m1_santiago_2026'] = { municipalityId: 'm1', blockId: 'santiago', startDay: '2026-07-24' };
    store['fiestaEditions/m2_santiago_2026'] = { municipalityId: 'm2', blockId: 'santiago', startDay: '2026-07-24' };
    expect((await getFiestaEditions('m1')).map((e) => e.id)).toEqual(['m1_santiago_2026', 'm1_carmen_2026']);
    const seen: string[][] = [];
    watchFiestaEditions('m1', (rows) => seen.push(rows.map((e) => e.id)), (error) => {
      throw error;
    });
    expect(seen[0]).toEqual(['m1_santiago_2026', 'm1_carmen_2026']);
  });

  it('merges the public, listed events of every edition, in start order', () => {
    const store = fakeStore();
    const at = (iso: string) => new Date(iso);
    store['events/a'] = { fiestaEditionId: 'e1', visibility: 'public', status: 'published', startDate: at('2026-07-25T10:00:00Z') };
    store['events/b'] = { fiestaEditionId: 'e2', visibility: 'public', status: 'completed', startDate: at('2026-07-24T10:00:00Z') };
    store['events/c'] = { fiestaEditionId: 'e1', visibility: 'public', status: 'cancelled', startDate: at('2026-07-24T12:00:00Z') };
    store['events/d'] = { fiestaEditionId: 'e1', visibility: 'organization', status: 'published', startDate: at('2026-07-24T12:00:00Z') };
    store['events/e'] = { fiestaEditionId: 'other', visibility: 'public', status: 'published', startDate: at('2026-07-24T12:00:00Z') };
    const seen: string[][] = [];
    watchFiestaProgrammeEvents(['e1', 'e2'], (rows) => seen.push(rows.map((e) => e.id)), (error) => {
      throw error;
    });
    expect(seen[0]).toEqual(['b', 'a']);
  });

  it('answers an empty programme at once when there is no edition', () => {
    const seen: number[] = [];
    watchFiestaProgrammeEvents([], (rows) => seen.push(rows.length), (error) => {
      throw error;
    });
    expect(seen).toEqual([0]);
  });
});
