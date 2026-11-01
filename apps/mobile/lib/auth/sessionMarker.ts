import AsyncStorage from '@react-native-async-storage/async-storage';
import { observability } from '@cultuvilla/shared';

// Set while a session is open and cleared only by signing out on purpose, so
// finding it with no user means the session ended without the user asking. Firebase
// reports that to nobody: this is the only record of an involuntary logout.
const SESSION_MARKER_KEY = 'cultuvilla.sessionMarker';

export async function markSessionOpen(providerIds: string[]): Promise<void> {
  await AsyncStorage.setItem(SESSION_MARKER_KEY, providerIds.join('+'));
}

export async function clearSessionMarker(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_MARKER_KEY);
}

export async function reportIfSessionLost(): Promise<void> {
  const providers = await AsyncStorage.getItem(SESSION_MARKER_KEY);
  if (providers === null) return;
  await clearSessionMarker();
  const lost = new Error(`session lost, providers: ${providers || 'custom'}`);
  lost.name = 'SessionLost';
  observability.captureError(lost, { operation: 'auth:sessionLost' });
}
