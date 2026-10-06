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
  createHistoryEntry,
  deleteHistoryEntry,
  getHistoryEntries,
  getHistoryEntry,
  updateHistoryEntry,
} from '../../src/services/historyService';

const BODY = { text: 'La iglesia se levantó en 1540.', mentions: [], links: [], marks: [] };

describe('historyService', () => {
  beforeEach(() => {
    resetFakeFirestore();
    vi.mocked(query).mockClear();
    vi.mocked(getVillageSlug).mockClear();
  });

  it('createHistoryEntry resolves the village slug and writes an active, public entry', async () => {
    const id = await createHistoryEntry(
      {
        municipalityId: 'm1',
        createdBy: 'u1',
        title: '  La iglesia  ',
        body: BODY,
        start: { year: 1540, month: 3, day: null },
        sources: '   ',
        createdAt: new Date('2026-01-01'),
      },
      'h1',
    );

    expect(id).toBe('h1');
    expect(getVillageSlug).toHaveBeenCalledWith('m1');
    const stored = fakeStore()['historyEntries/h1'];
    expect(stored).toMatchObject({
      municipalityId: 'm1',
      villageSlug: 'slug-of-m1',
      title: 'La iglesia',
      status: 'active',
      sources: null,
      sortKey: 1540 * 10000 + 3 * 100,
    });
  });

  it('createHistoryEntry mints an id when none is given', async () => {
    const id = await createHistoryEntry({
      municipalityId: 'm1',
      createdBy: 'u1',
      title: 'Algo',
      body: BODY,
      start: { year: 1900, month: null, day: null },
      createdAt: new Date('2026-01-01'),
    });
    expect(id).toBeTruthy();
    expect(fakeStore()[`historyEntries/${id}`]).toBeDefined();
  });

  it('getHistoryEntries shows only the village’s active entries, newest first by sortKey', async () => {
    fakeStore()['historyEntries/a'] = { municipalityId: 'm1', status: 'active', sortKey: 1 };
    fakeStore()['historyEntries/hidden'] = { municipalityId: 'm1', status: 'hidden', sortKey: 2 };
    fakeStore()['historyEntries/other'] = { municipalityId: 'm2', status: 'active', sortKey: 3 };

    const entries = await getHistoryEntries('m1');

    expect(entries.map((e) => e.id)).toEqual(['a']);
    const [, ...constraints] = vi.mocked(query).mock.calls[0] as unknown[];
    expect(constraints).toEqual([
      { _type: 'where', field: 'municipalityId', op: '==', value: 'm1' },
      { _type: 'where', field: 'status', op: '==', value: 'active' },
      { _type: 'orderBy', field: 'sortKey', dir: 'desc' },
    ]);
  });

  it('getHistoryEntry returns the entry with its id, or null when missing', async () => {
    fakeStore()['historyEntries/h1'] = { municipalityId: 'm1', title: 'X' };
    await expect(getHistoryEntry('h1')).resolves.toMatchObject({ id: 'h1', title: 'X' });
    await expect(getHistoryEntry('nope')).resolves.toBeNull();
  });

  it('updateHistoryEntry re-derives sortKey so a new start date re-files the entry', async () => {
    fakeStore()['historyEntries/h1'] = { municipalityId: 'm1', sortKey: 15400300, createdBy: 'u1' };

    await updateHistoryEntry('h1', {
      title: ' Nuevo ',
      body: BODY,
      images: [],
      start: { year: 1812, month: 5, day: 2 },
      end: null,
      approximate: true,
      sources: '',
      updatedAt: new Date('2026-02-01'),
    });

    expect(fakeStore()['historyEntries/h1']).toMatchObject({
      createdBy: 'u1',
      title: 'Nuevo',
      sources: null,
      approximate: true,
      sortKey: 18120502,
    });
  });

  it('deleteHistoryEntry removes the doc', async () => {
    fakeStore()['historyEntries/h1'] = { municipalityId: 'm1' };
    await deleteHistoryEntry('h1');
    expect(fakeStore()['historyEntries/h1']).toBeUndefined();
  });
});
