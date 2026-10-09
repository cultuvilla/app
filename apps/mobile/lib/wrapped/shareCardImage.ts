import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { requestPermissionsAsync, saveToLibraryAsync } from 'expo-media-library/legacy';

/** Whether this platform can hand a card to the share sheet as an image. */
export const canShareCardImage = true;

/**
 * The card as a local file in the cache: both the share sheet and the photo
 * library take a file, not a URL — an app given a URL would post a link, not
 * the picture.
 */
async function downloadCard(url: string, baseName: string): Promise<{ uri: string; jpeg: boolean }> {
  const jpeg = /\.jpe?g(\?|$)/i.test(new URL(url).pathname);
  const file = new File(Paths.cache, `${baseName}.${jpeg ? 'jpg' : 'png'}`);
  // Handling the same card twice must overwrite the first copy, not fail on it.
  if (file.exists) file.delete();
  const saved = await File.downloadFileAsync(url, file);
  return { uri: saved.uri, jpeg };
}

/**
 * Hand one rendered Wrapped card to the system share sheet as an image file —
 * which is where WhatsApp status and Instagram stories live.
 */
export async function shareCardImage(url: string, baseName: string): Promise<void> {
  if (!(await isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const { uri, jpeg } = await downloadCard(url, baseName);
  await shareAsync(uri, {
    mimeType: jpeg ? 'image/jpeg' : 'image/png',
    UTI: jpeg ? 'public.jpeg' : 'public.png',
    dialogTitle: baseName,
  });
}

/**
 * Save one rendered Wrapped card straight to the photo library. Asks only for
 * add-only access: the app never reads the library. Resolves `'denied'` when
 * the user refuses; throws when the device cannot save (Android 10–12 without
 * the storage permission we deliberately do not declare), so the caller can
 * fall back to the share sheet, whose "Save image" still works there.
 */
export async function saveCardImage(url: string, baseName: string): Promise<'saved' | 'denied'> {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) return 'denied';
  const { uri } = await downloadCard(url, baseName);
  await saveToLibraryAsync(uri);
  return 'saved';
}
