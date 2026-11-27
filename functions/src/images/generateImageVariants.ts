import { type StorageEvent } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import {
  IMAGE_VARIANT_SUFFIX,
  isVariantExemptStoragePath,
  isVariantStoragePath,
  variantStoragePath,
  type ImageVariant,
} from '@cultuvilla/shared/utils';
import { defineObjectFinalized } from '../shared/define/defineStorageTrigger';

/**
 * Long-edge pixel budget per variant. `card` covers every surface that renders
 * an image inside a laid-out box (feed cards, section rows, detail heroes);
 * `thumb` covers avatars and list-row squares.
 */
export const VARIANT_MAX_EDGE: Record<ImageVariant, number> = {
  card: 1080,
  thumb: 240,
};

const WEBP_QUALITY: Record<ImageVariant, number> = {
  card: 72,
  thumb: 68,
};

/** Matches `imageService.IMAGE_UPLOAD_CACHE_CONTROL`. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Region of the default Storage bucket in every environment (villa-events,
 * cultuvilla-beta, cultuvilla-prod are all `US-EAST1`).
 *
 * A Storage trigger MUST be co-located with its bucket — functions default to
 * `us-central1`, and deploying this one there fails the whole `firebase deploy`
 * with "A function in region us-central1 cannot listen to a bucket in region
 * us-east1". Locked by the region test in
 * `functions/src/__tests__/handlers/generateImageVariants.test.ts`.
 */
export const STORAGE_BUCKET_REGION = 'us-east1';

export interface VariantDecision {
  generate: boolean;
  reason: 'ok' | 'not-an-image' | 'already-a-variant' | 'exempt-path';
}

/**
 * Whether a finalized object should get variants.
 *
 * The `already-a-variant` branch is load-bearing: this trigger writes into the
 * same bucket it listens on, so without it every generated variant would
 * re-fire the trigger and recurse.
 *
 * A missing download token is NOT a reason to skip. Both URL shapes occur in
 * practice — `getDownloadURL()` mints a token, while the seed uploader stores a
 * bare `?alt=media` URL that Storage serves through `storage.rules` — and the
 * client rewrite preserves the query string either way. What matters is that
 * the variant's access matches the original's, which `writeVariants` ensures by
 * copying the token when there is one and omitting it when there is not.
 */
export function variantDecision(
  objectName: string,
  contentType: string | undefined,
): VariantDecision {
  if (!contentType?.startsWith('image/')) return { generate: false, reason: 'not-an-image' };
  if (isVariantStoragePath(objectName)) return { generate: false, reason: 'already-a-variant' };
  if (isVariantExemptStoragePath(objectName)) return { generate: false, reason: 'exempt-path' };
  return { generate: true, reason: 'ok' };
}

/** The token Firebase serves a download URL against, when the object has one. */
export function downloadTokenOf(metadata: Record<string, unknown> | undefined): string | undefined {
  const raw = metadata?.['firebaseStorageDownloadTokens'];
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  // Storage stores a comma-separated list; a download URL is valid against any
  // of them, and the first is the one `getDownloadURL()` hands out.
  return raw.split(',')[0];
}

export interface GeneratedVariant {
  variant: ImageVariant;
  path: string;
  bytes: number;
}

/**
 * Resize `source` into every variant and write them beside the original.
 *
 * A token-carrying original gets token-carrying variants: a download token
 * bypasses `storage.rules` entirely, so a token-less variant of an
 * auth-gated image (a person photo) would 403 for the very client that can
 * read the original. A token-less original gets token-less variants, served
 * through the same public read rule its own URL relies on.
 */
export async function writeVariants(
  bucketName: string,
  objectName: string,
  source: Buffer,
  downloadToken: string | undefined,
): Promise<GeneratedVariant[]> {
  const bucket = getStorage().bucket(bucketName);
  const written: GeneratedVariant[] = [];

  for (const variant of Object.keys(IMAGE_VARIANT_SUFFIX) as ImageVariant[]) {
    const body = await sharp(source, { failOn: 'none' })
      // `withoutEnlargement` keeps an already-small original from being upscaled
      // into a *larger* file than the thing it is supposed to replace.
      .rotate()
      .resize({
        width: VARIANT_MAX_EDGE[variant],
        height: VARIANT_MAX_EDGE[variant],
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY[variant] })
      .toBuffer();

    const path = variantStoragePath(objectName, variant);
    await bucket.file(path).save(body, {
      contentType: 'image/webp',
      metadata: {
        cacheControl: CACHE_CONTROL,
        ...(downloadToken
          ? { metadata: { firebaseStorageDownloadTokens: downloadToken } }
          : {}),
      },
    });
    written.push({ variant, path, bytes: body.length });
  }

  return written;
}

export async function handleObjectFinalized(event: StorageEvent): Promise<void> {
  const objectName = event.data.name;
  const bucketName = event.data.bucket;
  if (!objectName || !bucketName) return;

  const token = downloadTokenOf(event.data.metadata);
  const decision = variantDecision(objectName, event.data.contentType);
  if (!decision.generate) {
    // `already-a-variant` is the overwhelmingly common path (two of every three
    // finalize events are our own writes) and is not worth a log line.
    if (decision.reason !== 'already-a-variant') {
      logger.info('Skipped image variant generation', {
        handler: 'generateImageVariants',
        objectName,
        reason: decision.reason,
      });
    }
    return;
  }

  const bucket = getStorage().bucket(bucketName);
  try {
    const [source] = await bucket.file(objectName).download();
    const written = await writeVariants(bucketName, objectName, source, token);
    logger.info('Generated image variants', {
      handler: 'generateImageVariants',
      objectName,
      sourceBytes: source.length,
      variants: written.map((w) => ({ variant: w.variant, bytes: w.bytes })),
    });
  } catch (err) {
    // A failed variant is not a failed upload: the client falls back to the
    // original URL, so the image still renders. Log loudly and move on rather
    // than letting the retry machinery hammer an undecodable object.
    logger.error('Image variant generation failed', {
      handler: 'generateImageVariants',
      objectName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Writes downscaled WebP renditions next to every uploaded image.
 *
 * Cards were fetching multi-megabyte originals to fill a ~400dp box, which is
 * the dominant cost of rendering the village and explora tabs. See
 * `packages/shared/src/utils/imageVariants.ts` for how the client addresses
 * what this writes.
 */
export const generateImageVariants = defineObjectFinalized(
  'generateImageVariants',
  {
    region: STORAGE_BUCKET_REGION,
    memory: '1GiB',
    timeoutSeconds: 120,
    retry: false,
  },
  handleObjectFinalized,
);
