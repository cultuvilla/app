import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPatch } from '../backfill-event-repeat-date-varies.mjs';

test('an event predating the fields neither repeats monthly nor varies', () => {
  assert.deepEqual(eventPatch({ title: 'Verbena' }), { repeatsMonthly: false, repeatDateVaries: false });
});

test('stored values are never touched', () => {
  assert.equal(eventPatch({ repeatsMonthly: true, repeatDateVaries: true }), null);
  assert.deepEqual(eventPatch({ repeatsMonthly: true }), { repeatDateVaries: false });
});
