#!/usr/bin/env node
/**
 * Give every organization an explicit `joinPolicy`.
 *
 * Private events are now readable only through membership of an `approval`
 * org (anyone can walk into an `open` one). Orgs that already hold a private
 * event are therefore set to `approval`, so their members keep seeing those
 * events; every other org is `open`, which is how they all behaved until now.
 * Existing members stay members either way.
 *
 * `pre-deploy`: without it, the new rules would hide every existing private
 * event from its org's members the moment they deploy. Idempotent — an org
 * that already has a policy is never touched, so an admin's later choice
 * survives a re-run.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-org-join-policy.mjs --env=dev            (dry run)
 *   node scripts/backfill-org-join-policy.mjs --env=dev --apply
 */

import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { backfillCollection } from './lib/backfill.mjs';

export const meta = {
  id: 'org-join-policy',
  kind: 'backfill',
  description: 'Set organizations.joinPolicy: approval for orgs holding private events, open otherwise',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: [],
};

export function joinPolicyPatch(data, orgId, orgsWithPrivateEvents) {
  if (data.joinPolicy === 'open' || data.joinPolicy === 'approval') return null;
  return { joinPolicy: orgsWithPrivateEvents.has(orgId) ? 'approval' : 'open' };
}

export async function run({ db, apply, log }) {
  log('organizations.joinPolicy');
  const privateEvents = await db.collection('events').where('visibility', '==', 'organization').get();
  const orgsWithPrivateEvents = new Set(
    privateEvents.docs
      .map((d) => d.get('visibilityOrgId'))
      .filter((id) => typeof id === 'string'),
  );
  log(`${orgsWithPrivateEvents.size} org(s) hold private events`);
  return await backfillCollection(
    db,
    'organizations',
    db.collection('organizations'),
    (data, snap) => joinPolicyPatch(data, snap.id, orgsWithPrivateEvents),
    { apply },
  );
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
