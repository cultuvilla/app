import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => {
  const m = createFakeFirestoreModule();
  return { ...m, query: vi.fn(m.query) };
});
vi.mock('../../src/services/municipalityService', () => ({
  getVillageSlug: vi.fn((id: string) => Promise.resolve(`slug-of-${id}`)),
}));

import { query } from 'firebase/firestore';
import { getVillageSlug } from '../../src/services/municipalityService';
import {
  createFestivalPoster,
  deleteFestivalPoster,
  getFestivalPoster,
  getFestivalPosters,
  updateFestivalPoster,
} from '../../src/services/festivalPosterService';

describe('festivalPosterService', () => {
  beforeEach(() => {
    resetFakeFirestore();
    vi.mocked(query).mockClear();
    vi.mocked(getVillageSlug).mockClear();
  });

  it('createFestivalPoster resolves the village slug and lands the poster active', async () => {
    const id = await createFestivalPoster(
      {
        municipalityId: 'm1',
        proposedBy: 'u1',
        year: 1987,
        images: ['posters/p1.jpg'],
        createdAt: new Date('2026-01-01'),
      },
      'p1',
    );

    expect(id).toBe('p1');
    expect(getVillageSlug).toHaveBeenCalledWith('m1');
    expect(fakeStore()['festivalPosters/p1']).toMatchObject({
      municipalityId: 'm1',
      villageSlug: 'slug-of-m1',
      year: 1987,
      status: 'active',
      datePrecision: 'year',
      startsAt: null,
    });
  });

  it('createFestivalPoster writes nothing when the municipality cannot be resolved', async () => {
    vi.mocked(getVillageSlug).mockRejectedValueOnce(new Error('not found'));
    await expect(
      createFestivalPoster({ municipalityId: 'gone', year: 2000, createdAt: new Date() }, 'p2'),
    ).rejects.toThrow('not found');
    expect(fakeStore()['festivalPosters/p2']).toBeUndefined();
  });

  it('getFestivalPosters lists only the village’s active posters, newest year first', async () => {
    fakeStore()['festivalPosters/a'] = { municipalityId: 'm1', status: 'active', year: 2001 };
    fakeStore()['festivalPosters/hidden'] = { municipalityId: 'm1', status: 'hidden', year: 2002 };
    fakeStore()['festivalPosters/other'] = { municipalityId: 'm2', status: 'active', year: 2003 };

    const posters = await getFestivalPosters('m1');

    expect(posters.map((p) => p.id)).toEqual(['a']);
    const [, ...constraints] = vi.mocked(query).mock.calls[0] as unknown[];
    expect(constraints).toEqual([
      { _type: 'where', field: 'municipalityId', op: '==', value: 'm1' },
      { _type: 'where', field: 'status', op: '==', value: 'active' },
      { _type: 'orderBy', field: 'year', dir: 'desc' },
    ]);
  });

  it('getFestivalPoster returns the poster with its id, or null when missing', async () => {
    fakeStore()['festivalPosters/p1'] = { municipalityId: 'm1', year: 1990 };
    await expect(getFestivalPoster('p1')).resolves.toMatchObject({ id: 'p1', year: 1990 });
    await expect(getFestivalPoster('nope')).resolves.toBeNull();
  });

  it('updateFestivalPoster patches without touching the rest of the doc', async () => {
    fakeStore()['festivalPosters/p1'] = { municipalityId: 'm1', year: 1990, proposedBy: 'u1' };
    await updateFestivalPoster('p1', { year: 1991, title: 'Fiestas de San Roque' });
    expect(fakeStore()['festivalPosters/p1']).toEqual({
      municipalityId: 'm1',
      year: 1991,
      title: 'Fiestas de San Roque',
      proposedBy: 'u1',
    });
  });

  it('deleteFestivalPoster removes the doc', async () => {
    fakeStore()['festivalPosters/p1'] = { municipalityId: 'm1' };
    await deleteFestivalPoster('p1');
    expect(fakeStore()['festivalPosters/p1']).toBeUndefined();
  });
});
