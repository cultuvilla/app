import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPatch } from '../backfill-event-fiesta-edition.mjs';

test('an event predating fiesta editions is on no programme', () => {
  assert.deepEqual(eventPatch({ title: 'Verbena' }), { fiestaEditionId: null });
});

test('a stored value is never touched', () => {
  assert.equal(eventPatch({ fiestaEditionId: 'm1_santiago_2026' }), null);
  assert.equal(eventPatch({ fiestaEditionId: null }), null);
});
