#!/usr/bin/env node
/**
 * Move every villager's census answers off the world-readable member doc
 * (`municipalities/{id}/members/{uid}.profileAnswers`) into the private
 * `censoAnswers/{municipalityId}_{uid}` doc, then empty the old field.
 *
 * The member doc keeps `profileAnswers: {}` rather than losing the key: store
 * binaries that predate the move require it to parse the doc.
 *
 * `pre-deploy`: the new member schema only accepts `{}` there, so a doc still
 * carrying answers fails the strict converter. Idempotent — a member whose
 * field is already empty is skipped — and the member value always wins over an
 * existing censoAnswers doc, because anything still on the member doc was
 * written by the old code after the last run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-censo-answers-private.mjs --env=dev            (dry run)
 *   node scripts/backfill-censo-answers-private.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { BatchWriter } from './lib/backfill.mjs';

export const meta = {
  id: 'censo-answers-private',
  kind: 'migration',
  description: 'Move members.profileAnswers into the private censoAnswers collection and empty the old field',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function hasAnswers(value) {
  return value != null && typeof value === 'object' && Object.keys(value).length > 0;
}

export async function run({ db, apply, log }) {
  log('members.profileAnswers -> censoAnswers');
  // `members` is also an organizations/ subcollection; only village members
  // carry census answers.
  const members = await db.collectionGroup('members').get();
  const writer = new BatchWriter(db, { apply });
  let villageMembers = 0;
  let moved = 0;
  const now = new Date();

  for (const member of members.docs) {
    const municipality = member.ref.parent.parent;
    if (!municipality || municipality.parent.id !== 'municipalities') continue;
    villageMembers++;
    const profileAnswers = member.get('profileAnswers');
    if (!hasAnswers(profileAnswers)) continue;

    moved++;
    await writer.set(db.collection('censoAnswers').doc(`${municipality.id}_${member.id}`), {
      municipalityId: municipality.id,
      userId: member.id,
      profileAnswers,
      updatedAt: now,
    });
    await writer.update(member.ref, { profileAnswers: {} });
  }
  await writer.flush();

  console.log(
    `  censoAnswers: ${villageMembers} village members — ${apply ? 'moved' : 'would move'} ${moved}, already private ${villageMembers - moved}`,
  );
  return { total: villageMembers, patched: moved };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
