import { onDocumentWritten, type Change, type DocumentSnapshot, type FirestoreEvent } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { IMAGE_VARIANT_SUFFIX, variantStoragePath, type ImageVariant } from '@cultuvilla/shared/utils';
import { storageObjectPathFromDownloadUrl } from '../helpers/storageDownloadUrl';

type DocData = Record<string, unknown>;
type Params = Record<string, string>;

/**
 * An image-bearing entity collection: where its doc lives, the Storage prefix
 * its uploads are written under, and how to read the image references off a doc.
 */
export interface EntityImageSource {
  handler: string;
  document: string;
  /**
   * Matches every object this entity owns — the paths imageService's upload
   * helpers write under. `[^/]+` stands in for a `{municipalityId}` segment the
   * doc path does not carry.
   */
  ownedPath: (params: Params) => RegExp;
  /** Raw references on the doc: a storage path or a Firebase download URL. */
  references: (data: DocData) => unknown[];
}

function isRecord(value: unknown): value is DocData {
  return typeof value === 'object' && value !== null;
}

function arrayField(data: DocData, field: string): unknown[] {
  const value = data[field];
  return Array.isArray(value) ? value : [];
}

function urlArray(data: DocData): unknown[] {
  return arrayField(data, 'images');
}

export const ENTITY_IMAGE_SOURCES = {
  news: {
    handler: 'cleanupRemovedNewsImages',
    document: 'news/{entityId}',
    ownedPath: ({ entityId }) => new RegExp(`^news/${entityId}/images/[^/]+$`),
    references: (data) => [
      ...arrayField(data, 'images').map((img) => (isRecord(img) ? img['storagePath'] : null)),
      isRecord(data['coverImage']) ? data['coverImage']['storagePath'] : null,
      ...arrayField(data, 'content').map((block) =>
        isRecord(block) && block['type'] === 'image' ? block['storagePath'] : null,
      ),
    ],
  },
  events: {
    handler: 'cleanupRemovedEventImages',
    document: 'events/{entityId}',
    ownedPath: ({ entityId }) => new RegExp(`^municipalities/[^/]+/events/${entityId}/image/[^/]+$`),
    // Every occurrence of a series points at the cover uploaded under its
    // first occurrence, and next year's edition of a yearly event at last
    // year's, so dropping or replacing it must not delete an image another
    // event still shows. Those covers are left in Storage instead — a few
    // orphaned files beat broken flyers.
    references: (data) =>
      isRecord(data['series']) || data['repeatsYearly'] === true ? [] : [data['imageURL']],
  },
  organizations: {
    handler: 'cleanupRemovedOrganizationImages',
    document: 'organizations/{entityId}',
    ownedPath: ({ entityId }) => new RegExp(`^organizations/${entityId}/image/[^/]+$`),
    references: urlArray,
  },
  places: {
    handler: 'cleanupRemovedPlaceImages',
    document: 'municipalities/{municipalityId}/places/{entityId}',
    ownedPath: ({ municipalityId, entityId }) =>
      new RegExp(`^municipalities/${municipalityId}/places/${entityId}/image/[^/]+$`),
    references: urlArray,
  },
  barrios: {
    handler: 'cleanupRemovedBarrioImages',
    document: 'municipalities/{municipalityId}/barrios/{entityId}',
    ownedPath: ({ municipalityId, entityId }) =>
      new RegExp(`^municipalities/${municipalityId}/barrios/${entityId}/image/[^/]+$`),
    references: urlArray,
  },
  festivalPosters: {
    handler: 'cleanupRemovedFestivalPosterImages',
    document: 'festivalPosters/{entityId}',
    ownedPath: ({ entityId }) => new RegExp(`^festivalPosters/[^/]+/${entityId}/[^/]+$`),
    references: urlArray,
  },
  historyEntries: {
    handler: 'cleanupRemovedHistoryEntryImages',
    document: 'historyEntries/{entityId}',
    ownedPath: ({ entityId }) => new RegExp(`^historyEntries/[^/]+/${entityId}/[^/]+$`),
    references: (data) => arrayField(data, 'images').map((img) => (isRecord(img) ? img['url'] : null)),
  },
} satisfies Record<string, EntityImageSource>;

