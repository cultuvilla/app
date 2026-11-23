#!/usr/bin/env node
/**
 * Give every socio row (`organizations/{orgId}/socios`) an explicit
 * `socioNumber`, null.
 *
 * Null, not numbered by alta order: a group arrives with its own numbering —
 * La Anduela's paper libro — and loads it with `scripts/import-socios.mjs` or
 * types it in the roster. Numbers handed out by alta order would collide with
 * the ones the group already uses, and a number once given is never reused.
 * The libro shows an unnumbered row without a number; new rows are numbered by
 * the `assignSocioNumber` trigger.
 *
 * `pre-deploy`: the converter requires the field. Idempotent — a row that has
 * the field (null or a number) is never touched, so an admin's number survives
 * a re-run. Runs after `socio-roster`, whose rows carry the field already.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-socio-number.mjs --env=dev            (dry run)
 *   node scripts/backfill-socio-number.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'socio-number',
  kind: 'backfill',
  description: 'Set organizations/{orgId}/socios.socioNumber: null where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: ['socio-roster'],
};

export function socioNumberPatch(data) {
  return 'socioNumber' in data ? null : { socioNumber: null };
}

export async function run({ db, apply, log }) {
  log('organizations/{orgId}/socios.socioNumber');
  return await backfillCollection(db, 'socios', db.collectionGroup('socios'), (data) => socioNumberPatch(data), {
    apply,
  });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
