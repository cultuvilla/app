#!/usr/bin/env node
/**
 * Give every organization an explicit `chatAdminsOnly` ("solo la junta
 * escribe"), off — every member writes in the general chat until an admin turns
 * it on.
 *
 * `pre-deploy`: the converter defaults the field for orgs installed binaries
 * still create without it, but existing docs carry it explicitly, as with
 * `sociosListVisible`. Idempotent — an org that already has the field is never
 * touched, so an admin's choice survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-chat-admins-only.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-chat-admins-only.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-chat-admins-only',
  kind: 'backfill',
  description: 'Set organizations.chatAdminsOnly: false where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function chatAdminsOnlyPatch(data) {
  return typeof data.chatAdminsOnly === 'boolean' ? null : { chatAdminsOnly: false };
}

export async function run({ db, apply, log }) {
  log('organizations.chatAdminsOnly');
  return await backfillCollection(
    db,
    'organizations',
    db.collection('organizations'),
    (data) => chatAdminsOnlyPatch(data),
    { apply },
  );
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
