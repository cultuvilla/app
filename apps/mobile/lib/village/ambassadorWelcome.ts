import AsyncStorage from '@react-native-async-storage/async-storage';

// Whether this device already showed a user the "¡Ya eres Embajador!" sheet for
// a pueblo. Per device on purpose: the moment is a welcome, not a record — a
// second device seeing it once more costs nothing, and no backend field is
// worth a schema change for it.
const key = (municipalityId: string, uid: string) =>
  `cultuvilla.ambassadorWelcomed.${municipalityId}.${uid}`;

export async function hasSeenAmbassadorWelcome(municipalityId: string, uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(municipalityId, uid))) === '1';
  } catch {
    // Unreadable storage: treat as seen rather than nag on every visit.
    return true;
  }
}

export async function markAmbassadorWelcomeSeen(municipalityId: string, uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(municipalityId, uid), '1');
  } catch {
    // Best effort — see hasSeenAmbassadorWelcome.
  }
}
