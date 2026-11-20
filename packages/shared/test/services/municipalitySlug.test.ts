import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

const reads = vi.hoisted(() => ({ getDocs: 0, getDoc: 0 }));

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: () => ({}) }));
vi.mock('firebase/firestore', () => {
  const m = createFakeFirestoreModule();
  return {
    ...m,
    getDocs: (q: Parameters<typeof m.getDocs>[0]) => {
      reads.getDocs++;
      return m.getDocs(q);
    },
    getDoc: (ref: Parameters<typeof m.getDoc>[0]) => {
      reads.getDoc++;
      return m.getDoc(ref);
    },
  };
});

import {
  getMunicipalityBySlug,
  getVillageSlug,
  peekVillageSlug,
  resolveVillageRoute,
} from '../../src/services/municipalityService';

// The slug cache is module state that lives for the process, by design (a slug
// is permanent). Each test therefore uses its own slugs and ids instead of
// resetting the module, which would also split the fake store in two.
describe('village slug cache', () => {
  beforeEach(() => {
    resetFakeFirestore();
    reads.getDocs = 0;
    reads.getDoc = 0;
  });

  it('getMunicipalityBySlug returns the village and caches both directions', async () => {
    fakeStore()['municipalities/m-mata'] = { name: 'Matabuena', slug: 'matabuena' };
    fakeStore()['municipalities/m-other'] = { name: 'Otro', slug: 'otro' };

    const found = await getMunicipalityBySlug('matabuena');
    expect(found).toMatchObject({ id: 'm-mata', name: 'Matabuena', slug: 'matabuena' });
    expect(peekVillageSlug('m-mata')).toBe('matabuena');

    await expect(getVillageSlug('m-mata')).resolves.toBe('matabuena');
    expect(reads.getDoc).toBe(0);
  });

  it('an unknown slug is null and caches nothing', async () => {
    await expect(getMunicipalityBySlug('no-existe')).resolves.toBeNull();
    await expect(resolveVillageRoute('no-existe')).resolves.toBeNull();
    // Not negatively cached: a village activated later must resolve.
    expect(reads.getDocs).toBe(2);
  });

  it('resolveVillageRoute reads once, then answers from the cache', async () => {
    fakeStore()['municipalities/m-hoyo'] = { name: 'El Hoyo', slug: 'el-hoyo' };

    await expect(resolveVillageRoute('el-hoyo')).resolves.toEqual({ id: 'm-hoyo', name: 'El Hoyo' });
    expect(reads.getDocs).toBe(1);

    delete fakeStore()['municipalities/m-hoyo'];
    await expect(resolveVillageRoute('el-hoyo')).resolves.toEqual({ id: 'm-hoyo', name: 'El Hoyo' });
    expect(reads.getDocs).toBe(1);
  });

  // getMunicipality seeds the id but not the name, so a route still needs one
  // read to title the screen.
  it('a slug known only by id still reads once for the name', async () => {
    fakeStore()['municipalities/m-sep'] = { name: 'Sepúlveda', slug: 'sepulveda' };
    await getVillageSlug('m-sep');
    expect(reads.getDoc).toBe(1);

    await expect(resolveVillageRoute('sepulveda')).resolves.toEqual({ id: 'm-sep', name: 'Sepúlveda' });
    expect(reads.getDocs).toBe(1);
    await resolveVillageRoute('sepulveda');
    expect(reads.getDocs).toBe(1);
  });
});
