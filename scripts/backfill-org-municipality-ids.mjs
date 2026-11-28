#!/usr/bin/env node
/**
 * List every organization in its home pueblo: make `municipalityIds` include
 * `municipalityId`. A pueblo's group list queries `municipalityIds`
 * (array-contains), so an approved group without it vanishes from its own
 * pueblo. See docs/decisions/multi-village-groups.md.
 *
 * `pre-deploy`: the new list query is what needs it. Idempotent — a doc that
 * already lists its home is never touched, and the other pueblos it lists are
 * kept.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-municipality-ids.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-municipality-ids.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-municipality-ids',
  kind: 'backfill',
  description: 'Add each organization\'s home municipalityId to organizations.municipalityIds',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function municipalityIdsPatch(data) {
  const home = data.municipalityId;
  if (typeof home !== 'string' || home === '') return null;
  const listed = Array.isArray(data.municipalityIds) ? data.municipalityIds.filter((id) => typeof id === 'string') : [];
  if (listed.includes(home)) return null;
  return { municipalityIds: [home, ...listed] };
}

export async function run({ db, apply, log }) {
  log('organizations.municipalityIds');
  return await backfillCollection(db, 'organizations', db.collection('organizations'), (data) => municipalityIdsPatch(data), {
    apply,
  });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
