#!/usr/bin/env node
/**
 * Seed the weekly-series link introduced with recurring events:
 *
 *   events/{id}.series -> null   (a standalone event)
 *
 * The field carries a `.default(null)` in the strict Zod converter, so a stale
 * doc still parses; the backfill exists so the stored data says what the model
 * means instead of leaning on the default forever, and so the conformance gate
 * has something honest to check.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-event-series.mjs --env=dev            (dry run)
 *   node scripts/backfill-event-series.mjs --env=dev --apply
 *   node scripts/backfill-event-series.mjs --env=beta --confirm --apply
 */

import { backfillCollection } from './lib/backfill.mjs';
import { isMain, runBackfill } from './lib/backfill-harness.mjs';

export const meta = {
  id: 'event-series',
  kind: 'backfill',
  description: 'Seed events.series to null on events predating weekly series',
  // pre-deploy: additive, and every event list now reads the field to collapse
  // a series to one card, so it should be stored before that code lands.
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

function eventPatch(data) {
  return data.series === undefined ? { series: null } : null;
}

export async function run({ db, apply, log }) {
  log('events.series');
  const events = await backfillCollection(db, 'events', db.collection('events'), eventPatch, {
    apply,
  });
  return { events: events.total, eventsPatched: events.patched };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
