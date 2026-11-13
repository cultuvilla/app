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
// that a dry run writes nothing.
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

// The reconcile runs against a live trigger, so a roster can change between its
// snapshot and its write. `people` and the municipality docs stay live here;
// `afterWalk` is that change, landing once the suspects have been picked.
function liveDb({ people, municipalities, afterWalk = () => {} }) {
  const writes = [];
  const docs = new Map(municipalities);
  const refOf = (id) => ({ id });
  const snapOf = (id) => {
    const data = docs.get(id);
    return { id, ref: refOf(id), exists: data !== undefined, data: () => data };
  };
  const peopleColl = {
    select: () => ({
      get: async () => ({ size: people.length, docs: people.map((row) => ({ data: () => row })) }),
    }),
    where: (_field, _op, id) => ({
      count: () => ({ read: () => people.filter((p) => p.municipalityId === id).length }),
    }),
  };
  const municipalitiesColl = {
    select: () => ({
      get: async () => {
        const walked = [...docs.keys()].map(snapOf);
        afterWalk({ people, docs });
        return { size: walked.length, docs: walked };
      },
    }),
  };
  return {
    writes,
    docs,
    collection: (name) => (name === 'municipalityPeople' ? peopleColl : municipalitiesColl),
    runTransaction: (fn) =>
      fn({
        get: async (target) => (target.read ? { data: () => ({ count: target.read() }) } : snapOf(target.id)),
        update: (ref, data) => {
          writes.push([ref.id, data]);
          docs.set(ref.id, { ...docs.get(ref.id), ...data });
        },
      }),
  };
}

const row = (municipalityId) => ({ municipalityId });

test('the reconcile corrects a wrong count and leaves a right one alone', async () => {
  const { run } = await import('../backfill-village-people-count-reconcile.mjs');
  const db = liveDb({
    people: [row('m1'), row('m1'), row('m2')],
    municipalities: [['m1', {}], ['m2', { peopleCount: 1 }], ['m3', { peopleCount: 4 }]],
  });
  assert.deepEqual(await run({ db, apply: true, log: () => {} }), { total: 3, patched: 2 });
  assert.deepEqual(db.writes.sort(), [
    ['m1', { peopleCount: 2 }],
    ['m3', { peopleCount: 0 }],
  ]);
});

test('the reconcile as a dry run counts the same and writes nothing', async () => {
  const { run } = await import('../backfill-village-people-count-reconcile.mjs');
  const db = liveDb({ people: [row('m1')], municipalities: [['m1', { peopleCount: 9 }]] });
  assert.deepEqual(await run({ db, apply: false, log: () => {} }), { total: 1, patched: 1 });
  assert.deepEqual(db.writes, []);
});

test('the reconcile never overwrites the trigger with a count from its snapshot', async () => {
  const { run } = await import('../backfill-village-people-count-reconcile.mjs');
  const db = liveDb({
    people: [row('m1'), row('m1')],
    municipalities: [['m1', { peopleCount: 5 }]],
    // A row leaves after the snapshot, and the trigger writes the right count.
    afterWalk: ({ people, docs }) => {
      people.pop();
      docs.set('m1', { peopleCount: 1 });
    },
  });
  assert.deepEqual(await run({ db, apply: true, log: () => {} }), { total: 1, patched: 0 });
  assert.deepEqual(db.writes, []);
  assert.equal(db.docs.get('m1').peopleCount, 1);
});

test('the reconcile writes the count at commit time, not at snapshot time', async () => {
  const { run } = await import('../backfill-village-people-count-reconcile.mjs');
  const db = liveDb({
    people: [row('m1'), row('m1')],
    municipalities: [['m1', { peopleCount: 5 }]],
    afterWalk: ({ people }) => people.push(row('m1')),
  });
  await run({ db, apply: true, log: () => {} });
  assert.deepEqual(db.writes, [['m1', { peopleCount: 3 }]]);
});

test('the reconcile skips a municipality deleted after its snapshot', async () => {
  const { run } = await import('../backfill-village-people-count-reconcile.mjs');
  const db = liveDb({
    people: [row('m1')],
    municipalities: [['m1', { peopleCount: 5 }]],
    afterWalk: ({ docs }) => docs.delete('m1'),
  });
  assert.deepEqual(await run({ db, apply: true, log: () => {} }), { total: 1, patched: 0 });
  assert.deepEqual(db.writes, []);
});
