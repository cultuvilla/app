import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  municipalityDoc,
  municipalityMembersCollection,
  organizationFollowersCollection,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildNotificationData,
  villageEntityPublishedCopy,
  type BroadcastEntityKind,
} from '@cultuvilla/shared/models';

const db = getFirestore();

export interface BroadcastInput {
  kind: BroadcastEntityKind;
  entityId: string;
  municipalityId: string;
  /** The entity's display name; null when it genuinely has none (a poster). */
  entityLabel: string | null;
  /** Excluded from the fan-out — nobody needs telling about their own post. */
  actorUid: string | null;
  /** Told as well as the village's members: a follower may live elsewhere. */
  extraRecipientUids?: readonly string[];
  /** For the log only. */
  handler: string;
}

/**
 * Tells a village that something new appeared in it.
 *
 * One function for the whole entity family rather than one per collection: the
 * only thing that differs per kind is *when* the entity becomes visible, which
 * is what the triggers below decide. Everything after that point — who to tell,
 * what to say, how it reaches a device — is identical, and a copy of it per
 * kind would be six places to fix the next time any of it changes.
 *
 * Push happens downstream: these writes are ordinary notification docs, so
 * `onNotificationCreated` picks them up like any other. No producer in this
 * codebase knows that push exists.
 */
export async function broadcastToVillage(input: BroadcastInput): Promise<void> {
  const { kind, entityId, municipalityId, entityLabel, actorUid, extraRecipientUids = [], handler } = input;

  // Projection reads: the broadcast needs the village's NAME and the members'
  // IDS, nothing else. `select()` fetches only that — member docs carry profile
  // answers that have no business crossing the wire here — and reading past the
  // converter means a drifted field elsewhere on either doc cannot abort a
  // broadcast that never looks at it.
  const [village, members] = await Promise.all([
    municipalityDoc(db, municipalityId).withConverter(null).get(),
    municipalityMembersCollection(db, municipalityId).withConverter(null).select().get(),
  ]);

  if (!village.exists) return;
  const recipients = new Set([...members.docs.map((m) => m.id), ...extraRecipientUids]);
  if (recipients.size === 0) return;

  const rawName: unknown = village.get('name');
  const villageName = typeof rawName === 'string' && rawName.length > 0 ? rawName : 'tu pueblo';
  const { title, body } = villageEntityPublishedCopy(kind, entityLabel, villageName);

  // BulkWriter, not a batch: a municipality can hold more members than a
  // batch's 500 writes, and the fan-out is one write per member.
  const writer = db.bulkWriter();
  let notified = 0;

  for (const uid of recipients) {
    if (uid === actorUid) continue;
    void writer.set(
      // Deterministic id: Eventarc delivers at least once, and an approval that
      // is redelivered must overwrite this row rather than append a second.
      // An overwrite fires `update`, which onNotificationCreated ignores, so it
      // also cannot buzz the same pocket twice.
      userNotificationsCollection(db, uid).doc(`village_entity_${kind}_${entityId}`),
      buildNotificationData({
        type: 'village_entity_published',
        title,
        body,
        municipalityId,
        entityKind: kind,
        entityId,
      }),
    );
    notified += 1;
  }
  await writer.close();

  logger.info('Village notified of a new entity', {
    handler,
    kind,
    entityId,
    municipalityId,
    memberCount: members.size,
    followerCount: extraRecipientUids.length,
    notifiedCount: notified,
  });
}

