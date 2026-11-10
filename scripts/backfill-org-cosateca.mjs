#!/usr/bin/env node
/**
 * Give every organization an explicit `cosateca` setting, off and for its
 * integrantes — no group runs a cosateca until an admin turns it on.
 *
 * `pre-deploy`: the converter defaults the field for orgs installed binaries
 * still create without it, but existing docs carry it explicitly, as with
 * `chatAdminsOnly`. Idempotent — an org that already has a well-formed setting
 * is never touched, so an admin's choice survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-cosateca.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-cosateca.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-cosateca',
  kind: 'backfill',
  description: "Set organizations.cosateca: { enabled: false, audience: 'integrantes' } where missing",
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function cosatecaPatch(data) {
  const c = data.cosateca;
  const wellFormed =
    c !== null &&
    typeof c === 'object' &&
    typeof c.enabled === 'boolean' &&
    (c.audience === 'integrantes' || c.audience === 'pueblo');
  return wellFormed ? null : { cosateca: { enabled: false, audience: 'integrantes' } };
}

export async function run({ db, apply, log }) {
  log('organizations.cosateca');
  return await backfillCollection(db, 'organizations', db.collection('organizations'), (data) => cosatecaPatch(data), {
    apply,
  });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
