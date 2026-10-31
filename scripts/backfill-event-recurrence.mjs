#!/usr/bin/env node
/**
 * Seed the fields monthly series and yearly events introduced:
 *
 *   events/{id}.repeatsYearly     -> false      (not a yearly event)
 *   events/{id}.series.frequency  -> 'weekly'   (every series before monthly ones)
 *
 * Both carry a `.default(...)` in the strict Zod converter, because installed
 * binaries keep creating events without them; the backfill makes the stored
 * data say what the model means for everything that already exists.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-event-recurrence.mjs --env=dev            (dry run)
 *   node scripts/backfill-event-recurrence.mjs --env=dev --apply
 *   node scripts/backfill-event-recurrence.mjs --env=beta --confirm --apply
 */

import { backfillCollection } from './lib/backfill.mjs';
import { isMain, runBackfill } from './lib/backfill-harness.mjs';

export const meta = {
  id: 'event-recurrence',
  kind: 'backfill',
  description: 'Seed events.repeatsYearly to false and series.frequency to weekly on existing events',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  // series must exist (null or a map) before its frequency is read.
  dependsOn: ['event-series'],
};

export function eventPatch(data) {
  const patch = {};
  if (data.repeatsYearly === undefined) patch.repeatsYearly = false;
  if (data.series && typeof data.series === 'object' && data.series.frequency === undefined) {
    patch['series.frequency'] = 'weekly';
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export async function run({ db, apply, log }) {
  log('events.repeatsYearly + events.series.frequency');
  const events = await backfillCollection(db, 'events', db.collection('events'), eventPatch, { apply });
  return { events: events.total, eventsPatched: events.patched };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
