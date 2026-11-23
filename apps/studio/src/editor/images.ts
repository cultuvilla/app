import { validateUploadableImage } from '@cultuvilla/shared/services/imageService';

/** Long-edge cap before upload — the app's UPLOAD_MAX_EDGE (apps/mobile/lib/downscale.ts). */
const UPLOAD_MAX_EDGE = 1600;
const UPLOAD_QUALITY = 0.8;

export interface PickedImage {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
  /** An object URL for the preview; revoked by `forgetPendingImage`. */
  previewUrl: string;
}

/**
 * A picked file, downscaled like the app does before upload: a photo straight
 * off a camera is many times the pixels any reader renders, and the server
 * derives the smaller renditions from this one.
 */
export async function prepareImage(file: File): Promise<PickedImage> {
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  let blob: Blob = file;
  if (scale < 1 || file.size > 1024 * 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', UPLOAD_QUALITY),
    );
  }
  bitmap.close();
  const contentType = blob.type || file.type;
  validateUploadableImage({ blob, filename: file.name, contentType });
  return { blob, contentType, width, height, previewUrl: URL.createObjectURL(blob) };
}

// Images inserted into the editor but not uploaded yet, by the key their node
// carries. A post's images live under its id, so they upload on save.
const pending = new Map<string, PickedImage>();
let seq = 0;

export function holdPendingImage(image: PickedImage): string {
  seq += 1;
  const key = `pending-${seq}-${Date.now()}`;
  pending.set(key, image);
  return key;
}

export function pendingImage(key: string): PickedImage | undefined {
  return pending.get(key);
}

export function forgetPendingImage(key: string): void {
  const image = pending.get(key);
  if (image) URL.revokeObjectURL(image.previewUrl);
  pending.delete(key);
}

export function extensionFor(contentType: string): string {
  return contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
}
