#!/usr/bin/env node
/**
 * Give every organization an explicit `sociosListVisible` ("los estatutos
 * permiten ver la lista de socios"), off — socios see only their own row until
 * an admin turns it on.
 *
 * `pre-deploy`: the converter defaults the field for orgs installed binaries
 * still create without it, but existing docs carry it explicitly, as with
 * `joinPolicy`. Idempotent — an org that already has the field is never
 * touched, so an admin's choice survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-socios-list-visible.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-socios-list-visible.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-socios-list-visible',
  kind: 'backfill',
  description: 'Set organizations.sociosListVisible: false where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function sociosListVisiblePatch(data) {
  return typeof data.sociosListVisible === 'boolean' ? null : { sociosListVisible: false };
}

export async function run({ db, apply, log }) {
  log('organizations.sociosListVisible');
  return await backfillCollection(
    db,
    'organizations',
    db.collection('organizations'),
    (data) => sociosListVisiblePatch(data),
    { apply },
  );
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
