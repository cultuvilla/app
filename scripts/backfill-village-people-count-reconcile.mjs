/**
 * Recount municipalities.peopleCount once syncVillagePeopleCount is live.
 *
 * The pre-deploy `village-people-count` sets the count before the trigger that
 * maintains it is deployed, so a person who joins, leaves or moves village in
 * that window is missed — and a quiet village could keep the wrong number until
 * its roster next changes. This is the same recount, run by the deploy's
 * post-deploy pass, when the trigger already keeps every later change right.
 *
 *   node scripts/backfill-village-people-count-reconcile.mjs --env=dev            (dry run)
 *   node scripts/backfill-village-people-count-reconcile.mjs --env=beta --confirm --apply
 */
import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { run } from './backfill-village-people-count.mjs';

export const meta = {
  id: 'village-people-count-reconcile',
  kind: 'backfill',
  description: 'Recount municipalities.peopleCount after syncVillagePeopleCount is deployed',
  phase: 'post-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  // The deploy never auto-applies on dev; run it there by hand after a deploy.
  autoApply: ['beta', 'prod'],
  dependsOn: ['village-people-count'],
};

export { run };

if (isMain(import.meta.url)) await runBackfill({ meta, run });
