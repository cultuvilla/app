#!/usr/bin/env node
/**
 * Give every organization an explicit `cuotaEnabled`, on — every group with
 * socios ran a cuota before an admin could switch it off.
 *
 * `pre-deploy`: the converter defaults the field for orgs installed binaries
 * still create without it, but existing docs carry it explicitly, as with
 * `chatAdminsOnly`. Idempotent — an org that already has the field is never
 * touched, so an admin's choice survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-cuota-enabled.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-cuota-enabled.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-cuota-enabled',
  kind: 'backfill',
  description: 'Set organizations.cuotaEnabled: true where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function cuotaEnabledPatch(data) {
  return typeof data.cuotaEnabled === 'boolean' ? null : { cuotaEnabled: true };
}

export async function run({ db, apply, log }) {
  log('organizations.cuotaEnabled');
  return await backfillCollection(db, 'organizations', db.collection('organizations'), (data) => cuotaEnabledPatch(data), {
    apply,
  });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
