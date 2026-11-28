import { COLLECTIONS, collectionId, type CollectionKey } from '../firebase/refs/collections';
import type { DataSnapshot, SnapshotDoc } from './types';

/** Where a loaded document belongs: its collection entry, parent ids and own id. */
export interface Placement {
  readonly key: CollectionKey;
  readonly parents: string[];
  readonly id: string;
}

/**
 * Match a document path against the given collection templates. Collection ids
 * collide — `municipalities/{}/members` and `organizations/{}/members` are both
 * `members` — so the full template, not the last segment, decides.
 */
export function placeDocument(path: string, keys: readonly CollectionKey[]): Placement | null {
  const segments = path.split('/');
  for (const key of keys) {
    const template = COLLECTIONS[key].path.split('/');
    if (template.length + 1 !== segments.length) continue;
    const parents: string[] = [];
    const fits = template.every((part, i) => {
      if (part.startsWith('{')) {
        parents.push(segments[i]);
        return true;
      }
      return part === segments[i];
    });
    if (fits) return { key, parents, id: segments[segments.length - 1] };
  }
  return null;
}

/** One read per collection id: a plain collection for a top-level one, a collection group otherwise. */
export interface LoadQuery {
  readonly collectionId: string;
  readonly group: boolean;
  readonly keys: CollectionKey[];
}

export function loadQueries(keys: readonly CollectionKey[]): LoadQuery[] {
  const byId = new Map<string, LoadQuery>();
  for (const key of keys) {
    const path = COLLECTIONS[key].path;
    const id = collectionId(path);
    const topLevel = !path.includes('/');
    const existing = byId.get(id);
    if (existing) {
      existing.keys.push(key);
      if (!topLevel) byId.set(id, { ...existing, group: true });
    } else {
      byId.set(id, { collectionId: id, group: !topLevel, keys: [key] });
    }
  }
  return [...byId.values()];
}

/** Build a snapshot from raw `(path, data)` pairs; paths outside `keys` are dropped. */
export function buildSnapshot(
  docs: Iterable<{ path: string; data: Record<string, unknown> }>,
  keys: readonly CollectionKey[],
): DataSnapshot {
  const maps = new Map<CollectionKey, Map<string, SnapshotDoc>>(keys.map((key) => [key, new Map()]));
  for (const { path, data } of docs) {
    const placement = placeDocument(path, keys);
    if (!placement) continue;
    maps.get(placement.key)?.set(path, { id: placement.id, path, parents: placement.parents, data });
  }
  const snap: DataSnapshot = {};
  for (const [key, map] of maps) snap[key] = map;
  return snap;
}
