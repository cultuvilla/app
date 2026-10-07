#!/usr/bin/env node
/**
 * Seed `publicProfiles/{uid}` from every existing `users/{uid}`.
 *
 * `users/{uid}` is readable by its owner only; everything the app shows about
 * *another* account (name, active village) now comes from this projection,
 * which the `syncPublicProfile` trigger keeps in sync from here on. Accounts
 * that existed before the trigger have no row until this runs, so their names
 * would fall back to "Usuario" and their profile screen would 404.
 *
 * `pre-deploy`: the client that reads the projection ships in the same deploy.
 * Additive and idempotent — rewrites only rows whose projected fields differ,
 * and deletes rows whose account is gone — so the deploy applies it unattended.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-public-profiles.mjs --env=dev            (dry run)
 *   node scripts/backfill-public-profiles.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { BatchWriter } from './lib/backfill.mjs';

export const meta = {
  id: 'public-profiles',
  kind: 'backfill',
  description: 'Seed publicProfiles/{uid} (displayName + activeMunicipalityId) from users/{uid}',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

// Mirrors projectPublicProfile in functions/src/users/syncPublicProfile.ts.
export function projectPublicProfile(user) {
  return {
    displayName: typeof user.displayName === 'string' ? user.displayName : '',
    activeMunicipalityId:
      typeof user.activeMunicipalityId === 'string' ? user.activeMunicipalityId : null,
  };
}

export async function run({ db, apply, log }) {
  log('publicProfiles from users');
  const [users, existing] = await Promise.all([
    db.collection('users').get(),
    db.collection('publicProfiles').get(),
  ]);
  const existingById = new Map(existing.docs.map((d) => [d.id, d.data()]));
  const writer = new BatchWriter(db, { apply });
  let written = 0;
  let deleted = 0;

  for (const user of users.docs) {
    const want = projectPublicProfile(user.data());
    const have = existingById.get(user.id);
    if (
      have
      && have.displayName === want.displayName
      && have.activeMunicipalityId === want.activeMunicipalityId
      && Object.keys(have).length === 2
    ) {
      continue;
    }
    written++;
    await writer.set(db.collection('publicProfiles').doc(user.id), want);
  }

  const userIds = new Set(users.docs.map((d) => d.id));
  for (const id of existingById.keys()) {
    if (userIds.has(id)) continue;
    deleted++;
    await writer.delete(db.collection('publicProfiles').doc(id));
  }
  await writer.flush();

  console.log(
    `  publicProfiles: ${users.size} accounts — ${apply ? 'wrote' : 'would write'} ${written}, ${apply ? 'deleted' : 'would delete'} ${deleted} orphans`,
  );
  return { total: users.size, patched: written, deleted };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
