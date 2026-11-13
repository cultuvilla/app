import AsyncStorage from '@react-native-async-storage/async-storage';

// The group last open in the Grupos tab, so the tab reopens on it.
const LAST_GROUP_KEY = 'cultuvilla.lastGroupId';

export async function readLastGroupId(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_GROUP_KEY).catch(() => null);
}

export async function rememberLastGroupId(orgId: string): Promise<void> {
  await AsyncStorage.setItem(LAST_GROUP_KEY, orgId).catch(() => undefined);
}

/** The remembered group if the user still belongs to it, else the first one. */
export function pickGroupId(groupIds: string[], remembered: string | null): string | null {
  if (remembered && groupIds.includes(remembered)) return remembered;
  return groupIds[0] ?? null;
}
