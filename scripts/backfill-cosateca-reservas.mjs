#!/usr/bin/env node
/**
 * Give every cosa an explicit `reserva` (null: only a reserva carries its
 * config) and every cosa request explicit `startAt` / `endAt` (null: only a
 * reserva booking has a slot), the fields Phase 4 of the cosateca added.
 *
 * `pre-deploy`: the strict converters require both, and docs written before
 * them lack them. Idempotent — a doc that already has the field is never
 * touched. The cosateca has only ever run on dev, so beta and prod find nothing.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-cosateca-reservas.mjs --env=dev            (dry run)
 *   node scripts/backfill-cosateca-reservas.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'cosateca-reservas',
  kind: 'backfill',
  description: 'Set cosas.reserva and cosaRequests.startAt/endAt to null where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function cosaReservaPatch(data) {
  return 'reserva' in data ? null : { reserva: null };
}

export function cosaRequestSlotPatch(data) {
  const patch = {};
  if (!('startAt' in data)) patch.startAt = null;
  if (!('endAt' in data)) patch.endAt = null;
  return Object.keys(patch).length > 0 ? patch : null;
}

export async function run({ db, apply, log }) {
  log('cosas.reserva, cosaRequests.startAt/endAt');
  const cosas = await backfillCollection(db, 'cosas', db.collection('cosas'), (data) => cosaReservaPatch(data), { apply });
  const requests = await backfillCollection(
    db,
    'cosaRequests',
    db.collection('cosaRequests'),
    (data) => cosaRequestSlotPatch(data),
    { apply },
  );
  return { patched: cosas.patched + requests.patched, total: cosas.total + requests.total };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
