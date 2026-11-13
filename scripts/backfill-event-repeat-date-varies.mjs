#!/usr/bin/env node
/**
 * Seed the fields a repeating event whose date varies introduced:
 *
 *   events/{id}.repeatsMonthly    -> false
 *   events/{id}.repeatDateVaries  -> false
 *
 * Both carry a `.default(false)` in the strict Zod converter, because installed
 * binaries keep creating events without them; the backfill makes the stored
 * data say what the model means for everything that already exists.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-event-repeat-date-varies.mjs --env=dev            (dry run)
 *   node scripts/backfill-event-repeat-date-varies.mjs --env=dev --apply
 *   node scripts/backfill-event-repeat-date-varies.mjs --env=beta --confirm --apply
 */

import { backfillCollection } from './lib/backfill.mjs';
import { isMain, runBackfill } from './lib/backfill-harness.mjs';

export const meta = {
  id: 'event-repeat-date-varies',
  kind: 'backfill',
  description: 'Seed events.repeatsMonthly and events.repeatDateVaries to false on existing events',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: ['event-recurrence'],
};

export function eventPatch(data) {
  const patch = {};
  if (data.repeatsMonthly === undefined) patch.repeatsMonthly = false;
  if (data.repeatDateVaries === undefined) patch.repeatDateVaries = false;
  return Object.keys(patch).length > 0 ? patch : null;
}

export async function run({ db, apply, log }) {
  log('events.repeatsMonthly + events.repeatDateVaries');
  const events = await backfillCollection(db, 'events', db.collection('events'), eventPatch, { apply });
  return { events: events.total, eventsPatched: events.patched };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
