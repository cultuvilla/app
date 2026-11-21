#!/usr/bin/env node
/**
 * Give every organization an explicit `actasEnabled` and `cuentasEnabled`,
 * on — every group with socios kept actas and cuentas before an admin could
 * switch them off.
 *
 * `pre-deploy`: the converter defaults the fields for orgs installed binaries
 * still create without them, but existing docs carry them explicitly, as with
 * `cuotaEnabled`. Idempotent — a field an org already has is never touched,
 * so an admin's choice survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-records-enabled.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-records-enabled.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-records-enabled',
  kind: 'backfill',
  description: 'Set organizations.actasEnabled and cuentasEnabled: true where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function recordsEnabledPatch(data) {
  const patch = {};
  if (typeof data.actasEnabled !== 'boolean') patch.actasEnabled = true;
  if (typeof data.cuentasEnabled !== 'boolean') patch.cuentasEnabled = true;
  return Object.keys(patch).length > 0 ? patch : null;
}

export async function run({ db, apply, log }) {
  log('organizations.actasEnabled, organizations.cuentasEnabled');
  return await backfillCollection(db, 'organizations', db.collection('organizations'), (data) => recordsEnabledPatch(data), {
    apply,
  });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
