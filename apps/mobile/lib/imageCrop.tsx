import * as ImagePicker from 'expo-image-picker';
import type { UploadableImage } from '@cultuvilla/shared/services/imageService';
import { uriToBlob } from './uriToBlob';
import { downscaleForUpload } from './downscale';

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
    filename: `upload-${Date.now()}.${scaled.extension}`,
    contentType: scaled.contentType,
    previewUri: scaled.uri,
  };
}
