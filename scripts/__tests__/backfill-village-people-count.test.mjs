import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByMunicipality, peopleCountPatch } from '../backfill-village-people-count.mjs';

const counts = countByMunicipality([
  { municipalityId: 'm1' },
  { municipalityId: 'm1' },
  { municipalityId: 'm2' },
  { municipalityId: '' },
  {},
]);

test('counts projection rows per village, ignoring rows without a village', () => {
  assert.deepEqual([...counts.entries()].sort(), [
    ['m1', 2],
    ['m2', 1],
  ]);
});

test('a municipality missing the field gets its count, or 0 with no rows', () => {
  assert.deepEqual(peopleCountPatch({}, 'm1', counts), { peopleCount: 2 });
  assert.deepEqual(peopleCountPatch({}, 'm9', counts), { peopleCount: 0 });
});

test('a drifted count is corrected and a correct one is left alone', () => {
  assert.deepEqual(peopleCountPatch({ peopleCount: 5 }, 'm2', counts), { peopleCount: 1 });
  assert.equal(peopleCountPatch({ peopleCount: 2 }, 'm1', counts), null);
  assert.equal(peopleCountPatch({ peopleCount: 0 }, 'm9', counts), null);
});

// run() end to end against an in-memory db: what it reads, what it writes, and
// that a dry run writes nothing. The reconcile re-uses this run() verbatim.
function fakeDb({ people, municipalities }) {
  const writes = [];
  const docs = (rows) => rows.map(([id, data]) => ({ id, data: () => data, ref: { id } }));
  const query = (rows) => ({ get: async () => ({ size: rows.length, docs: docs(rows) }) });
  return {
    writes,
    collection: (name) => {
      const rows = name === 'municipalityPeople' ? people : municipalities;
      return { ...query(rows), select: () => query(rows) };
    },
    batch: () => {
      const staged = [];
      return {
        update: (ref, data) => staged.push([ref.id, data]),
        set: (ref, data) => staged.push([ref.id, data]),
        delete: (ref) => staged.push([ref.id, null]),
        commit: async () => writes.push(...staged.splice(0)),
      };
    },
  };
}

const world = () =>
  fakeDb({
    people: [
      ['p1', { municipalityId: 'm1' }],
      ['p2', { municipalityId: 'm1' }],
      ['p3', { municipalityId: 'm2' }],
    ],
    municipalities: [
      ['m1', {}],
      ['m2', { peopleCount: 1 }],
      ['m3', { peopleCount: 4 }],
    ],
  });

test('run() writes only the counts that are missing or wrong', async () => {
  const { run } = await import('../backfill-village-people-count.mjs');
  const db = world();
  const result = await run({ db, apply: true, log: () => {} });
  assert.deepEqual(result, { total: 3, patched: 2 });
  assert.deepEqual(db.writes.sort(), [
    ['m1', { peopleCount: 2 }],
    ['m3', { peopleCount: 0 }],
  ]);
});

test('run() as a dry run counts the same and writes nothing', async () => {
  const { run } = await import('../backfill-village-people-count.mjs');
  const db = world();
  const result = await run({ db, apply: false, log: () => {} });
  assert.deepEqual(result, { total: 3, patched: 2 });
  assert.deepEqual(db.writes, []);
});
