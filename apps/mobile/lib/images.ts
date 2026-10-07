import * as ImagePicker from 'expo-image-picker';
import type { UploadableImage } from '@cultuvilla/shared/services/imageService';
import { uriToBlob } from './uriToBlob';
import { pickAndCropSquare } from './imageCrop';
import { downscaleForUpload } from './downscale';

/** Filename for a downscaled pick, keyed to the encoder's actual output. */
function uploadFilename(extension: string): string {
  return `upload-${Date.now()}.${extension}`;
}

export interface PickImageOptions {
  /**
   * Crop the pick to a 1:1 square before upload (avatars, escudos). See
   * lib/imageCrop.* — native uses expo-image-picker's OS crop editor, web uses a
   * react-easy-crop overlay (since `allowsEditing` is a no-op on web).
   */
  square?: boolean;
}

/**
 * Opens the device image library and returns the selected image as an
 * UploadableImage (blob + filename + contentType) compatible with
 * imageService's upload functions.
 *
 * With `{ square: true }` the pick is handed to the in-app square cropper
 * ({@link pickAndCropSquare}); otherwise the full asset is returned as-is.
 *
 * Returns null if the user cancels or no asset is available.
 */
export async function pickImageAsBlob(
  options: PickImageOptions = {},
): Promise<UploadableImage | null> {
  if (options.square) return pickAndCropSquare();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const scaled = await downscaleForUpload({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    contentType: asset.mimeType ?? undefined,
  });
  const blob = await uriToBlob(scaled.uri);
  return {
    blob,
    // The manipulator re-encodes, so the picker's original filename would carry
    // the wrong extension; name the object after what we actually uploaded.
    filename: uploadFilename(scaled.extension),
    contentType: scaled.contentType,
    previewUri: scaled.uri,
  };
}

/** An {@link UploadableImage} that also carries the picked asset's pixel size,
 *  needed by news image blocks so they render at the right aspect ratio. */
export interface SizedUploadableImage extends UploadableImage {
  width: number;
  height: number;
}

/**
 * Like {@link pickImageAsBlob} but also returns the asset's intrinsic
 * width/height. Used by the news block editor, where each inline image persists
 * its dimensions so the reader can lay it out without a network round-trip.
 */
export async function pickImageWithSize(): Promise<SizedUploadableImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const scaled = await downscaleForUpload({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    contentType: asset.mimeType ?? undefined,
  });
  const blob = await uriToBlob(scaled.uri);
  return {
    blob,
    filename: uploadFilename(scaled.extension),
    contentType: scaled.contentType,
    previewUri: scaled.uri,
    // The POST-resize dimensions: news blocks persist these to lay the image
    // out without a network round-trip, so they must describe the stored object.
    width: scaled.width,
    height: scaled.height,
  };
}
