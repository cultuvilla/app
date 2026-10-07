#!/usr/bin/env node
/**
 * seed-village-requests.mjs
 *
 * Activates real villages in dev Firestore (`villa-events`) by replaying the
 * actual organizer-request → admin-approval flow that the app exposes via the
 * `requestOrganizeVillage` / `respondToOrganizerRequest` Cloud Functions.
 * Doc writes are done with the admin SDK directly (rather than calling the
 * callables over HTTP), so the result is identical end-state plus a complete
 * audit trail in `organizerRequests`.
 *
 * For each village in the dataset (default `real_villages_1`):
 *   1. Look up requester (organizerEmail) and approver (approverEmail) in Auth.
 *   2. Verify approver is in `admins/{uid}` (mirrors the callable's check).
 *   3. Look up the municipality doc by `codigoINE` (the loaded collection
 *      uses auto-IDs — `seed-municipalities.mjs`).
 *   4. Insert `organizerRequests/{requestId}` with status=pending.
 *   5. In a transaction: flip status to approved + activate community + create
 *      member at `municipalities/{id}/members/{requesterUid}`.
 *   6. Optionally patch community.description (sim of the new organizer filling
 *      in the village info post-activation).
 *
 * USAGE
 *   DATASET=real_villages_1 pnpm seed:villages         # default DATASET
 *   DATASET=real_villages_1 pnpm seed:villages:wipe
 *
 *   Run AFTER `pnpm seed:dev` with DATASET=real_user_data_1 (or any dataset
 *   that creates the requester + approver users), and AFTER
 *   `pnpm seed:municipalities` (so the target municipality exists).
 *
 * AUTHENTICATION
 *   Requires GOOGLE_APPLICATION_CREDENTIALS (Storage uploads for escudo images
 *   need a signed-URL-capable identity; everything else also works with ADC).
 *
 * SAFETY
 *   - Dev-only (`villa-events`).
 *   - Idempotent: if a non-pending request already exists for (requester,
 *     municipality), the village is treated as already-activated and skipped.
 *   - Wipe reverts only the villages declared in the dataset.
 */

import admin from 'firebase-admin';
import { existsSync, readFileSync } from 'fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { buildVillageMemberData, buildOrganizerRequestData } from '@cultuvilla/shared/models';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PROJECT_ID = 'villa-events';
const BUCKET = 'villa-events.firebasestorage.app';
const WIPE = process.argv.includes('--wipe');
const DATASET = (process.env.DATASET ?? 'real_villages_1').trim();
const FIXTURES_ROOT = path.join(repoRoot, 'scripts', 'data', 'seed-fixtures');
const DATASET_DIR = path.join(FIXTURES_ROOT, DATASET);
const DATASET_SLUG = DATASET.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const SEED_BATCH = `dev-villages-${DATASET_SLUG}`;
const IMAGE_FILE_PREFIX = 'seed-';
const CONTENT_TYPE_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function resolveProjectId() {
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  const firebaseJsonPath = path.join(repoRoot, 'firebase.json');
  if (existsSync(firebaseJsonPath)) {
    try {
      const fj = JSON.parse(readFileSync(firebaseJsonPath, 'utf8'));
      if (fj.projectId) return fj.projectId;
    } catch { /* ignore */ }
  }
  const rcPath = path.join(repoRoot, '.firebaserc');
  if (existsSync(rcPath)) {
    try {
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
      if (rc?.projects?.default) return rc.projects.default;
    } catch { /* ignore */ }
  }
  return PROJECT_ID;
}
const projectId = resolveProjectId();
if (projectId !== PROJECT_ID) {
  console.error(`[seed-villages] Refusing project "${projectId}". Dev-only (${PROJECT_ID}).`);
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    '[seed-villages] GOOGLE_APPLICATION_CREDENTIALS not set. See firebase-admin-dev skill.',
  );
  process.exit(1);
}
if (!existsSync(path.join(DATASET_DIR, 'fixtures.mjs'))) {
  console.error(`[seed-villages] No fixtures.mjs at scripts/data/seed-fixtures/${DATASET}/`);
  process.exit(1);
}

