import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { ExportFileData } from './exportFileTypes';

/**
 * Hand the user a generated file on iOS/Android. There is no "Downloads folder" to write to on either OS, so the file goes to
 * the app's cache directory and is then handed to the system share sheet, which
 * is where "Guardar en Archivos" / Drive / WhatsApp / mail all live. Cache (not
 * documents) because the copy is disposable the moment the sheet is done with
 * it: the OS may reclaim it, and the receiving app has taken its own copy.
 */
/**
 * iOS identifies file types by UTI, not MIME, and picks the wrong app (or none)
 * without one. Keyed by the MIME the callers already pass so a new export
 * format only has to add a line here.
 */
const UTI_BY_MIME: Record<string, string> = {
  'text/csv': 'public.comma-separated-values-text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'org.openxmlformats.spreadsheetml.sheet',
};

function utiFor(mimeType: string): string | undefined {
  // Callers append charset parameters (`text/csv;charset=utf-8`); the UTI table
  // is keyed by the bare type.
  return UTI_BY_MIME[mimeType.split(';')[0]!.trim()];
}

export async function downloadFile(
  data: ExportFileData,
  fileName: string,
  mimeType: string,
): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }

  const file = new File(Paths.cache, fileName);
  // Exporting the same roster twice must overwrite rather than throw on the
  // leftover from the first run.
  if (file.exists) file.delete();
  file.create();
  file.write(typeof data === 'string' ? data : new Uint8Array(data));

  await shareAsync(file.uri, {
    mimeType: mimeType.split(';')[0]!.trim(),
    UTI: utiFor(mimeType),
    dialogTitle: fileName,
  });
}
