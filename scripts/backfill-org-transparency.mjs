#!/usr/bin/env node
/**
 * Give every organization an explicit `transparency` setting, all off — no
 * group opens its cuota, avisos or accounts to its integrantes until its junta
 * turns a switch on.
 *
 * `pre-deploy`: the converter defaults the field for orgs installed binaries
 * still create without it, but existing docs carry it explicitly, as with
 * `cosateca`. Idempotent — an org that already has a well-formed setting is
 * never touched, so a junta's choice survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-transparency.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-transparency.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-transparency',
  kind: 'backfill',
  description: 'Set organizations.transparency: { cuota: false, avisos: false, cuentas: false } where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

const KEYS = ['cuota', 'avisos', 'cuentas'];

export function transparencyPatch(data) {
  const t = data.transparency;
  const wellFormed =
    t !== null &&
    typeof t === 'object' &&
    Object.keys(t).length === KEYS.length &&
    KEYS.every((k) => typeof t[k] === 'boolean');
  return wellFormed ? null : { transparency: { cuota: false, avisos: false, cuentas: false } };
}

export async function run({ db, apply, log }) {
  log('organizations.transparency');
  return await backfillCollection(db, 'organizations', db.collection('organizations'), (data) => transparencyPatch(data), {
    apply,
  });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
