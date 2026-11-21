#!/usr/bin/env node
/**
 * Seed the field fiesta editions introduced on events:
 *
 *   events/{id}.fiestaEditionId -> null
 *
 * It carries a `.default(null)` in the strict Zod converter, because installed
 * binaries keep creating events without it; the backfill makes the stored
 * data say what the model means for everything that already exists — no event
 * is on a programme until its organizer puts it there.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-event-fiesta-edition.mjs --env=dev            (dry run)
 *   node scripts/backfill-event-fiesta-edition.mjs --env=dev --apply
 *   node scripts/backfill-event-fiesta-edition.mjs --env=beta --confirm --apply
 */

import { backfillCollection } from './lib/backfill.mjs';
import { isMain, runBackfill } from './lib/backfill-harness.mjs';

export const meta = {
  id: 'event-fiesta-edition',
  kind: 'backfill',
  description: 'Seed events.fiestaEditionId to null on existing events',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function eventPatch(data) {
  return data.fiestaEditionId === undefined ? { fiestaEditionId: null } : null;
}

export async function run({ db, apply, log }) {
  log('events.fiestaEditionId');
  const events = await backfillCollection(db, 'events', db.collection('events'), eventPatch, { apply });
  return { events: events.total, eventsPatched: events.patched };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
