import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

/** Whether this platform can hand a card to the share sheet as an image. */
export const canShareCardImage = true;

/**
 * Hand one rendered Wrapped card to the system share sheet as an image file —
 * which is where WhatsApp status, Instagram stories and "Guardar imagen" all
 * live, without a native module of our own (an OTA update cannot carry one).
 *
 * The card is downloaded to the cache first: the share sheet takes a local
 * file, not a URL, and an app given a URL would post a link, not the picture.
 */
export async function shareCardImage(url: string, baseName: string): Promise<void> {
  if (!(await isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const jpeg = /\.jpe?g(\?|$)/i.test(new URL(url).pathname);
  const file = new File(Paths.cache, `${baseName}.${jpeg ? 'jpg' : 'png'}`);
  // Sharing the same card twice must overwrite the first copy, not fail on it.
  if (file.exists) file.delete();
  const saved = await File.downloadFileAsync(url, file);
  await shareAsync(saved.uri, {
    mimeType: jpeg ? 'image/jpeg' : 'image/png',
    UTI: jpeg ? 'public.jpeg' : 'public.png',
    dialogTitle: baseName,
  });
}
