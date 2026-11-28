import { COLLECTIONS, type CollectionKey } from '../firebase/refs/collections';
import {
  docPath,
  docsOf,
  idValue,
  type DataSnapshot,
  type Invariant,
  type SnapshotDoc,
  type Violation,
} from './types';

/** One reference a document holds. */
export interface Ref {
  readonly field: string;
  readonly value: unknown;
  readonly target: CollectionKey;
  /** Parent ids of the target, for a subcollection target (a barrio under its municipality). */
  readonly parents?: readonly string[];
  /** Skip an absent or empty value instead of flagging it. */
  readonly optional?: boolean;
}

export interface ReferenceOptions {
  readonly id: string;
  readonly description: string;
  readonly collection: CollectionKey;
  readonly refs: (doc: SnapshotDoc) => readonly Ref[];
  /** Every collection a `Ref` may target. */
  readonly targets: readonly CollectionKey[];
  /** Docs in a state where a dangling reference is expected by design. */
  readonly skipWhen?: (doc: SnapshotDoc) => boolean;
}

/** Every reference a document holds must name a document that exists. */
export function referenceInvariant(opts: ReferenceOptions): Invariant {
  return {
    id: opts.id,
    description: opts.description,
    reads: [opts.collection, ...opts.targets.filter((t) => t !== opts.collection)],
    check: (snap: DataSnapshot): Violation[] => {
      const out: Violation[] = [];
      for (const doc of docsOf(snap, opts.collection).values()) {
        if (opts.skipWhen?.(doc)) continue;
        for (const ref of opts.refs(doc)) {
          const value = idValue(ref.value);
          if (value === null) {
            if (ref.optional) continue;
            out.push({
              invariant: opts.id,
              path: doc.path,
              field: ref.field,
              value: String(ref.value),
              message: `${doc.path}.${ref.field} is not an id`,
            });
            continue;
          }
          let target: string;
          try {
            target = docPath(ref.target, ref.parents ?? [], value);
          } catch {
            target = `${COLLECTIONS[ref.target].path}/${value}`;
          }
          if (!docsOf(snap, ref.target).has(target)) {
            out.push({
              invariant: opts.id,
              path: doc.path,
              field: ref.field,
              value,
              message: `${doc.path}.${ref.field} -> missing ${target}`,
            });
          }
        }
      }
      return out;
    },
  };
}

/** The collection a subcollection's documents live under: `events/{eventId}/registrations` → `events`. */
export function parentCollectionOf(child: CollectionKey): CollectionKey {
  const segments = COLLECTIONS[child].path.split('/');
  if (segments.length < 3) throw new Error(`${child} is a top-level collection`);
  const parentPath = segments.slice(0, -2).join('/');
  const parent = (Object.keys(COLLECTIONS) as CollectionKey[]).find((key) => COLLECTIONS[key].path === parentPath);
  if (!parent) throw new Error(`No collection is declared at ${parentPath}`);
  return parent;
}

/**
 * A subcollection document must sit under a parent that exists. A deleted
 * parent leaves its subcollections behind (Firestore does not cascade), and no
 * reader reaches them by path again — they only cost storage and skew any
 * collection-group query or count over them.
 */
export function orphanInvariant(child: CollectionKey): Invariant {
  const parent = parentCollectionOf(child);
  const id = `${child}.parent.exists`;
  return {
    id,
    description: `Every ${COLLECTIONS[child].path} doc sits under an existing ${COLLECTIONS[parent].path} doc`,
    reads: [child, parent],
    check: (snap) => {
      const out: Violation[] = [];
      const parents = docsOf(snap, parent);
      for (const doc of docsOf(snap, child).values()) {
        const parentPath = doc.path.split('/').slice(0, -2).join('/');
        if (!parents.has(parentPath)) {
          out.push({ invariant: id, path: doc.path, value: parentPath, message: `${doc.path} -> missing parent ${parentPath}` });
        }
      }
      return out;
    },
  };
}

export interface CountOptions {
  readonly id: string;
  readonly description: string;
  /** Collection holding the stored counter. */
  readonly parent: CollectionKey;
  readonly field: string;
  /** Collection whose documents are counted. */
  readonly child: CollectionKey;
  /** The parent paths one child counts toward (none, one or several). */
  readonly countsToward: (doc: SnapshotDoc) => readonly string[];
  /** Parents whose counter is not expected to track the source. */
  readonly skipParent?: (doc: SnapshotDoc) => boolean;
}

/**
 * A function-owned counter must equal the number of source documents. A
 * single mismatch can be a write in flight; drift that survives a re-run is real.
 */
export function countInvariant(opts: CountOptions): Invariant {
  return {
    id: opts.id,
    description: opts.description,
    reads: opts.parent === opts.child ? [opts.parent] : [opts.parent, opts.child],
    check: (snap) => {
      const counts = new Map<string, number>();
      for (const doc of docsOf(snap, opts.child).values()) {
        for (const parentPath of new Set(opts.countsToward(doc))) {
          counts.set(parentPath, (counts.get(parentPath) ?? 0) + 1);
        }
      }
      const out: Violation[] = [];
      for (const doc of docsOf(snap, opts.parent).values()) {
        if (opts.skipParent?.(doc)) continue;
        const stored = doc.data[opts.field];
        // An absent or non-numeric counter is a schema finding — the conformance
        // gate's, and a pending backfill's — not drift from the source.
        if (typeof stored !== 'number') continue;
        const actual = counts.get(doc.path) ?? 0;
        if (stored !== actual) {
          out.push({
            invariant: opts.id,
            path: doc.path,
            field: opts.field,
            value: String(stored),
            expected: String(actual),
            message: `${doc.path}.${opts.field} = ${String(stored)}, source counts ${String(actual)}`,
          });
        }
      }
      return out;
    },
  };
}

/** Parent path of a subcollection document: `events/e1/registrations/r1` → `events/e1`. */
export function parentPathOf(doc: SnapshotDoc): string {
  return doc.path.split('/').slice(0, -2).join('/');
}
