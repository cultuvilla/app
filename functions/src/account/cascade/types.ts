import type { Firestore } from 'firebase-admin/firestore';
import type { CollectionKey } from '@cultuvilla/shared/firebase/refs/admin';

/**
 * Where a collection holds the departing user's uid. A field path is written
 * the way the coverage test reads the schema (`heldBy.uid`,
 * `topOrganizers.[].userId`); two tokens name what no field can:
 *  - `id`   — the document id is the uid (`admins/{uid}`, `…/reads/{uid}`);
 *  - `path` — the collection lives under `users/{userId}`.
 * `fields: []` is a collection that holds no uid itself but goes with one that
 * does (a request's slots, a registration's private half).
 */
export interface CascadeTarget {
  readonly collection: CollectionKey;
  readonly fields: readonly string[];
}

export interface CascadeContext {
  readonly db: Firestore;
  readonly uid: string;
}

/** What one effect did, by name, for the deletion's log line. */
export type CascadeCounts = Readonly<Record<string, number>>;

interface EntryBase {
  /** Unique, kebab-case. */
  readonly id: string;
  readonly targets: readonly CascadeTarget[];
}

/** The deletion changes these documents: it removes them, or strips the uid and what names the user. */
export interface CascadeEffect extends EntryBase {
  readonly action: 'delete' | 'anonymise';
  readonly run: (ctx: CascadeContext) => Promise<CascadeCounts>;
}

/**
 * The deletion leaves these to something else (`trigger`: a projection that
 * follows its source), or keeps them on purpose (`retain`). Either way the
 * reason is the record of why — it is what the privacy policy's §7 is checked
 * against.
 */
export interface CascadeNote extends EntryBase {
  readonly action: 'trigger' | 'retain';
  readonly reason: string;
}

export type CascadeEntry = CascadeEffect | CascadeNote;
