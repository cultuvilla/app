#!/usr/bin/env node
/**
 * Seed the socio roster (`organizations/{orgId}/socios`) for the members who
 * joined before it existed: one `member` row per membership, alta on the
 * member's `joinedAt`. From then on the `syncOrgSocioRoster` trigger keeps the
 * roster in step.
 *
 * It reconciles rather than only seeding, so a re-run also closes the gap
 * between this backfill and the trigger's deploy: a member with no active row
 * gets one, and an active member row (or persona a cargo) whose member has left
 * gets the baja (a persona's lock in socioPersonaLocks goes with it, as the
 * app and the trigger do). Rows are never deleted. The ayuntamiento keeps no
 * roster.
 *
 * `pre-deploy` so the Grupos tab never ships against an empty roster.
 * Idempotent — a member who already has an active row is never touched.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-socio-roster.mjs --env=dev            (dry run)
 *   node scripts/backfill-socio-roster.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { BatchWriter } from './lib/backfill.mjs';

export const meta = {
  id: 'socio-roster',
  kind: 'backfill',
  description: 'Create organizations/{orgId}/socios member rows for existing org members',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

const ROSTER_ORG_TYPES = new Set(['peña', 'asociación', 'otros']);

/**
 * @param {string[]} memberUids current members of the org
 * @param {{ id: string, kind: string, uid: string | null, responsibleUid: string | null }[]} activeRows
 * @returns {{ alta: string[], baja: string[] }} uids needing a row, row ids needing the baja
 */
export function rosterPlan(memberUids, activeRows) {
  const members = new Set(memberUids);
  const withRow = new Set(activeRows.filter((r) => r.uid).map((r) => r.uid));
  const alta = memberUids.filter((uid) => !withRow.has(uid));
  const baja = activeRows
    .filter(
      (r) =>
        (r.kind === 'member' && !members.has(r.uid)) ||
        (r.kind === 'persona' && !members.has(r.responsibleUid)),
    )
    .map((r) => r.id);
  return { alta, baja };
}

export function memberSocioRow(uid, user, joinedAt) {
  return {
    kind: 'member',
    // assignSocioNumber numbers it once created.
    socioNumber: null,
    displayName: (user?.displayName ?? '').trim(),
    uid,
    personId: user?.personId ?? null,
    responsibleUid: null,
    adminTitle: null,
    altaAt: joinedAt,
    bajaAt: null,
    memberJoinedAt: joinedAt,
    createdBy: uid,
  };
}

export async function run({ db, FieldValue, apply, log }) {
  log('organizations/{orgId}/socios');
  const orgs = await db.collection('organizations').get();
  const writer = new BatchWriter(db, { apply });
  let altas = 0;
  let bajas = 0;

  for (const org of orgs.docs) {
    if (!ROSTER_ORG_TYPES.has(org.get('type'))) continue;
    const [members, active] = await Promise.all([
      org.ref.collection('members').get(),
      org.ref.collection('socios').where('bajaAt', '==', null).get(),
    ]);
    const joinedAt = new Map(members.docs.map((m) => [m.id, m.get('joinedAt') ?? new Date()]));
    const plan = rosterPlan(
      members.docs.map((m) => m.id),
      active.docs.map((d) => ({ id: d.id, kind: d.get('kind'), uid: d.get('uid'), responsibleUid: d.get('responsibleUid') })),
    );
    for (const uid of plan.alta) {
      const user = (await db.doc(`users/${uid}`).get()).data();
      await writer.set(org.ref.collection('socios').doc(), memberSocioRow(uid, user, joinedAt.get(uid)));
    }
    const personIdOf = new Map(active.docs.map((d) => [d.id, d.get('personId')]));
    for (const id of plan.baja) {
      await writer.update(org.ref.collection('socios').doc(id), { bajaAt: FieldValue.serverTimestamp() });
      const personId = personIdOf.get(id);
      if (!personId) continue;
      const lock = org.ref.collection('socioPersonaLocks').doc(personId);
      if ((await lock.get()).get('socioId') === id) await writer.delete(lock);
    }
    altas += plan.alta.length;
    bajas += plan.baja.length;
  }
  await writer.flush();

  console.log(`  socios: ${apply ? 'created' : 'would create'} ${altas} alta(s), ${apply ? 'gave' : 'would give'} ${bajas} baja(s)`);
  return { total: orgs.size, patched: altas + bajas };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
