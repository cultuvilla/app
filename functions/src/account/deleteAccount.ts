import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import {
  commentsCollection,
  eventsCollection,
  municipalitiesCollection,
  newsCollection,
  organizationDoc,
  organizerRequestsCollection,
  personsCollection,
  userDoc,
  userNotificationsCollection,
  userDevicesCollection,
  userNotificationPrefsDoc,
  pushQueueCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
// Subpath import (not the '@cultuvilla/shared' barrel): the barrel pulls
// react-native into the functions esbuild bundle. See helpers/membershipAudit.ts.
import { DELETED_USER_UID } from '@cultuvilla/shared/models';
import { computeDeletionBlockers } from './blockers';
import { writeMembershipEvent } from '../helpers/membershipAudit';

const db = getFirestore();

// Stay well under Firestore's hard limit of 500 writes per batch/transaction.
const BATCH_LIMIT = 450;

interface DeleteAccountResult {
  ok: true;
}

/**
 * RGPD/GDPR account erasure. Irreversible, destructive: run only after the
 * user has re-authenticated on the client.
 *
 * Order (see .superpowers/sdd/task-7-brief.md):
 *  1. Auth guard.
 *  2. Re-run the sole-admin blocker check server-side — the client's preview is
 *     never trusted. Any blocker aborts BEFORE anything is deleted.
 *  3. Anonymize authored content that is KEPT (news + events): swap `createdBy`
 *     to the DELETED_USER_UID sentinel and pull the uid from `organizerUserIds`.
 *  4. Hard-delete free-text/PII interactions the user authored: comments.
 *     Unlike posts these carry no editorial value once the author is gone.
 *  5. Delete personal data: push devices, preferences and queued pushes (first,
 *     so nothing reaches a phone while the rest is torn down), persons (self +
 *     dependents), memberships (with a `removed` audit event each),
 *     registrations, notifications, organizer requests, dangling organizer
 *     pointers, Cloud Storage photos, and the user profile doc.
 *  6. Delete the Firebase Auth user last — once the data is gone the auth
 *     record has nothing left to protect, and doing it last means a mid-way
 *     failure leaves the account still sign-in-able for a retry.
 */
export const deleteAccount = onCall<undefined, Promise<DeleteAccountResult>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'deleteAccount';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const uid = auth.uid;

    const blockers = await computeDeletionBlockers(db, uid);
    if (blockers.length > 0) {
      throw new HttpsError(
        'failed-precondition',
        'No puedes eliminar tu cuenta mientras seas la única persona al frente de un pueblo u organización. Nombra a alguien más primero.',
      );
    }

    const anonymizedNews = await anonymizeAuthoredContent(newsCollection(db), uid);
    const anonymizedEvents = await anonymizeAuthoredContent(eventsCollection(db), uid);

    const commentsDeleted = await deleteUserComments(uid);

    const pushDataDeleted = await deletePushData(uid);

    const membershipsRemoved = await removeMemberships(uid);
    const personIds = await deletePersons(uid);
    const registrationsDeleted = await deleteRegistrations(uid);
    const notificationsDeleted = await deleteNotifications(uid);
    const organizerRequestsDeleted = await deleteOrganizerRequests(uid);
    const organizerPointersNulled = await nullOrganizerPointers(uid);
    await deleteStoragePhotos(uid);
    await userDoc(db, uid).delete();

    await getAuth().deleteUser(uid);

    logger.info('account deleted', {
      handler,
      uid,
      anonymizedNews,
      anonymizedEvents,
      commentsDeleted,
      membershipsRemoved,
      personsDeleted: personIds.length,
      registrationsDeleted,
      notificationsDeleted,
      pushDataDeleted,
      organizerRequestsDeleted,
      organizerPointersNulled,
    });
    return { ok: true };
  },
);

/**
 * Query a converted collection ref by ref only (no schema parse): the strict
 * converter would `throw` on any pre-existing nonconforming doc, and on this
 * destructive path we only need the DocumentReferences, never the data.
 */
