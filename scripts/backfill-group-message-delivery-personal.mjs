#!/usr/bin/env node
/**
 * Give every group message delivery
 * (`organizations/{orgId}/messages/{messageId}/deliveries`) an explicit
 * `personal`, null: messages sent before placeholders existed have no values
 * to substitute.
 *
 * `pre-deploy`: the converter requires the field. Idempotent — a delivery that
 * has the field is never touched.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-group-message-delivery-personal.mjs --env=dev            (dry run)
 *   node scripts/backfill-group-message-delivery-personal.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'group-message-delivery-personal',
  kind: 'backfill',
  description: 'Set organizations/{orgId}/messages/{messageId}/deliveries.personal: null where missing',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function deliveryPersonalPatch(data) {
  return 'personal' in data ? null : { personal: null };
}

export async function run({ db, apply, log }) {
  log('deliveries.personal');
  return await backfillCollection(db, 'deliveries', db.collectionGroup('deliveries'), (data) => deliveryPersonalPatch(data), {
    apply,
  });
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
