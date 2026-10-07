import { ref, uploadBytes, getDownloadURL } from '../firebase/sdk/storage';
import { getFirebaseStorage } from '../firebase';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Cache header stamped on every uploaded object.
 *
 * Without explicit metadata Firebase Storage serves `private, max-age=0`, so
 * the app re-downloads every image on every render — the single largest cause
 * of slow feed rendering. `generateImageId` makes each filename unique and an
 * object is never overwritten in place, so `immutable` is accurate: the bytes
 * behind a given URL cannot change. `scripts/backfill-image-cache-control.mjs`
 * applies the same header to objects uploaded before this existed.
 */
export const IMAGE_UPLOAD_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface UploadableImage {
  blob: Blob;
  filename: string;
  contentType?: string;
  /** Local device URI of the picked asset, for rendering a preview before
   * upload. Ignored by the upload path (only blob/filename/contentType are
   * sent). `undefined` when the image didn't originate from a device picker. */
  previewUri?: string;
}

export function validateUploadableImage(image: UploadableImage): void {
  const declaredType = image.contentType ?? image.blob.type;
  if (!declaredType.startsWith('image/')) {
    throw new Error('El archivo no es una imagen');
  }
  if (image.blob.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('La imagen supera 5 MB');
  }
}

function generateImageId(filename: string): string {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}${ext}`;
}

async function uploadToPath(path: string, image: UploadableImage): Promise<string> {
  validateUploadableImage(image);
  const storageRef = ref(getFirebaseStorage(), path);
  const contentType = image.contentType ?? image.blob.type;
  await uploadBytes(storageRef, image.blob, {
    contentType,
    cacheControl: IMAGE_UPLOAD_CACHE_CONTROL,
  });
  return getDownloadURL(storageRef);
}

/**
 * Like `uploadToPath` but returns the storage path that was written rather
 * than its download URL. News posts persist `storagePath` (not a URL) so the
 * UI can resolve a fresh download URL on demand via `newsImageDownloadURL`.
 */
async function uploadReturningPath(path: string, image: UploadableImage): Promise<string> {
  validateUploadableImage(image);
  const storageRef = ref(getFirebaseStorage(), path);
  const contentType = image.contentType ?? image.blob.type;
  await uploadBytes(storageRef, image.blob, {
    contentType,
    cacheControl: IMAGE_UPLOAD_CACHE_CONTROL,
  });
  return path;
}

export async function uploadMunicipalityImage(
  municipalityId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadToPath(
    `municipalities/${municipalityId}/images/${generateImageId(image.filename)}`,
    image,
  );
}

/**
 * Upload a photo owned by `userId` (its own account avatar, or a persona it
 * created). Lives under the user-scoped storage prefix that the simplest
 * storage rule already authorises (`users/{uid}/photo/{imageId}`), so it
 * avoids cross-service `firestore.get()` checks during onboarding.
 */
export async function uploadUserPhoto(
  userId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadToPath(`users/${userId}/photo/${generateImageId(image.filename)}`, image);
}

/**
 * Upload a news post image. Returns the storage **path** (e.g.
 * `news/{postId}/images/{id}`) to persist in `NewsPostImage.storagePath`.
 * The post doc must already exist (storage rules check
 * `news/{postId}.authorUserId == uid`), so upload after `createNewsPost`.
 */
export async function uploadNewsImage(
  postId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadReturningPath(`news/${postId}/images/${generateImageId(image.filename)}`, image);
}

/**
 * Upload an event cover image. Returns the **download URL** to persist in
 * `EventData.imageURL`. Stored under the event's owning municipality:
 * `municipalities/{municipalityId}/events/...`.
 */
export async function uploadEventImage(
  municipalityId: string,
  eventId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadToPath(
    `municipalities/${municipalityId}/events/${eventId}/image/${generateImageId(image.filename)}`,
    image,
  );
}

/**
 * Upload one of an organization's pictures. Returns the **download URL** to
 * append to `OrganizationData.images` (call once per picked image).
 */
export async function uploadOrganizationImage(
  organizationId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadToPath(`organizations/${organizationId}/image/${generateImageId(image.filename)}`, image);
}

/**
 * Upload one of a place's pictures. Returns the **download URL** to append
 * to `PlaceData.images` (call once per picked image).
 */
export async function uploadPlaceImage(
  municipalityId: string,
  placeId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadToPath(
    `municipalities/${municipalityId}/places/${placeId}/image/${generateImageId(image.filename)}`,
    image,
  );
}

/**
 * Upload one of a barrio's pictures. Returns the **download URL** to append
 * to `BarrioData.images` (call once per picked image).
 */
export async function uploadBarrioImage(
  municipalityId: string,
  barrioId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadToPath(
    `municipalities/${municipalityId}/barrios/${barrioId}/image/${generateImageId(image.filename)}`,
    image,
  );
}

/**
 * Upload one festival poster image. Returns the **download URL** to append to
 * `FestivalPosterData.images[]`. Each image gets a unique id so multiple images
 * under the same poster coexist instead of overwriting.
 */
export async function uploadFestivalPosterImage(
  municipalityId: string,
  posterId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadToPath(
    `festivalPosters/${municipalityId}/${posterId}/${generateImageId(image.filename)}`,
    image,
  );
}

/**
 * Upload one history-entry gallery image. Returns the **download URL** stored in
 * `HistoryEntryData.images[].url`.
 */
export async function uploadHistoryEntryImage(
  municipalityId: string,
  entryId: string,
  image: UploadableImage,
): Promise<string> {
  return uploadToPath(
    `historyEntries/${municipalityId}/${entryId}/${generateImageId(image.filename)}`,
    image,
  );
}

/** Resolve a download URL for a stored news image path. */
export async function newsImageDownloadURL(storagePath: string): Promise<string> {
  return getDownloadURL(ref(getFirebaseStorage(), storagePath));
}
