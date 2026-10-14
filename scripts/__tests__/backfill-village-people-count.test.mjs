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
