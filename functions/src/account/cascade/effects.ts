import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue } from 'firebase-admin/firestore';
import type { CollectionReference, DocumentReference, Firestore, Query, QuerySnapshot } from 'firebase-admin/firestore';
import {
  adminDoc,
  censoAnswersCollection,
  commentsCollection,
  cosasCollection,
  cosaRequestsCollection,
  cosaSlotDoc,
  eventRegistrationPrivateDoc,
  eventsCollection,
  festivalPostersCollection,
  fiestaEditionsCollection,
  historyEntriesCollection,
  newsCollection,
  vocabularyDefinitionsCollection,
  vocabularyTermsCollection,
  organizationDoc,
  organizerRequestsCollection,
  municipalitiesCollection,
  personsCollection,
  pushQueueCollection,
  userBlockedUsersCollection,
  userDevicesCollection,
  userDoc,
  userGroupPrefsCollection,
  userNotificationPrefsDoc,
  userNotificationSettingsDoc,
  userNotificationsCollection,
  userPrivacySettingsDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
// Subpath import (not the '@cultuvilla/shared' barrel): the barrel pulls
// react-native into the functions esbuild bundle. See helpers/membershipAudit.ts.
import { DELETED_USER_UID, reservaSlotKey } from '@cultuvilla/shared/models';
import { writeMembershipEvent } from '../../helpers/membershipAudit';
import type { CascadeContext, CascadeCounts } from './types';

// Stay well under Firestore's hard limit of 500 writes per batch/transaction.
const BATCH_LIMIT = 450;

/**
 * Query a converted collection ref by ref only (no schema parse): the strict
 * converter would `throw` on any pre-existing nonconforming doc, and on this
 * destructive path we only need the DocumentReferences, never the data.
 */
function raw(coll: CollectionReference): CollectionReference {
  return coll.withConverter(null);
}

async function deleteRefsInChunks(db: Firestore, refs: readonly DocumentReference[]): Promise<number> {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}

type Patch = Record<string, string | null | FieldValue>;

async function updateInChunks(db: Firestore, updates: readonly { ref: DocumentReference; data: Patch }[]): Promise<number> {
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { ref, data } of updates.slice(i, i + BATCH_LIMIT)) batch.update(ref.withConverter(null), data);
    await batch.commit();
  }
  return updates.length;
}

/** Takes the query's `.get()` rather than the query, so every collection-group read ends where collectionGroupIndexes.test.ts looks for its clauses. */
async function refsOf(snapshot: Promise<QuerySnapshot>): Promise<DocumentReference[]> {
  return (await snapshot).docs.map((doc) => doc.ref);
}

/**
 * Authored content that is KEPT: the author field becomes the DELETED_USER_UID
 * sentinel and the uid leaves the credit list. `byAuthor` and `byCredit` are
 * the two queries that find it; one document found by both gets one write.
 */
async function anonymiseAuthored(
  db: Firestore,
  uid: string,
  found: { byAuthor: Promise<QuerySnapshot>; authorField: string; byCredit?: Promise<QuerySnapshot>; creditField?: string },
): Promise<number> {
  const [byAuthor, byCredit] = await Promise.all([refsOf(found.byAuthor), found.byCredit ? refsOf(found.byCredit) : []]);
  const updates = new Map<string, { ref: DocumentReference; data: Patch }>();
  for (const ref of byAuthor) updates.set(ref.path, { ref, data: { [found.authorField]: DELETED_USER_UID } });
  if (found.creditField) {
    for (const ref of byCredit) {
      const data = updates.get(ref.path)?.data ?? {};
      data[found.creditField] = FieldValue.arrayRemove(uid);
      updates.set(ref.path, { ref, data });
    }
  }
  return updateInChunks(db, [...updates.values()]);
}

/** A top-level or collection-group source credited by an author field and, optionally, a list of contributors. */
function authoredContent(
  source: (db: Firestore) => Query,
  authorField: string,
  creditField?: string,
): (ctx: CascadeContext) => Promise<CascadeCounts> {
  return async ({ db, uid }) => ({
    anonymised: await anonymiseAuthored(db, uid, {
      byAuthor: source(db).where(authorField, '==', uid).get(),
      authorField,
      ...(creditField ? { byCredit: source(db).where(creditField, 'array-contains', uid).get(), creditField } : {}),
    }),
  });
}

export const anonymiseNews = authoredContent((db) => raw(newsCollection(db)), 'createdBy', 'organizerUserIds');
export const anonymiseEvents = authoredContent((db) => raw(eventsCollection(db)), 'createdBy', 'organizerUserIds');
export const anonymiseFestivalPosters = authoredContent((db) => raw(festivalPostersCollection(db)), 'proposedBy', 'contributorUserIds');
export const anonymiseFiestaEditions = authoredContent((db) => raw(fiestaEditionsCollection(db)), 'proposedBy');
export const anonymiseVocabularyTerms = authoredContent((db) => raw(vocabularyTermsCollection(db)), 'createdBy', 'contributorUserIds');
export const anonymiseVocabularyDefinitions = authoredContent((db) => raw(vocabularyDefinitionsCollection(db)), 'createdBy', 'contributorUserIds');
export const anonymiseHistoryEntries = authoredContent((db) => raw(historyEntriesCollection(db)), 'createdBy');

