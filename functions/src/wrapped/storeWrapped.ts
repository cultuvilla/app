import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  WRAPPED_CARDS,
  wrappedId,
  type WrappedBlock,
  type WrappedCard,
  type WrappedData,
} from '@cultuvilla/shared/models';
import { meetsAutoPublishFloor } from '@cultuvilla/shared/wrapped';
import { villageWrappedDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { gatherWrappedInputs } from './gatherInputs';
import { cardLink, composeWrapped, CARD_FORMATS } from './composeWrapped';

/** Days a draft waits for a village admin before it publishes itself. */
export const AUTO_PUBLISH_GRACE_DAYS = 3;

const EXT: Record<string, string> = { png: 'png', jpeg: 'jpg' };

/**
 * Where a card lives in the default bucket. Deterministic, so recomputing a
 * Wrapped overwrites its own images instead of littering the bucket.
 */
export function cardStoragePath(id: string, card: WrappedCard): string {
  return `villageWrapped/${id}/${card}.${EXT[CARD_FORMATS[card]]}`;
}

/**
 * Upload one card and return the URL anyone can open.
 *
 * A download token, not public ACLs or a signed URL: a Wrapped is meant to be
 * forwarded, and a shared image has to keep working after the sender closes
 * the app — a signed URL expires, which would break a WhatsApp message days
 * later. The token is unguessable and revocable by deleting the object, and it
 * is the same mechanism every other user-visible image in the product uses.
 */
async function uploadCard(id: string, card: WrappedCard, bytes: Buffer, format: string): Promise<string> {
  const path = cardStoragePath(id, card);
  const token = randomUUID();
  const file = getStorage().bucket().file(path);
  await file.save(bytes, {
    contentType: `image/${format}`,
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const bucket = file.bucket.name;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

export interface BuiltWrapped {
  id: string;
  data: WrappedData;
}

/**
 * Compute, render, store and persist a village's Wrapped for one year.
 *
 * Called only by an admin, with dates already validated by
 * `resolveWrappedRequest`. Idempotent by construction: the doc id and every
 * image path derive from `{municipalityId, year}`, so regenerating overwrites
 * in place.
 *
 * A published Wrapped stays published — regenerating replaces its cards, it
 * does not take it back down. A discarded one returns to draft: asking for it
 * again is the admin changing their mind.
 */
export async function buildAndStoreWrapped(
  db: Firestore,
  municipalityId: string,
  wrapped: { year: number; blocks: WrappedBlock[]; range: { start: Date; end: Date } },
  now: Date = new Date(),
): Promise<BuiltWrapped> {
  const { year, blocks, range } = wrapped;
  const id = wrappedId(municipalityId, year);
  const ref = villageWrappedDoc(db, id);
  const previous = (await ref.get()).data();

  const gathered = await gatherWrappedInputs(db, municipalityId, range);
  const link = cardLink(process.env['GCLOUD_PROJECT'], gathered.villageSlug, year);
  const { aggregate, images } = await composeWrapped(gathered, { blocks, year, link });

  const uploaded: [WrappedCard, string][] = [];
  for (const card of WRAPPED_CARDS) {
    const img = images[card];
    if (img) uploaded.push([card, await uploadCard(id, card, img.bytes, img.format)]);
  }
  const urls: Partial<Record<WrappedCard, string>> = Object.fromEntries(uploaded);

  // A thin Wrapped is computed and offered, never released on a timer: an
  // auto-published Wrapped showing one event makes the pueblo look dead on its
  // own noticeboard. Only an admin can decide that is worth showing.
  const floor = meetsAutoPublishFloor(aggregate.stats);
  const status = previous?.status === 'published' ? 'published' : 'draft';
  const autoPublishAt =
    status === 'draft' && floor
      ? new Date(now.getTime() + AUTO_PUBLISH_GRACE_DAYS * 24 * 60 * 60 * 1000)
      : null;

  const data: WrappedData = {
    municipalityId,
    villageName: gathered.villageName,
    year,
    blocks,
    rangeStart: range.start,
    rangeEnd: range.end,
    status,
    autoPublishAt,
    computedAt: now,
    stats: aggregate.stats,
    fullestEvent: aggregate.fullestEvent,
    mostCommentedEvent: aggregate.mostCommentedEvent,
    topOrganizations: aggregate.topOrganizations,
    topOrganizers: aggregate.topOrganizers,
    images: urls,
  };
  await ref.set(data);

  logger.info('village wrapped built', {
    handler: 'buildAndStoreWrapped',
    municipalityId,
    wrappedId: id,
    year,
    blocks: blocks.length,
    status,
    eventCount: aggregate.stats.eventCount,
    autoPublishes: autoPublishAt !== null,
  });

  return { id, data };
}
