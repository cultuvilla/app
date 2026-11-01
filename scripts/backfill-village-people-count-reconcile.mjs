/**
 * Recount municipalities.peopleCount once syncVillagePeopleCount is live.
 *
 * The pre-deploy `village-people-count` sets the count before the trigger that
 * maintains it is deployed, so a person who joins, leaves or moves village in
 * that window is missed — and a quiet village could keep the wrong number until
 * its roster next changes. This pass runs after the deploy, when the trigger
 * already keeps every later change right.
 *
 * So unlike the pre-deploy run it races a live trigger. A count taken from a
 * snapshot and written later could overwrite the trigger's newer one and bring
 * back the drift this exists to remove. The snapshot only picks the suspects;
 * each is recounted in the same kind of transaction the trigger uses, so
 * overlapping writers conflict and the last write is the freshest count.
 *
 *   node scripts/backfill-village-people-count-reconcile.mjs --env=dev            (dry run)
 *   node scripts/backfill-village-people-count-reconcile.mjs --env=beta --confirm --apply
 */
import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { countByMunicipality, peopleCountPatch } from './backfill-village-people-count.mjs';

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

/** True when the count was wrong and has been corrected. */
function recount(db, ref) {
  const rows = db.collection('municipalityPeople').where('municipalityId', '==', ref.id).count();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const peopleCount = (await tx.get(rows)).data().count;
    if (snap.data().peopleCount === peopleCount) return false;
    tx.update(ref, { peopleCount });
    return true;
  });
}

export async function run({ db, apply, log }) {
  log('municipalities.peopleCount, reconciled');
  const rows = await db.collection('municipalityPeople').select('municipalityId').get();
  const counts = countByMunicipality(rows.docs.map((d) => d.data()));
  const municipalities = await db.collection('municipalities').select('peopleCount').get();
  const suspects = municipalities.docs.filter((d) => peopleCountPatch(d.data(), d.id, counts) !== null);
  log(`${municipalities.size} municipalities, ${suspects.length} suspect(s)`);
  if (!apply) return { total: municipalities.size, patched: suspects.length };

  let patched = 0;
  for (const { ref } of suspects) {
    if (await recount(db, ref)) patched++;
  }
  return { total: municipalities.size, patched };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
