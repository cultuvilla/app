#!/usr/bin/env node
/**
 * Set every organization's `joinPolicy` to `approval`, once.
 *
 * Whether a group takes anyone on the spot is now its admin's choice, and most
 * groups are `open` only because that was the default, which never asked. So
 * they all start out requiring acceptance, and an admin who wants it open
 * switches it back. Existing members stay members.
 *
 * The auto-apply step skips a backfill with a marker, so this never undoes an
 * admin's later choice. Don't re-run it by hand for that reason.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-join-by-approval.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-join-by-approval.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-join-by-approval',
  kind: 'backfill',
  description: 'Set organizations.joinPolicy to approval once: every group starts out requiring acceptance',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function joinByApprovalPatch(data) {
  return data.joinPolicy === 'approval' ? null : { joinPolicy: 'approval' };
}

export async function run({ db, apply, log }) {
  log('organizations.joinPolicy');
  return await backfillCollection(
    db,
    'organizations',
    db.collection('organizations'),
    (data) => joinByApprovalPatch(data),
    { apply },
  );
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
