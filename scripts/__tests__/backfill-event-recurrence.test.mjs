import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPatch } from '../backfill-event-recurrence.mjs';

const SERIES = { id: 's', index: 0, weekdays: [2], until: new Date('2026-12-01') };

test('an event predating both fields is not yearly, and its series is weekly', () => {
  assert.deepEqual(eventPatch({ title: 'Verbena', series: null }), { repeatsYearly: false });
  assert.deepEqual(eventPatch({ title: 'Yoga', series: SERIES }), { repeatsYearly: false, 'series.frequency': 'weekly' });
});

test('stored values are never touched', () => {
  assert.equal(eventPatch({ series: null, repeatsYearly: true }), null);
  assert.equal(eventPatch({ series: { ...SERIES, frequency: 'monthly' }, repeatsYearly: false }), null);
});
