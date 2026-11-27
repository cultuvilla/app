// Typed stand-ins for the Firebase SDK values that service tests feed to a
// `vi.mock`ed SDK function (`vi.mocked(getDocs).mockResolvedValue(...)`). A
// test supplies only what the service reads; the bridging cast to the SDK's
// full class type lives here, once, instead of a cast at every call site
// (see the cast ratchet in test/ci/sharedTestTypecheck.test.ts).
import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot,
  WriteBatch,
  onSnapshot,
} from 'firebase/firestore';
import type { HttpsCallable } from 'firebase/functions';

/** The slice of a document snapshot the services read. */
export interface FakeDoc {
  id: string;
  data: () => unknown;
  exists?: () => boolean;
}

/** A query snapshot holding `docs`, with `empty`, `size` and `forEach` derived from them. */
export function fakeQuerySnapshot(docs: readonly FakeDoc[] = []): QuerySnapshot<never, never> {
  const snapshot = {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb: (doc: FakeDoc) => void) => {
      docs.forEach(cb);
    },
  };
  return snapshot as unknown as QuerySnapshot<never, never>;
}

/** A single document snapshot; `exists` defaults to whether `data()` returns anything. */
export function fakeDocSnapshot(doc: Partial<FakeDoc> = {}): DocumentSnapshot<never, never> {
  const data = doc.data ?? (() => undefined);
  const snapshot = {
    id: doc.id ?? 'doc',
    data,
    exists: doc.exists ?? (() => data() !== undefined),
  };
  return snapshot as unknown as DocumentSnapshot<never, never>;
}

/** A query-result document, for a fake cursor (`startAfter(doc)`). */
export function fakeQueryDoc(doc: FakeDoc): QueryDocumentSnapshot<never, never> {
  return fakeDocSnapshot(doc) as QueryDocumentSnapshot<never, never>;
}

/** What `httpsCallable(...)` returns, backed by a `vi.fn()` resolving `{ data }`. */
export function fakeCallable(call: (payload?: unknown) => Promise<{ data: unknown }>): HttpsCallable {
  return call as unknown as HttpsCallable;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The object a mocked `setDoc` / `updateDoc` was called with, ready to index. */
export function written(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`expected a written object, got ${typeof value}`);
  return value;
}

/** The `_path` a test's `doc()` / `collection()` mock stamped on the ref it returned. */
export function refPath(ref: unknown): string {
  if (isRecord(ref) && typeof ref._path === 'string') return ref._path;
  throw new Error('expected a mocked ref carrying a string _path');
}

/** A `writeBatch()` result backed by a test's own `{ set, update, delete, commit }` mocks. */
export function fakeWriteBatch(batch: Partial<Record<keyof WriteBatch, unknown>>): WriteBatch {
  return batch as unknown as WriteBatch;
}

/** An `onSnapshot` implementation that emits `snapshot` once, synchronously. */
export function emitOnce(snapshot: unknown): typeof onSnapshot {
  const listen = (_target: unknown, next: (snap: unknown) => void) => {
    next(snapshot);
    return () => undefined;
  };
  return listen as unknown as typeof onSnapshot;
}