function raw(coll: CollectionReference): CollectionReference {
  return coll.withConverter(null);
}

async function anonymizeAuthoredContent(
  coll: CollectionReference,
  uid: string,
): Promise<number> {
  const rawColl = raw(coll);
  const [byCreator, byOrganizer] = await Promise.all([
    rawColl.where('createdBy', '==', uid).get(),
    rawColl.where('organizerUserIds', 'array-contains', uid).get(),
  ]);

  const updates = new Map<
    string,
    { ref: DocumentReference; data: Record<string, string | FieldValue> }
  >();
  for (const doc of byCreator.docs) {
    updates.set(doc.ref.path, { ref: doc.ref, data: { createdBy: DELETED_USER_UID } });
  }
  for (const doc of byOrganizer.docs) {
    const existing = updates.get(doc.ref.path);
    const data = existing?.data ?? {};
    data.organizerUserIds = FieldValue.arrayRemove(uid);
    updates.set(doc.ref.path, { ref: doc.ref, data });
  }

  const entries = [...updates.values()];
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const entry of entries.slice(i, i + BATCH_LIMIT)) {
      batch.update(entry.ref, entry.data);
    }
    await batch.commit();
  }
  return entries.length;
}

interface MembershipToRemove {
  ref: DocumentReference;
  scopeType: 'village' | 'org';
  scopeId: string;
  municipalityId: string;
  role: string | null;
  needsMunicipalityLookup: boolean;
}

/**
 * Delete every village/org membership the user holds and append one `removed`
 * audit event per membership. Deletion + audit commit atomically so the log
 * can never disagree with the members collection.
 */
async function removeMemberships(uid: string): Promise<number> {
  const membershipsSnap = await db
    .collectionGroup('members')
    .where('userId', '==', uid)
    .get();

  const items: MembershipToRemove[] = [];
  for (const doc of membershipsSnap.docs) {
    const groupDoc = doc.ref.parent.parent;
    const parentCollection = groupDoc?.parent.id;
    if (!groupDoc) continue;
    const role = (doc.data().role as string | undefined) ?? null;
    if (parentCollection === 'municipalities') {
      items.push({
        ref: doc.ref,
        scopeType: 'village',
        scopeId: groupDoc.id,
        municipalityId: groupDoc.id,
        role,
        needsMunicipalityLookup: false,
      });
    } else if (parentCollection === 'organizations') {
      items.push({
        ref: doc.ref,
        scopeType: 'org',
        scopeId: groupDoc.id,
        municipalityId: '',
        role,
        needsMunicipalityLookup: true,
      });
    }
  }

  if (items.length === 0) return 0;

  await db.runTransaction(async (tx) => {
    // Reads before writes: resolve each org's municipalityId (villages already
    // know theirs — it IS the parent doc id).
    for (const item of items) {
      if (!item.needsMunicipalityLookup) continue;
      const orgSnap = await tx.get(organizationDoc(db, item.scopeId));
      item.municipalityId = orgSnap.data()?.municipalityId ?? item.scopeId;
    }
    for (const item of items) {
      tx.delete(item.ref);
      writeMembershipEvent(tx, db, {
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        municipalityId: item.municipalityId,
        actorUserId: uid,
        targetUserId: uid,
        action: 'removed',
        fromRole: item.role,
        toRole: null,
      });
    }
  });

  return items.length;
}

/**
 * Delete the user's own person doc(s) (`userId == uid`) plus the dependent
 * personas they created that never got their own account
 * (`createdBy == uid && userId == null`). Splitting the createdBy set in code
 * avoids a two-equality composite index and, crucially, never deletes a person
 * the user created that belongs to a DIFFERENT account (`userId` set to someone
 * else). Their registrations are cleaned up by `deleteRegistrations` (every
 * dependent's registration was booked by this uid).
 *
 * Returns the deleted persons' doc IDs so their Cloud Storage photos can be
 * purged by prefix.
 */
