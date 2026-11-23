import AsyncStorage from '@react-native-async-storage/async-storage';
import { TASK_FILTERS, type TaskFilter } from './taskBoard';

// The filters left on in a group's Tareas, per group, so the screen reopens as it was left.
const key = (orgId: string) => `cultuvilla.taskFilters.${orgId}`;

export async function readTaskFilters(orgId: string): Promise<TaskFilter[]> {
  const raw = await AsyncStorage.getItem(key(orgId)).catch(() => null);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? TASK_FILTERS.filter((f) => parsed.includes(f)) : [];
  } catch {
    return [];
  }
}

export async function rememberTaskFilters(orgId: string, filters: TaskFilter[]): Promise<void> {
  await AsyncStorage.setItem(key(orgId), JSON.stringify(filters)).catch(() => undefined);
}
