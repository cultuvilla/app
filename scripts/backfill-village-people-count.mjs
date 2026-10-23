#!/usr/bin/env node
/**
 * Set `peopleCount` on every municipality doc to the number of its rows in the
 * `municipalityPeople` projection.
 *
 * The village home shows that number to every viewer, but the projection is
 * member-only, so it is copied onto the public municipality doc and kept by
 * `syncVillagePeopleCount`. The schema requires the field (strict Zod
 * converter), hence `pre-deploy`. Idempotent — a doc already holding the right
 * count is skipped — and the trigger recounts on the next roster change, so a
 * row written between this run and its deploy heals itself.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-village-people-count.mjs --env=dev            (dry run)
 *   node scripts/backfill-village-people-count.mjs --env=dev --apply
 *   node scripts/backfill-village-people-count.mjs --env=beta --confirm --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'village-people-count',
  kind: 'backfill',
  description: 'Set municipalities.peopleCount to the number of municipalityPeople rows per village',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  // Counts the rows the projection backfill leaves behind, so it runs after it.
  dependsOn: ['municipality-people-barrio'],
};

/** municipalityId → number of projection rows. */
export function countByMunicipality(rows) {
  const counts = new Map();
  for (const row of rows) {
    const id = row.municipalityId;
    if (typeof id !== 'string' || id.length === 0) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function peopleCountPatch(data, municipalityId, counts) {
  const want = counts.get(municipalityId) ?? 0;
  return data.peopleCount === want ? null : { peopleCount: want };
}

export async function run({ db, apply, log }) {
  log('municipalities.peopleCount');
  // One pass over the projection instead of an aggregate query per municipality:
  // most of the ~8k municipalities have no rows at all.
  const rows = await db.collection('municipalityPeople').select('municipalityId').get();
  const counts = countByMunicipality(rows.docs.map((d) => d.data()));
  log(`${rows.size} municipalityPeople row(s) across ${counts.size} village(s)`);
  return await backfillCollection(
    db,
    'municipalities',
    db.collection('municipalities'),
    (data, snap) => peopleCountPatch(data, snap.id, counts),
    { apply },
  );
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
