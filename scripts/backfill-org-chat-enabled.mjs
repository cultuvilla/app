#!/usr/bin/env node
/**
 * Give every organization an explicit `chatEnabled`, on — every group had its
 * Charla before an admin could switch it off.
 *
 * `pre-deploy`: the converter defaults the field for orgs installed binaries
 * still create without it, but existing docs carry it explicitly, as with
 * `actasEnabled`. Idempotent — an org that already has it is never touched,
 * so an admin's choice survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-chat-enabled.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-chat-enabled.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-chat-enabled',
  kind: 'backfill',
  description: 'Set organizations.chatEnabled: true where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function chatEnabledPatch(data) {
  return typeof data.chatEnabled === 'boolean' ? null : { chatEnabled: true };
}

export async function run({ db, apply, log }) {
  log('organizations.chatEnabled');
  return await backfillCollection(db, 'organizations', db.collection('organizations'), (data) => chatEnabledPatch(data), { apply });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