/** Places and barrios live under each municipality, so they are found across the group. Needs the `places` / `barrios` collection-group overrides in firestore.indexes.json. */
export async function anonymisePlaces({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return {
    anonymised: await anonymiseAuthored(db, uid, {
      byAuthor: db.collectionGroup('places').where('proposedBy', '==', uid).get(),
      authorField: 'proposedBy',
      byCredit: db.collectionGroup('places').where('contributorUserIds', 'array-contains', uid).get(),
      creditField: 'contributorUserIds',
    }),
  };
}

export async function anonymiseBarrios({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return {
    anonymised: await anonymiseAuthored(db, uid, {
      byAuthor: db.collectionGroup('barrios').where('proposedBy', '==', uid).get(),
      authorField: 'proposedBy',
    }),
  };
}

/**
 * Hard-delete every comment the user authored — free-text PII with no value
 * once the author is erased.
 */
export async function deleteComments({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return { deleted: await deleteRefsInChunks(db, await refsOf(raw(commentsCollection(db)).where('authorUserId', '==', uid).get())) };
}

/**
 * Hard-delete every chat message the user wrote: a group's general thread, the
 * avisos' and the tasks' comments, and a cosa request's. Leaving a group keeps
 * them under the name they had; erasing the account does not — each one
 * carries the name and free text. A reply elsewhere that quotes one of them
 * loses the quote (`replyTo` copies the name and the text whole). Needs the
 * `chat.authorUid` and `chat.replyTo.authorUid` collection-group overrides.
 */
export async function deleteChatMessages({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const [mine, quoting] = await Promise.all([
    refsOf(db.collectionGroup('chat').where('authorUid', '==', uid).get()),
    refsOf(db.collectionGroup('chat').where('replyTo.authorUid', '==', uid).get()),
  ]);
  const gone = new Set(mine.map((ref) => ref.path));
  const unquoted = await updateInChunks(
    db,
    quoting.filter((ref) => !gone.has(ref.path)).map((ref) => ({ ref, data: { replyTo: FieldValue.delete() } })),
  );
  return { deleted: await deleteRefsInChunks(db, mine), unquoted };
}

/**
 * The user's cosateca: the cosas they own, the requests they made and the
 * requests made of their cosas (each names a person and carries free text).
 * What they gave to a group is the group's and stays, without their name or
 * uid on it. A cosa they hold is let go (`heldBy` cleared), its request gone;
 * the requests waiting on them as a shared cosa's holder go back to the group's
 * admins (`holderUid` cleared).
 */
export async function deleteCosateca({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const [owned, offered, asked, askedOfMe, held, askedOfHolder] = await Promise.all([
    cosasCollection(db).where('ownerUid', '==', uid).get(),
    cosasCollection(db).where('createdBy', '==', uid).get(),
    cosaRequestsCollection(db).where('requesterUid', '==', uid).get(),
    cosaRequestsCollection(db).where('ownerUid', '==', uid).get(),
    cosasCollection(db).where('heldBy.uid', '==', uid).get(),
    cosaRequestsCollection(db).where('holderUid', '==', uid).get(),
  ]);
  const deletedCosaIds = new Set(owned.docs.map((d) => d.id));
  const unnamed = offered.docs.filter((d) => !deletedCosaIds.has(d.id));
  await updateInChunks(db, unnamed.map((d) => ({ ref: d.ref, data: { createdBy: DELETED_USER_UID, createdByName: '' } })));
  const heldElsewhere = held.docs.filter((d) => !deletedCosaIds.has(d.id));
  await updateInChunks(db, heldElsewhere.map((d) => ({ ref: d.ref, data: { heldBy: null } })));
  const goneIds = new Set([...asked.docs, ...askedOfMe.docs].map((d) => d.id));
  const repoint = askedOfHolder.docs.filter((d) => !goneIds.has(d.id));
  await updateInChunks(db, repoint.map((d) => ({ ref: d.ref, data: { holderUid: null } })));
  // A booking they made frees its slot; a reserva they own takes its slots with it.
  const slotRefs = asked.docs.flatMap((d) => {
    const req = d.data();
    return req.cosaKind === 'reserva' && req.startAt ? [cosaSlotDoc(db, req.cosaId, reservaSlotKey(req.startAt))] : [];
  });
  const slotSnaps = await Promise.all(slotRefs.map((ref) => ref.get()));
  await deleteRefsInChunks(
    db,
    slotSnaps.filter((snap) => asked.docs.some((d) => d.id === snap.data()?.requestId)).map((snap) => snap.ref),
  );
  for (const d of owned.docs) await db.recursiveDelete(d.ref.collection('slots'));
  const requestRefs = new Map([...asked.docs, ...askedOfMe.docs].map((d) => [d.id, d.ref]));
  // A request's chat goes with it: the other party's messages could never be reached again.
  for (const ref of requestRefs.values()) await db.recursiveDelete(ref.collection('chat'));
  const cosaRequestsDeleted = await deleteRefsInChunks(db, [...requestRefs.values()]);
  const cosasDeleted = await deleteRefsInChunks(db, owned.docs.map((d) => d.ref));
  return { cosasDeleted, cosasUnnamed: unnamed.length, cosaRequestsDeleted };
}

/**
 * Device tokens address a push at a specific phone, so they are personal data
 * in their own right. The preferences docs (account and per group), the privacy
 * choices and any queued-but-unsent pushes go with them; the queue entries
 * carry the uid. Runs before the rest so nothing reaches a phone while the
 * account is torn down.
 */
export async function deletePushData({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const [devices, queued, groupPrefs] = await Promise.all([
    refsOf(raw(userDevicesCollection(db, uid)).get()),
    refsOf(raw(pushQueueCollection(db)).where('userId', '==', uid).get()),
    refsOf(raw(userGroupPrefsCollection(db, uid)).get()),
  ]);
  return {
    deleted: await deleteRefsInChunks(db, [
      ...devices,
      ...queued,
      ...groupPrefs,
      userNotificationPrefsDoc(db, uid).withConverter(null),
      userNotificationSettingsDoc(db, uid).withConverter(null),
      userPrivacySettingsDoc(db, uid).withConverter(null),
    ]),
  };
}

/**
 * Clear the phone and email the user shared with each group they were a socio
 * of, current or past. The group is the controller of its libro de socios, so
 * the row itself (name, number, alta, baja, cuotas) stays; only the contact
 * goes. Needs the `socios.uid` collection-group override.
 */
export async function clearSocioContacts({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const rows = await db.collectionGroup('socios').where('uid', '==', uid).get();
  const privateRefs = rows.docs.flatMap((row) => {
    const org = row.ref.parent.parent;
    return org ? [org.collection('socioPrivate').doc(row.id)] : [];
  });
  const privateSnaps = await Promise.all(privateRefs.map((ref) => ref.get()));
  const refs = privateSnaps.flatMap((snap) => (snap.exists ? [snap.ref] : []));
  return { cleared: await updateInChunks(db, refs.map((ref) => ({ ref, data: { phone: null, email: null } }))) };
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
export async function removeMemberships({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const membershipsSnap = await db.collectionGroup('members').where('userId', '==', uid).get();

  const items: MembershipToRemove[] = [];
  for (const doc of membershipsSnap.docs) {
    const groupDoc = doc.ref.parent.parent;
    const parentCollection = groupDoc?.parent.id;
    if (!groupDoc) continue;
    const role = (doc.data().role as string | undefined) ?? null;
    if (parentCollection === 'municipalities') {
      items.push({ ref: doc.ref, scopeType: 'village', scopeId: groupDoc.id, municipalityId: groupDoc.id, role, needsMunicipalityLookup: false });
    } else if (parentCollection === 'organizations') {
      items.push({ ref: doc.ref, scopeType: 'org', scopeId: groupDoc.id, municipalityId: '', role, needsMunicipalityLookup: true });
    }
  }

  if (items.length === 0) return { removed: 0 };

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

  return { removed: items.length };
}

/** Requests to join a group they never got an answer to. Needs the `joinRequests.userId` collection-group override. */
export async function deleteJoinRequests({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return { deleted: await deleteRefsInChunks(db, await refsOf(db.collectionGroup('joinRequests').where('userId', '==', uid).get())) };
}

/**
 * Delete the user's own person doc(s) (`userId == uid`) plus the dependent
 * personas they created that never got their own account
 * (`createdBy == uid && userId == null`). A persona they created that now
 * belongs to a DIFFERENT account stays that account's, with the sentinel as
 * its creator. Splitting the createdBy set in code avoids a two-equality
 * composite index.
 */
export async function deletePersons({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const persons = raw(personsCollection(db));
  const [selfSnap, createdSnap] = await Promise.all([
    persons.where('userId', '==', uid).get(),
    persons.where('createdBy', '==', uid).get(),
  ]);

  const refs = new Map<string, DocumentReference>();
  for (const doc of selfSnap.docs) refs.set(doc.ref.path, doc.ref);
  const handedOver: DocumentReference[] = [];
  for (const doc of createdSnap.docs) {
    if (refs.has(doc.ref.path)) continue;
    if (doc.data().userId == null) refs.set(doc.ref.path, doc.ref);
    else handedOver.push(doc.ref);
  }

  const unnamed = await updateInChunks(db, handedOver.map((ref) => ({ ref, data: { createdBy: DELETED_USER_UID } })));
  return { deleted: await deleteRefsInChunks(db, [...refs.values()]), unnamed };
}

/**
 * Every registration they booked, and every one of their own persona booked by
 * someone else, each with its organizer-only private half (phone, birth date,
 * the signup answers), which shares the registration's id. Needs the
 * `registrations.userId` and `registrations.personUserId` collection-group overrides.
 */
export async function deleteRegistrations({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const [booked, ofThem] = await Promise.all([
    refsOf(db.collectionGroup('registrations').where('userId', '==', uid).get()),
    refsOf(db.collectionGroup('registrations').where('personUserId', '==', uid).get()),
  ]);
  const registrations = [...new Map([...booked, ...ofThem].map((ref) => [ref.path, ref])).values()];
  const privateHalves = registrations.flatMap((ref) => {
    const eventId = ref.parent.parent?.id;
    return eventId ? [eventRegistrationPrivateDoc(db, eventId, ref.id)] : [];
  });
  const privateDeleted = await deleteRefsInChunks(db, privateHalves);
  return { deleted: await deleteRefsInChunks(db, registrations), privateDeleted };
}

/** The claim links they made for the open seats of their group: each one is a secret that would seat a stranger on their behalf. Needs the `seatTokens.createdBy` collection-group override. */
export async function deleteSeatTokens({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return { deleted: await deleteRefsInChunks(db, await refsOf(db.collectionGroup('seatTokens').where('createdBy', '==', uid).get())) };
}

export async function deleteNotifications({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return { deleted: await deleteRefsInChunks(db, await refsOf(raw(userNotificationsCollection(db, uid)).get())) };
}

export async function deleteOrganizerRequests({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return { deleted: await deleteRefsInChunks(db, await refsOf(raw(organizerRequestsCollection(db)).where('userId', '==', uid).get())) };
}

/**
 * Null any `community.organizerId` that still points at the departing user, so
 * the Embajador pointer never dangles at a deleted uid. This grants no
 * authority (authority is the `role` flag), so nulling it is safe.
 */
export async function nullOrganizerPointers({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const refs = await refsOf(raw(municipalitiesCollection(db)).where('community.organizerId', '==', uid).get());
  return {
    nulled: await updateInChunks(db, refs.map((ref) => ({ ref, data: { 'community.organizerId': null, 'community.organizerSex': null } }))),
  };
}

/** Their censo answers, in every pueblo. Leaving a pueblo purges them too (purgeMemberCensoAnswers); this catches the ones a membership no longer explains. */
export async function deleteCensoAnswers({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return { deleted: await deleteRefsInChunks(db, await refsOf(raw(censoAnswersCollection(db)).where('userId', '==', uid).get())) };
}

export async function deleteBlockedUsers({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  return { deleted: await deleteRefsInChunks(db, await refsOf(raw(userBlockedUsersCollection(db, uid)).get())) };
}

/** An app admin's grant: `admins/{uid}` would otherwise outlive the account it empowers. */
export async function deleteAdminGrant({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  const ref = adminDoc(db, uid).withConverter(null);
  const existed = (await ref.get()).exists;
  if (existed) await ref.delete();
  return { deleted: existed ? 1 : 0 };
}

/**
 * Delete the departing user's uploaded photos from Cloud Storage: their account
 * avatar and every persona photo they uploaded. Both onboarding and the person
 * editor write to `users/{uid}/photo/...` (via `uploadUserPhoto`), so that
 * prefix covers self + dependents. The `photoURL` stored on the doc is a
 * download URL, not a storage path, so we delete by the derivable prefix.
 *
 * Best-effort: a storage failure is logged but must NOT abort the erasure —
 * that would leave the account's Firestore data half-deleted. `deleteFiles` is
 * idempotent, so the callable can be re-invoked to retry.
 */
export async function deleteStoragePhotos({ uid }: CascadeContext): Promise<CascadeCounts> {
  const prefix = `users/${uid}/`;
  try {
    await getStorage().bucket().deleteFiles({ prefix });
    return { failed: 0 };
  } catch (err) {
    logger.warn('failed to delete storage photos', {
      handler: 'deleteAccount',
      uid,
      prefix,
      error: err instanceof Error ? err.message : String(err),
    });
    return { failed: 1 };
  }
}

/** The profile doc goes last of the data: its deletion fires syncPublicProfile, which removes `publicProfiles/{uid}`. */
export async function deleteUserDoc({ db, uid }: CascadeContext): Promise<CascadeCounts> {
  await userDoc(db, uid).delete();
  return { deleted: 1 };
}
