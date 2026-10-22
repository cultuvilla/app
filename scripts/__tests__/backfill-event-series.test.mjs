import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPatch, run } from '../backfill-event-series.mjs';

const SERIES = { id: 's', index: 0, weekdays: [2], until: new Date('2026-12-01') };

test('an event predating the field becomes standalone', () => {
  assert.deepEqual(eventPatch({ title: 'Verbena' }), { series: null });
});

test('a stored null and a real series are never touched', () => {
  assert.equal(eventPatch({ series: null }), null);
  assert.equal(eventPatch({ series: SERIES }), null);
});

/** A fake Firestore holding `rows` in `events`, recording what is written. */
function fakeDb(rows) {
  const store = new Map(rows.map((data, i) => [`e${String(i)}`, { ...data }]));
  const writes = [];
  const db = {
    collection: () => ({
      get: async () => {
        const docs = [...store].map(([id, data]) => ({ id, ref: { id }, data: () => data }));
        return { docs, size: docs.length };
      },
    }),
    batch: () => {
      const pending = [];
      return {
        update: (ref, patch) => pending.push([ref.id, patch]),
        set: () => {},
        delete: () => {},
        commit: async () => {
          for (const [id, patch] of pending) {
            Object.assign(store.get(id), patch);
            writes.push(id);
          }
          pending.length = 0;
        },
      };
    },
  };
  return { db, store, writes };
}

const log = () => {};

test('a dry run writes nothing', async () => {
  const { db, writes } = fakeDb([{ title: 'a' }, { title: 'b', series: SERIES }]);
  const counts = await run({ db, apply: false, log });
  assert.deepEqual(counts, { events: 2, eventsPatched: 1 });
  assert.deepEqual(writes, []);
});

test('applying patches only the missing field, and a second run finds nothing to do', async () => {
  const { db, store } = fakeDb([{ title: 'a' }, { title: 'b', series: SERIES }, { title: 'c', series: null }]);
  assert.deepEqual(await run({ db, apply: true, log }), { events: 3, eventsPatched: 1 });
  assert.equal(store.get('e0').series, null);
  assert.deepEqual(store.get('e1').series, SERIES);
  assert.deepEqual(await run({ db, apply: true, log }), { events: 3, eventsPatched: 0 });
});