async function deletePersons(uid: string): Promise<string[]> {
  const persons = raw(personsCollection(db));
  const [selfSnap, createdSnap] = await Promise.all([
    persons.where('userId', '==', uid).get(),
    persons.where('createdBy', '==', uid).get(),
  ]);

  const refs = new Map<string, DocumentReference>();
  for (const doc of selfSnap.docs) refs.set(doc.ref.path, doc.ref);
  for (const doc of createdSnap.docs) {
    if (doc.data().userId === null) refs.set(doc.ref.path, doc.ref);
  }

  const values = [...refs.values()];
  await deleteRefsInChunks(values);
  return values.map((ref) => ref.id);
}

/**
 * Hard-delete every comment the user authored — free-text PII with no value
 * once the author is erased. `comments` is a top-level collection; the single
 * equality on `authorUserId` is served by the automatic single-field index.
 */
async function deleteUserComments(uid: string): Promise<number> {
  const snap = await raw(commentsCollection(db)).where('authorUserId', '==', uid).get();
  return deleteRefsInChunks(snap.docs.map((doc) => doc.ref));
}

/**
 * Delete the departing user's uploaded photos from Cloud Storage: their account
 * avatar and every persona photo they uploaded. Both onboarding and the person
 * editor write to `users/{uid}/photo/...` (via `uploadUserPhoto`), so that
 * prefix covers self + dependents. The `photoURL` stored on the doc is a download URL,
 * not a storage path, so we delete by the derivable prefix rather than parsing
 * the URL.
 *
 * Best-effort: a storage failure is logged but must NOT abort the erasure —
 * that would leave the account's Firestore data half-deleted. `deleteFiles` is
 * idempotent, so the callable can be re-invoked to retry.
 */
async function deleteStoragePhotos(uid: string): Promise<void> {
  const prefix = `users/${uid}/`;
  try {
    await getStorage().bucket().deleteFiles({ prefix });
  } catch (err) {
    logger.warn('failed to delete storage photos', {
      handler: 'deleteAccount',
      uid,
      prefix,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function deleteRegistrations(uid: string): Promise<number> {
  const snap = await db.collectionGroup('registrations').where('userId', '==', uid).get();
  return deleteRefsInChunks(snap.docs.map((doc) => doc.ref));
}

async function deleteNotifications(uid: string): Promise<number> {
  const snap = await raw(userNotificationsCollection(db, uid)).get();
  return deleteRefsInChunks(snap.docs.map((doc) => doc.ref));
}

/**
 * Device tokens address a push at a specific phone, so they are personal data
 * in their own right. The preferences doc and any queued-but-unsent pushes go
 * with them; the queue entries carry the uid.
 */
async function deletePushData(uid: string): Promise<number> {
  const [devices, queued] = await Promise.all([
    raw(userDevicesCollection(db, uid)).get(),
    raw(pushQueueCollection(db)).where('userId', '==', uid).get(),
  ]);
  return deleteRefsInChunks([
    ...devices.docs.map((doc) => doc.ref),
    ...queued.docs.map((doc) => doc.ref),
    userNotificationPrefsDoc(db, uid).withConverter(null),
  ]);
}

async function deleteOrganizerRequests(uid: string): Promise<number> {
  const snap = await raw(organizerRequestsCollection(db)).where('userId', '==', uid).get();
  return deleteRefsInChunks(snap.docs.map((doc) => doc.ref));
}

/**
 * Null any `community.organizerId` that still points at the departing user, so
 * the founding-organizer pointer never dangles at a deleted uid. This grants no
 * authority (authority is the `role` flag), so nulling it is safe.
 */
async function nullOrganizerPointers(uid: string): Promise<number> {
  const snap = await raw(municipalitiesCollection(db))
    .where('community.organizerId', '==', uid)
    .get();
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc.ref, { 'community.organizerId': null, 'community.organizerSex': null });
    }
    await batch.commit();
  }
  return docs.length;
}

async function deleteRefsInChunks(refs: DocumentReference[]): Promise<number> {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}