admin.initializeApp({ projectId, storageBucket: BUCKET });
const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();
const { FieldValue } = admin.firestore;

function publicUrl(objectPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function resolveImage(ref) {
  return ref.includes('/') ? path.join(repoRoot, ref) : path.join(DATASET_DIR, 'images', ref);
}

async function uploadImage(ref, remoteFolder) {
  const localAbs = resolveImage(ref);
  if (!existsSync(localAbs)) {
    throw new Error(`Image not found: ${path.relative(repoRoot, localAbs)} (ref "${ref}")`);
  }
  const buf = await readFile(localAbs);
  const remotePath = `${remoteFolder}/${IMAGE_FILE_PREFIX}${path.basename(ref)}`;
  const file = bucket.file(remotePath);
  const [exists] = await file.exists();
  if (exists) {
    const [meta] = await file.getMetadata();
    if (Number(meta.size) === buf.length) return publicUrl(remotePath);
  }
  await file.save(buf, {
    contentType: CONTENT_TYPE_BY_EXT[path.extname(ref).toLowerCase()] ?? 'application/octet-stream',
    metadata: {
      cacheControl: 'public, max-age=86400',
      metadata: { seedBatch: SEED_BATCH },
    },
    resumable: false,
  });
  return publicUrl(remotePath);
}

async function loadDataset() {
  const url = pathToFileURL(path.join(DATASET_DIR, 'fixtures.mjs')).href;
  const mod = await import(url);
  const data = mod.default ?? mod;
  if (!Array.isArray(data?.villages)) {
    throw new Error(`Dataset "${DATASET}" must export villages[]`);
  }
  return data;
}

async function uidForEmail(email) {
  try {
    const user = await auth.getUserByEmail(email);
    return user.uid;
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      throw new Error(`User ${email} does not exist. Run \`pnpm seed:dev\` first.`);
    }
    throw err;
  }
}

async function findMunicipalityByINE(codigoINE) {
  const snap = await db.collection('municipalities').where('codigoINE', '==', codigoINE).limit(1).get();
  if (snap.empty) {
    throw new Error(
      `No municipality with codigoINE="${codigoINE}". Run \`pnpm seed:municipalities\` first.`,
    );
  }
  return snap.docs[0];
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seedOne(v) {
  console.log(`[seed-villages] processing ${v.name} (INE ${v.codigoINE})`);
  const requesterUid = await uidForEmail(v.organizerEmail);
  const approverUid = await uidForEmail(v.approverEmail);

  const approverAdmin = await db.collection('admins').doc(approverUid).get();
  if (!approverAdmin.exists) {
    throw new Error(`Approver ${v.approverEmail} is not in admins/. Run \`pnpm seed:dev\` first.`);
  }

  const muniSnap = await findMunicipalityByINE(v.codigoINE);
  const muniId = muniSnap.id;

  // Idempotency: any existing approved request for (requester, municipality) → done.
  const existing = await db
    .collection('organizerRequests')
    .where('userId', '==', requesterUid)
    .where('municipalityId', '==', muniId)
    .where('status', 'in', ['pending', 'approved'])
    .get();
  const alreadyApproved = existing.docs.find((d) => d.data().status === 'approved');
  if (alreadyApproved) {
    console.log(`[seed-villages]   already approved (request ${alreadyApproved.id}) — patching extras`);
    await patchCommunityExtras(v, muniId);
    return;
  }

  // Pre-flight matching the Cloud Function checks.
  if (muniSnap.get('communityActive') === true) {
    throw new Error(
      `Municipality ${muniId} (${v.name}) already has an active community owned by someone else. ` +
        `Wipe first or pick a different INE.`,
    );
  }

  // The request now carries the village data (description), and approval copies
  // it into the community — resolve the description up front, before the request exists.
  const description = typeof v.description === 'string' ? v.description : '';

  // Step 1: create the pending request (mirrors requestOrganizeVillage callable).
  let reqRef;
  const pending = existing.docs.find((d) => d.data().status === 'pending');
  if (pending) {
    reqRef = pending.ref;
    await reqRef.update({ description });
    console.log(`[seed-villages]   reusing pending request ${reqRef.id}`);
  } else {
    reqRef = db.collection('organizerRequests').doc();
    await reqRef.set({
      ...buildOrganizerRequestData({
        userId: requesterUid,
        municipalityId: muniId,
        description,
        motivation: v.motivation ?? null,
      }),
      seedBatch: SEED_BATCH,
    });
    console.log(`[seed-villages]   pending request ${reqRef.id} created by ${v.organizerEmail}`);
  }

  // Step 2: approve in a transaction (mirrors respondToOrganizerRequest callable).
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(reqRef);
    if (fresh.get('status') !== 'pending') {
      throw new Error(`Request ${reqRef.id} not pending; aborting`);
    }
    const muniRef = db.doc(`municipalities/${muniId}`);
    const muni = await tx.get(muniRef);
    if (muni.get('communityActive') === true) {
      throw new Error(`Municipality ${muniId} flipped to active during seeding; aborting`);
    }

    tx.update(reqRef, {
      status: 'approved',
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: approverUid,
    });
    tx.update(muniRef, {
      communityActive: true,
      community: {
        description: fresh.get('description') ?? '',
        organizerId: requesterUid,
        organizerSex: null,
        profileForm: null,
        fiestas: [],
        activatedAt: FieldValue.serverTimestamp(),
      },
    });
    tx.set(db.doc(`municipalities/${muniId}/members/${requesterUid}`), {
      ...buildVillageMemberData({ userId: requesterUid, role: 'admin' }),
      seedBatch: SEED_BATCH,
    });
  });
  console.log(`[seed-villages]   approved by ${v.approverEmail} — ${v.name} now active`);
}

