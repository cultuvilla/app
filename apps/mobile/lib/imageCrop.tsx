import * as ImagePicker from 'expo-image-picker';
import type { UploadableImage } from '@cultuvilla/shared/services/imageService';
import { uriToBlob } from './uriToBlob';
import { downscaleForUpload } from './downscale';

async function toUploadable(asset: ImagePicker.ImagePickerAsset): Promise<UploadableImage> {
  const scaled = await downscaleForUpload({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    contentType: asset.mimeType ?? undefined,
  });
  const blob = await uriToBlob(scaled.uri);
  return {
    blob,
    filename: `upload-${Date.now()}.${scaled.extension}`,
    contentType: scaled.contentType,
    previewUri: scaled.uri,
  };
}

/**
 * Square pick + crop with expo-image-picker's built-in OS crop editor
 * (`allowsEditing` + a locked 1:1 aspect) — the same approach as the sibling
 * ordago-apps repo. The native editor lets the user pinch/pan to a square before
 * returning. Returns null when the user cancels the picker or the crop step.
 */
export async function pickAndCropSquare(): Promise<UploadableImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets[0]) return null;
  return toUploadable(result.assets[0]);
}

/**
 * The pick that {@link pickAndCropSquare} never got to return because Android
 * closed the app behind the picker. Reading it consumes it, and it says nothing
 * about which screen opened the picker, so call this only from a screen that is
 * the sole way to reach its picker. Always null on iOS.
 */
export async function recoverPickedSquare(): Promise<UploadableImage | null> {
  const result = await ImagePicker.getPendingResultAsync();
  if (!result || 'code' in result || result.canceled || !result.assets[0]) return null;
  return toUploadable(result.assets[0]);
}
