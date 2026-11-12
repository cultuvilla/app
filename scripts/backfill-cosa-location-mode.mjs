#!/usr/bin/env node
/**
 * The fields the cosateca's location and colectivizado mode added (decided
 * 2026-11-12, user):
 * - every cosa: `location` and `locationNote` (null: nowhere said yet) and
 *   `mode` (`prestamo` for a prestamo, which is how every existing one
 *   behaves; null for every other kind);
 * - a cosa someone holds: `heldBy.since`, when it was handed over — the
 *   holder's request's answer time, else when it was made, else now;
 * - every cosa request: `cosaMode` (copied from the kind, as above) and
 *   `holderUid` (null: no existing request is a colectivizado one).
 *
 * `pre-deploy`: the strict converters require them, and docs written before
 * them lack them. Idempotent — a field already present is never touched. The
 * cosateca has only ever run on dev, so beta and prod find nothing.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-cosa-location-mode.mjs --env=dev            (dry run)
 *   node scripts/backfill-cosa-location-mode.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'cosa-location-mode',
  kind: 'backfill',
  description: 'Set cosas.location/locationNote/mode/heldBy.since and cosaRequests.cosaMode/holderUid where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: ['cosateca-reservas'],
};

const modeFor = (kind) => (kind === 'prestamo' ? 'prestamo' : null);

/** `heldSince` is when the holder got it, looked up only when `heldBy` lacks it. */
export function cosaLocationModePatch(data, heldSince = null) {
  const patch = {};
  if (!('location' in data)) patch.location = null;
  if (!('locationNote' in data)) patch.locationNote = null;
  if (!('mode' in data)) patch.mode = modeFor(data.kind);
  if (data.heldBy && !('since' in data.heldBy)) patch['heldBy.since'] = heldSince ?? new Date();
  return Object.keys(patch).length > 0 ? patch : null;
}

export function cosaRequestModePatch(data) {
  const patch = {};
  if (!('cosaMode' in data)) patch.cosaMode = modeFor(data.cosaKind);
  if (!('holderUid' in data)) patch.holderUid = null;
  return Object.keys(patch).length > 0 ? patch : null;
}

async function heldSince(db, heldBy) {
  if (!heldBy || 'since' in heldBy || !heldBy.requestId) return null;
  const req = (await db.collection('cosaRequests').doc(heldBy.requestId).get()).data();
  return req?.respondedAt ?? req?.createdAt ?? null;
}

export async function run({ db, apply, log }) {
  log('cosas.location/locationNote/mode/heldBy.since, cosaRequests.cosaMode/holderUid');
  const cosas = await backfillCollection(
    db,
    'cosas',
    db.collection('cosas'),
    async (data) => cosaLocationModePatch(data, await heldSince(db, data.heldBy)),
    { apply },
  );
  const requests = await backfillCollection(db, 'cosaRequests', db.collection('cosaRequests'), (data) => cosaRequestModePatch(data), {
    apply,
  });
  return { patched: cosas.patched + requests.patched, total: cosas.total + requests.total };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
