import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

type CopiedListener = () => void;
const listeners = new Set<CopiedListener>();

/** Subscribes to successful copies; returns the unsubscribe. `CopiedToast` is the one listener. */
export function onCopied(listener: CopiedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Android 13+ draws its own clipboard confirmation on every copy, so a second
 * "Copiado" from the app would stack on top of it.
 */
export function systemConfirmsCopy(): boolean {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33;
}

/** Copies a value (an IBAN, a Bizum number, a message) and confirms it with a short "Copiado". */
export async function copyText(value: string): Promise<void> {
  try {
    await Clipboard.setStringAsync(value);
  } catch {
    // Clipboard unavailable: nothing to recover, the value stays on screen.
    return;
  }
  if (systemConfirmsCopy()) return;
  listeners.forEach((listener) => listener());
}