// Trigger snapshots are NOT converter-wrapped — raw DocumentData with
// Timestamps. Only strings are read here, so narrow casts are enough.
function str(d: FirebaseFirestore.DocumentData, key: string): string | null {
  const v: unknown = d[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** `active` is the visible state for every moderatable entity; see VisibilityModel. */
function isVisible(d: FirebaseFirestore.DocumentData): boolean {
  return d['status'] === undefined || d['status'] === 'active';
}

async function followersOfOrgs(orgIds: unknown): Promise<string[]> {
  if (!Array.isArray(orgIds)) return [];
  const snaps = await Promise.all(
    orgIds
      .filter((id): id is string => typeof id === 'string')
      .map((id) => organizationFollowersCollection(db, id).withConverter(null).select().get()),
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => d.id));
}

export const onEventPublished = onDocumentCreated('events/{eventId}', async (event) => {
  const d = event.data?.data();
  if (!d) return;
  // Events use their own status enum: `published` is the visible state, and a
  // draft or an already-cancelled import must not announce itself.
  if (d['status'] !== 'published') return;
  // A weekly series lands as one doc per occurrence in a single batch; the
  // village hears about it once, from the first.
  const series: unknown = d['series'];
  if (typeof series === 'object' && series !== null && (series as Record<string, unknown>)['index'] !== 0) return;
  // A private event is the group's business: rules hide it from the pueblo, so
  // announcing its title to the pueblo would defeat them.
  if (typeof d['visibilityOrgId'] === 'string') return;
  const municipalityId = str(d, 'municipalityId');
  if (!municipalityId) return;
  await broadcastToVillage({
    kind: 'event',
    entityId: event.params.eventId,
    municipalityId,
    entityLabel: str(d, 'title'),
    actorUid: str(d, 'createdBy'),
    extraRecipientUids: await followersOfOrgs(d['organizerOrgIds']),
    handler: 'onEventPublished',
  });
});

export const onNewsPublished = onDocumentCreated('news/{newsId}', async (event) => {
  const d = event.data?.data();
  if (!d || !isVisible(d)) return;
  const municipalityId = str(d, 'municipalityId');
  if (!municipalityId) return;
  await broadcastToVillage({
    kind: 'news',
    entityId: event.params.newsId,
    municipalityId,
    entityLabel: str(d, 'title'),
    actorUid: str(d, 'createdBy'),
    handler: 'onNewsPublished',
  });
});

// The timeline is a village-scoped entity like any other: published instantly
// by any member, moderated after the fact.
export const onHistoryEntryPublished = onDocumentCreated(
  'historyEntries/{entryId}',
  async (event) => {
    const d = event.data?.data();
    if (!d || !isVisible(d)) return;
    const municipalityId = str(d, 'municipalityId');
    if (!municipalityId) return;
    await broadcastToVillage({
      kind: 'historyEntry',
      entityId: event.params.entryId,
      municipalityId,
      entityLabel: str(d, 'title'),
      actorUid: str(d, 'createdBy'),
      handler: 'onHistoryEntryPublished',
    });
  },
);

export const onFestivalPosterPublished = onDocumentCreated(
  'festivalPosters/{posterId}',
  async (event) => {
    const d = event.data?.data();
    if (!d || !isVisible(d)) return;
    const municipalityId = str(d, 'municipalityId');
    if (!municipalityId) return;
    await broadcastToVillage({
      kind: 'festivalPoster',
      entityId: event.params.posterId,
      municipalityId,
      // A poster's title is optional by design — the copy builder has a
      // fallback rather than rendering an empty «».
      entityLabel: str(d, 'title'),
      actorUid: str(d, 'proposedBy'),
      handler: 'onFestivalPosterPublished',
    });
  },
);

export const onPlacePublished = onDocumentCreated(
  'municipalities/{municipalityId}/places/{placeId}',
  async (event) => {
    const d = event.data?.data();
    if (!d || !isVisible(d)) return;
    await broadcastToVillage({
      kind: 'place',
      entityId: event.params.placeId,
      municipalityId: event.params.municipalityId,
      entityLabel: str(d, 'name'),
      actorUid: str(d, 'proposedBy'),
      handler: 'onPlacePublished',
    });
  },
);

export const onBarrioPublished = onDocumentCreated(
  'municipalities/{municipalityId}/barrios/{barrioId}',
  async (event) => {
    const d = event.data?.data();
    if (!d || !isVisible(d)) return;
    // Barrios arrive in bulk from the INE dataset when a village is seeded;
    // announcing those would push a dozen notifications at once for something
    // nobody did. Only a barrio a person proposed is news.
    if (d['source'] !== 'user') return;
    await broadcastToVillage({
      kind: 'barrio',
      entityId: event.params.barrioId,
      municipalityId: event.params.municipalityId,
      entityLabel: str(d, 'name'),
      actorUid: str(d, 'proposedBy'),
      handler: 'onBarrioPublished',
    });
  },
);