// ── Wipe ─────────────────────────────────────────────────────────────────────

async function wipeStorageFolder(prefix) {
  try {
    const [files] = await bucket.getFiles({ prefix });
    if (!files.length) return 0;
    await Promise.all(files.map((f) => f.delete().catch(() => {})));
    return files.length;
  } catch (err) {
    console.warn(`[wipe-villages] storage prefix ${prefix}: ${err.message}`);
    return 0;
  }
}

async function wipeOne(v) {
  console.log(`[wipe-villages] reverting ${v.name} (INE ${v.codigoINE})`);
  let requesterUid;
  try {
    requesterUid = await uidForEmail(v.organizerEmail);
  } catch (err) {
    console.warn(`[wipe-villages]   requester missing, skipping member cleanup: ${err.message}`);
  }

  let muniId;
  try {
    const muniSnap = await findMunicipalityByINE(v.codigoINE);
    muniId = muniSnap.id;
  } catch (err) {
    console.warn(`[wipe-villages]   municipality missing: ${err.message}`);
  }

  if (muniId) {
    await db.doc(`municipalities/${muniId}`).update({
      community: null,
      communityActive: false,
    }).catch(() => {});
    if (requesterUid) {
      await db
        .doc(`municipalities/${muniId}/members/${requesterUid}`)
        .delete()
        .catch(() => {});
    }
    await wipeStorageFolder(`municipalities/${muniId}/`);
  }

  if (requesterUid) {
    const reqSnap = await db
      .collection('organizerRequests')
      .where('userId', '==', requesterUid)
      .where('municipalityId', '==', muniId ?? '__unknown__')
      .get();
    await Promise.all(reqSnap.docs.map((d) => d.ref.delete().catch(() => {})));
    console.log(`[wipe-villages]   removed ${reqSnap.size} request doc(s)`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const dataset = await loadDataset();
  console.log(`[seed-villages] project=${projectId} dataset=${DATASET} batch=${SEED_BATCH}`);
  if (WIPE) {
    for (const v of dataset.villages) await wipeOne(v);
    console.log('[wipe-villages] done.');
  } else {
    for (const v of dataset.villages) await seedOne(v);
    console.log('[seed-villages] done.');
  }
})().catch((err) => {
  console.error('[seed-villages] fatal:', err);
  process.exit(1);
});
