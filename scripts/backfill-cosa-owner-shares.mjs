#!/usr/bin/env node
/**
 * A cosa's owner decides how it travels (decided 2026-11-12, user): an
 * integrante's own prestamo is lent and given back, the group's is shared hand
 * to hand. The stored `mode` / `cosaMode` go, and the data follows:
 *
 * - every cosa: `mode` dropped; `createdByName`, who offered it (its owner's
 *   name when it is theirs, else the offerer's public name, else blank); and
 *   the fields the location step added, where a doc predates them
 *   (`location`, `locationNote`, `heldBy.since`) — this replaces
 *   `backfill-cosa-location-mode.mjs`, which wrote `mode`.
 * - a colectivizado cosa an integrante owned passes to its group
 *   (`ownerUid: null`, the group's name), as giving it to the community means.
 * - every request: `cosaMode` dropped, `holderUid` null where missing,
 *   `ownerUid` the cosa's (so a converted cosa's requests are the group's),
 *   and a still-waiting request of a shared cosa someone holds points at that
 *   holder, who answers it now — a group prestamo out on loan used to wait for
 *   its return instead.
 *
 * `pre-deploy`: the strict converters drop `mode` and require `createdByName`.
 * Idempotent — a conformant doc is never touched. The cosateca has only ever
 * run on dev, so beta and prod find nothing.
 *
 * Registered on the backfill harness: see AGENTS.md "Backfills".
 *
 *   node scripts/backfill-cosa-owner-shares.mjs --env=dev            (dry run)
 *   node scripts/backfill-cosa-owner-shares.mjs --env=dev --apply
 */

import admin from 'firebase-admin';
import { isMain, runBackfill } from './lib/backfill-harness.mjs';
import { BatchWriter } from './lib/backfill.mjs';

export const meta = {
  id: 'cosa-owner-shares',
  kind: 'migration',
  description: 'Drop cosas.mode/cosaRequests.cosaMode, add cosas.createdByName, give colectivizado cosas to their group',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: ['dev', 'beta', 'prod'],
  dependsOn: ['cosateca-reservas'],
};

const WAITING = ['pending', 'accepted'];

/**
 * A cosa's patch. `ctx` carries what needs a read: `heldSince` (the holder's
 * request time, when `heldBy` lacks `since`), `groupName` and `offererName`.
 * `del` is the field-delete sentinel.
 */
export function cosaOwnerSharesPatch(data, ctx, del) {
  const patch = {};
  if (!('location' in data)) patch.location = null;
  if (!('locationNote' in data)) patch.locationNote = null;
  if (data.heldBy && !('since' in data.heldBy)) patch['heldBy.since'] = ctx.heldSince ?? new Date();
  if (!('createdByName' in data)) patch.createdByName = data.ownerUid ? data.ownerName : (ctx.offererName ?? '');
  if (data.mode === 'colectivizado' && data.ownerUid && typeof ctx.groupName === 'string') {
    patch.ownerUid = null;
    patch.ownerName = ctx.groupName;
  }
  if ('mode' in data) patch.mode = del;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** `cosa` is the cosa as it is after its own patch, or null when it is gone. */
export function cosaRequestOwnerSharesPatch(data, cosa, del) {
  const patch = {};
  if ('cosaMode' in data) patch.cosaMode = del;
  const holderUid = data.holderUid ?? null;
  if (!('holderUid' in data)) patch.holderUid = null;
  if (cosa && cosa.ownerUid !== data.ownerUid) patch.ownerUid = cosa.ownerUid;
  const shared = cosa && cosa.kind === 'prestamo' && cosa.ownerUid === null;
  if (
    shared &&
    cosa.heldBy &&
    holderUid === null &&
    WAITING.includes(data.status) &&
    data.requesterUid !== cosa.heldBy.uid
  ) {
    patch.holderUid = cosa.heldBy.uid;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** The cosa after `patch`, as the request pass sees it. */
function patched(data, patch) {
  if (!patch) return data;
  const next = { ...data };
  if ('ownerUid' in patch) next.ownerUid = patch.ownerUid;
  return next;
}

export async function run({ db, apply, log }) {
  log('cosas: mode → owner, createdByName; cosaRequests: cosaMode, ownerUid, holderUid');
  const del = admin.firestore.FieldValue.delete();
  const groupNames = new Map();
  const groupName = async (orgId) => {
    if (!groupNames.has(orgId)) groupNames.set(orgId, (await db.collection('organizations').doc(orgId).get()).data()?.name);
    return groupNames.get(orgId);
  };
  const offererName = async (uid) => (uid ? (await db.collection('publicProfiles').doc(uid).get()).data()?.displayName : undefined);
  const heldSince = async (heldBy) => {
    if (!heldBy || 'since' in heldBy || !heldBy.requestId) return null;
    const req = (await db.collection('cosaRequests').doc(heldBy.requestId).get()).data();
    return req?.respondedAt ?? req?.createdAt ?? null;
  };

  const writer = new BatchWriter(db, { apply });
  const cosas = new Map();
  let cosasPatched = 0;
  const cosaSnap = await db.collection('cosas').get();
  for (const doc of cosaSnap.docs) {
    const data = doc.data();
    const ctx = {
      heldSince: await heldSince(data.heldBy),
      groupName: data.mode === 'colectivizado' && data.ownerUid ? await groupName(data.orgId) : undefined,
      offererName: !('createdByName' in data) && !data.ownerUid ? await offererName(data.createdBy) : undefined,
    };
    const patch = cosaOwnerSharesPatch(data, ctx, del);
    cosas.set(doc.id, patched(data, patch));
    if (!patch) continue;
    cosasPatched++;
    await writer.update(doc.ref, patch);
  }
  log(`  cosas: ${cosaSnap.size} docs — ${apply ? 'patched' : 'would patch'} ${cosasPatched}`);

  let requestsPatched = 0;
  const reqSnap = await db.collection('cosaRequests').get();
  for (const doc of reqSnap.docs) {
    const data = doc.data();
    const patch = cosaRequestOwnerSharesPatch(data, cosas.get(data.cosaId) ?? null, del);
    if (!patch) continue;
    requestsPatched++;
    await writer.update(doc.ref, patch);
  }
  await writer.flush();
  log(`  cosaRequests: ${reqSnap.size} docs — ${apply ? 'patched' : 'would patch'} ${requestsPatched}`);
  return { patched: cosasPatched + requestsPatched, total: cosaSnap.size + reqSnap.size };
}

if (isMain(import.meta.url)) await runBackfill({ meta, run });
