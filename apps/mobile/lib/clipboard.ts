import { Share } from 'react-native';

/**
 * Hands a value to the user to paste elsewhere (an IBAN, a Bizum number).
 * The app ships no clipboard module — adding one is native code, which would
 * stop every later JS change from reaching installed apps by OTA — so this
 * opens the system share sheet, whose first actions include "Copiar".
 * Swapping in `expo-clipboard` with the next native build is this one file.
 */
export async function copyText(value: string): Promise<void> {
  try {
    await Share.share({ message: value });
  } catch {
    // Dismissed or unavailable: nothing to recover, the value stays on screen.
  }
}
