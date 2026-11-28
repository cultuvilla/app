// Simulates the race a trigger must tolerate: its subject deleted after the
// handler read it but before the handler's own update lands. The spy deletes
// the target document, then lets the real write run, so Firestore answers
// with a genuine NOT_FOUND.

import { vi } from 'vitest';
import { DocumentReference, Query } from 'firebase-admin/firestore';

type Matcher = (path: string) => boolean;

type Method = (this: unknown, ...args: unknown[]) => Promise<unknown>;

/** The unspied method, taken off the prototype before the spy replaces it. */
function originalMethod(proto: object, name: string): Method {
  return (Object.getOwnPropertyDescriptor(proto, name) as { value: Method }).value;
}

function matcherFor(target: string | RegExp): Matcher {
  return typeof target === 'string' ? (path) => path === target : (path) => target.test(path);
}

/** Deletes the matching document just before a `DocumentReference.update` on it. */
export function deleteBeforeUpdate(target: string | RegExp): { restore: () => void } {
  const matches = matcherFor(target);
  const original = originalMethod(DocumentReference.prototype, 'update');
  const spy = vi
    .spyOn(DocumentReference.prototype, 'update')
    .mockImplementation(async function (this: DocumentReference, ...args: unknown[]) {
      if (matches(this.path)) await this.delete();
      return original.apply(this, args) as ReturnType<DocumentReference['update']>;
    });
  return { restore: () => { spy.mockRestore(); } };
}

/**
 * Deletes the matching document right after a query returned it — the
 * handler holds a snapshot of a document that no longer exists.
 */
export function deleteAfterQuery(target: string | RegExp): { restore: () => void } {
  const matches = matcherFor(target);
  const original = originalMethod(Query.prototype, 'get') as (this: Query) => ReturnType<Query['get']>;
  const spy = vi.spyOn(Query.prototype, 'get').mockImplementation(async function (this: Query) {
    const snap = await original.apply(this);
    await Promise.all(snap.docs.filter((d) => matches(d.ref.path)).map((d) => d.ref.delete()));
    return snap;
  });
  return { restore: () => { spy.mockRestore(); } };
}
