/* eslint-disable @typescript-eslint/no-explicit-any,
                  @typescript-eslint/require-await */
// vi.mock-driven Firestore fake that records the query parts it was handed so
// we can assert cursor + prefix behaviour without a real backend.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}) }));

let calls: { startAfter: unknown[]; limit: number | null; where: any[] };
let nextDocs: any[];

vi.mock('firebase/firestore', () => ({
  collection: () => ({ withConverter: () => ({}) }),
  query: (...parts: any[]) => ({ parts }),
  orderBy: (field: string, dir: string) => ({ _t: 'orderBy', field, dir }),
  where: (field: string, op: string, value: unknown) => {
    calls.where.push({ field, op, value });
    return { _t: 'where', field, op, value };
  },
  startAfter: (cursor: unknown) => {
    calls.startAfter.push(cursor);
    return { _t: 'startAfter', cursor };
  },
  limit: (n: number) => {
    calls.limit = n;
    return { _t: 'limit', n };
  },
  getDocs: async () => ({ docs: nextDocs }),
}));

import { listMunicipalitiesPage } from '../../src/services/municipalityService';
import { fakeQueryDoc } from '../helpers/sdkFakes';

function fakeDoc(id: string, name: string) {
  return { id, data: () => ({ name, nameLower: name.toLowerCase() }) };
}

beforeEach(() => {
  calls = { startAfter: [], limit: null, where: [] };
  nextDocs = [];
});

describe('listMunicipalitiesPage', () => {
  it('returns items and a nextCursor when a full page comes back', async () => {
    nextDocs = [fakeDoc('a', 'Avila'), fakeDoc('b', 'Burgos')];
    const page = await listMunicipalitiesPage({ limit: 2 });
    expect(page.items).toEqual([
      { id: 'a', name: 'Avila', nameLower: 'avila' },
      { id: 'b', name: 'Burgos', nameLower: 'burgos' },
    ]);
    expect(page.nextCursor).toBe(nextDocs[1]); // last snapshot of a full page
    expect(calls.limit).toBe(2);
    expect(calls.startAfter).toHaveLength(0); // no cursor on first page
  });

  it('returns nextCursor === null when the page is short (list exhausted)', async () => {
    nextDocs = [fakeDoc('a', 'Avila')];
    const page = await listMunicipalitiesPage({ limit: 2 });
    expect(page.nextCursor).toBeNull();
  });

  it('passes the cursor to startAfter on follow-on pages', async () => {
    const cursor = fakeQueryDoc(fakeDoc('a', 'Avila'));
    nextDocs = [fakeDoc('b', 'Burgos')];
    await listMunicipalitiesPage({ cursor, limit: 1 });
    expect(calls.startAfter).toEqual([cursor]);
  });

  it('matches the prefix index when search is non-empty', async () => {
    nextDocs = [];
    await listMunicipalitiesPage({ search: 'avi', limit: 5 });
    const fields = calls.where.map((w: { field: string; op: string }) => `${w.field} ${w.op}`);
    // A single array-contains, not a nameLower range scan: the range scan only
    // matched the start of the whole name, so "manzanas" could never find
    // "Villanueva de las Manzanas".
    expect(fields).toEqual(['searchPrefixes array-contains']);
  });

  it('normalizes the search term to the stored key shape', async () => {
    nextDocs = [];
    await listMunicipalitiesPage({ search: '  ÁVI ', limit: 5 });
    const [clause] = calls.where as { field: string; op: string; value: unknown }[];
    expect(clause.value).toBe('avi');
  });

  it('applies no where-clauses when search is empty', async () => {
    nextDocs = [];
    await listMunicipalitiesPage({ limit: 5 });
    expect(calls.where).toHaveLength(0);
  });
});
