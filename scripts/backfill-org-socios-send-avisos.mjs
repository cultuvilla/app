#!/usr/bin/env node
/**
 * Give every organization an explicit `sociosSendAvisos` ("Enviar avisos", for
 * the socios), off — only the junta sends avisos until an admin turns it on.
 *
 * `pre-deploy`: the converter defaults the field for orgs installed binaries
 * still create without it, but existing docs carry it explicitly, as with
 * `chatAdminsOnly`. Idempotent — an org that already has the field is never
 * touched, so an admin's choice survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-socios-send-avisos.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-socios-send-avisos.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-socios-send-avisos',
  kind: 'backfill',
  description: 'Set organizations.sociosSendAvisos: false where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function sociosSendAvisosPatch(data) {
  return typeof data.sociosSendAvisos === 'boolean' ? null : { sociosSendAvisos: false };
}

export async function run({ db, apply, log }) {
  log('organizations.sociosSendAvisos');
  return await backfillCollection(
    db,
    'organizations',
    db.collection('organizations'),
    (data) => sociosSendAvisosPatch(data),
    { apply },
  );
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