/** The owned storage paths `data` references, normalised from paths or download URLs. */
export function ownedImagePaths(
  source: EntityImageSource,
  data: DocData | undefined,
  params: Params,
): Set<string> {
  const owned = new Set<string>();
  if (!data) return owned;
  const owns = source.ownedPath(params);
  for (const ref of source.references(data)) {
    if (typeof ref !== 'string' || ref.length === 0) continue;
    const path = ref.startsWith('http') ? storageObjectPathFromDownloadUrl(ref) : ref;
    // The ownership guard is what makes deleting safe: an image this doc merely
    // points at (a copied URL, a seed placeholder, another entity's upload) is
    // never ours to remove.
    if (path && owns.test(path)) owned.add(path);
  }
  return owned;
}

/** Paths referenced before the write and no longer referenced after it. */
export function removedImagePaths(
  source: EntityImageSource,
  before: DocData | undefined,
  after: DocData | undefined,
  params: Params,
): string[] {
  const kept = ownedImagePaths(source, after, params);
  return [...ownedImagePaths(source, before, params)].filter((path) => !kept.has(path));
}

/** An original plus the variants `generateImageVariants` wrote beside it. */
export function objectsForImage(path: string): string[] {
  return [
    path,
    ...(Object.keys(IMAGE_VARIANT_SUFFIX) as ImageVariant[]).map((v) => variantStoragePath(path, v)),
  ];
}

export async function handleEntityImagesWritten(
  source: EntityImageSource,
  event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Params>,
): Promise<void> {
  const change = event.data;
  if (!change) return;
  const removed = removedImagePaths(source, change.before.data(), change.after.data(), event.params);
  if (removed.length === 0) return;

  const bucket = getStorage().bucket();
  const objects = removed.flatMap(objectsForImage);
  const results = await Promise.allSettled(
    // A variant that was never generated (pre-trigger upload, undecodable
    // original) is simply absent — that is not a failure.
    objects.map((path) => bucket.file(path).delete({ ignoreNotFound: true })),
  );
  const failed = objects.filter((_, i) => results[i]?.status === 'rejected');

  if (failed.length > 0) {
    // Not rethrown: the doc write already happened and a retry would re-run the
    // successful deletes. An orphan is a storage cost, never a broken screen.
    logger.warn('Some removed entity images could not be deleted', {
      handler: source.handler,
      params: event.params,
      failed,
    });
  }
  logger.info('Deleted removed entity images', {
    handler: source.handler,
    params: event.params,
    removedImages: removed.length,
    deletedObjects: objects.length - failed.length,
  });
}

function cleanupTrigger(source: EntityImageSource) {
  return onDocumentWritten({ document: source.document, region: 'us-central1' }, (event) =>
    handleEntityImagesWritten(source, event),
  );
}

/**
 * Delete a Storage image once no doc references it: when its entity is deleted,
 * or when an edit removes or replaces it. Server-side so it runs regardless of
 * client version and outside `storage.rules`, which reject most client deletes.
 */
export const cleanupRemovedNewsImages = cleanupTrigger(ENTITY_IMAGE_SOURCES.news);
export const cleanupRemovedEventImages = cleanupTrigger(ENTITY_IMAGE_SOURCES.events);
export const cleanupRemovedOrganizationImages = cleanupTrigger(ENTITY_IMAGE_SOURCES.organizations);
export const cleanupRemovedPlaceImages = cleanupTrigger(ENTITY_IMAGE_SOURCES.places);
export const cleanupRemovedBarrioImages = cleanupTrigger(ENTITY_IMAGE_SOURCES.barrios);
export const cleanupRemovedFestivalPosterImages = cleanupTrigger(ENTITY_IMAGE_SOURCES.festivalPosters);
export const cleanupRemovedHistoryEntryImages = cleanupTrigger(ENTITY_IMAGE_SOURCES.historyEntries);
