// Cross-document referential integrity: do the references *between* documents
// hold? A converter checks one document's shape; these checks need several
// collections in memory at once, so they run over a snapshot the audit script
// loads (scripts/audit-referential-integrity.mjs) and stay pure, Firebase-free.
import { COLLECTIONS, collectionSegments, type CollectionKey } from '../firebase/refs/collections';

/** One loaded document. `parents` are the `{…}` ids of its path template, in order. */
export interface SnapshotDoc {
  readonly id: string;
  readonly path: string;
  readonly parents: readonly string[];
  readonly data: Readonly<Record<string, unknown>>;
}

/** One collection, keyed by full document path. */
export type CollectionSnapshot = ReadonlyMap<string, SnapshotDoc>;

/**
 * Collections keyed by their `COLLECTIONS` entry. The key space is closed on
 * purpose: a typo'd key would read as an empty collection and the check would
 * pass while checking nothing. Partial because the loader fetches only what the
 * selected invariants declare in `reads`.
 */
export type DataSnapshot = Partial<Record<CollectionKey, CollectionSnapshot>>;

/** One broken reference, reported by path and ids only — never names or contact data. */
export interface Violation {
  readonly invariant: string;
  /** Path of the document that holds the bad reference or count. */
  readonly path: string;
  readonly message: string;
  readonly field?: string;
  /** The dangling id, or the stored value of a drifted count. */
  readonly value?: string;
  /** The value the source says it should be (counts and projections). */
  readonly expected?: string;
}

export interface Invariant {
  /** Stable id, `<entity>.<field>.<rule>` — the report groups by it. */
  readonly id: string;
  readonly description: string;
  /** Every collection `check` reads, so the loader fetches only those. */
  readonly reads: readonly CollectionKey[];
  readonly check: (snap: DataSnapshot) => Violation[];
}

const EMPTY: CollectionSnapshot = new Map();

export function docsOf(snap: DataSnapshot, key: CollectionKey): CollectionSnapshot {
  return snap[key] ?? EMPTY;
}

/** Full path of document `id` in collection `key` under `parents`. */
export function docPath(key: CollectionKey, parents: readonly string[], id: string): string {
  return [...collectionSegments(COLLECTIONS[key].path, parents), id].join('/');
}

/** A non-empty string, or `null` for anything else. */
export function idValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
