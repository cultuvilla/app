#!/usr/bin/env node
/**
 * Set every organization's `joinPolicy` to `approval`.
 *
 * Joining any group now takes an admin's acceptance. Nothing but installed
 * binaries reads the field any more; on `approval` they file a join request, which
 * the rules still accept, where on `open` they would try the self-join the rules
 * now refuse. Existing members stay members, whatever the group was before.
 *
 * `pre-deploy`: until it has run, those binaries offer a join that fails.
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
  description: 'Set organizations.joinPolicy to approval: every group admits its members',
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
