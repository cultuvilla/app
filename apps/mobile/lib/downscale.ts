import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Long-edge cap applied to every picked image before it is uploaded.
 *
 * Nothing in the app renders an image wider than the device screen — a feed
 * card is a ~400dp box, an entity hero is full-bleed at phone width — so a
 * 4000px phone photo is 20–50x more pixels than any surface consumes. Capping
 * at 1600 keeps a comfortable margin above a 3x-DPR full-width render while
 * cutting a typical upload from megabytes to low hundreds of kilobytes, which
 * also makes *posting* faster on the rural connections this app targets.
 *
 * The server-side `generateImageVariants` trigger derives the much smaller
 * card/thumb renditions from whatever lands here; this cap is about not
 * shipping a needlessly huge original in the first place.
 */
export const UPLOAD_MAX_EDGE = 1600;

/** Encoder quality for the re-encode. 0.8 is visually transparent for photos. */
const UPLOAD_QUALITY = 0.8;

export interface DownscaleInput {
  uri: string;
  width: number;
  height: number;
  /** The picker's reported type, used only for the fall-back path. */
  contentType?: string;
}

export interface DownscaleResult {
  uri: string;
  width: number;
  height: number;
  contentType: string;
  /** Extension matching `contentType`, for the uploaded object's filename. */
  extension: string;
}

/**
 * The manipulator action list that caps the long edge, or `[]` when the image
 * is already small enough. Constraining a single axis lets the manipulator
 * preserve the aspect ratio itself.
 */
export function resizeActionFor(width: number, height: number): ImageManipulator.Action[] {
  const longEdge = Math.max(width, height);
  // A picker that could not measure the asset reports 0; resizing to 0 would
  // produce an unusable image, so leave those alone.
  if (longEdge <= UPLOAD_MAX_EDGE) return [];
  return width >= height
    ? [{ resize: { width: UPLOAD_MAX_EDGE } }]
    : [{ resize: { height: UPLOAD_MAX_EDGE } }];
}

function extensionFor(contentType: string): string {
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/heic') return 'heic';
  return 'jpg';
}

/**
 * Resize + re-encode a picked asset for upload.
 *
 * WebP: both platforms encode it in SDK 56 (Android via
 * `Bitmap.CompressFormat.WEBP`, iOS via SDWebImageWebPCoder) and it is roughly
 * 25–35% smaller than JPEG at equal quality.
 *
 * A manipulator failure is never fatal: an exotic input (some HEIC variants,
 * a corrupt EXIF block) falls back to uploading the asset untouched. A large
 * upload beats a failed one.
 */
export async function downscaleForUpload(input: DownscaleInput): Promise<DownscaleResult> {
  const format = ImageManipulator.SaveFormat.WEBP;
  const contentType = 'image/webp';

  try {
    const out = await ImageManipulator.manipulateAsync(
      input.uri,
      resizeActionFor(input.width, input.height),
      { compress: UPLOAD_QUALITY, format },
    );
    return {
      uri: out.uri,
      width: out.width,
      height: out.height,
      contentType,
      extension: extensionFor(contentType),
    };
  } catch {
    const fallbackType = input.contentType ?? 'image/jpeg';
    return {
      uri: input.uri,
      width: input.width,
      height: input.height,
      contentType: fallbackType,
      extension: extensionFor(fallbackType),
    };
  }
}
