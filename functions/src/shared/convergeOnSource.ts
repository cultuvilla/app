/**
 * Read-model writers that converge on the CURRENT source, not on their event.
 *
 * Eventarc delivers Firestore triggers at least once and in no guaranteed
 * order. A projection that writes from its event's own `after` is right only
 * when events arrive in order: a late update handled after the delete puts the
 * row of a deleted person or account back (for publicProfiles that is PII), and
 * a stale one overwrites a newer row. So the event decides WHETHER to project,
 * and the source as it stands when the rows are written decides WHAT.
 *
 * The source and every row are read and written in one transaction, so the
 * rows match the source whatever order the events arrive in. That caps a
 * projection at a transaction's 500 writes; a wider fan-out needs a
 * commit-then-re-read loop instead.
 */

import type {
  DocumentData,
  DocumentReference,
  Firestore,
  PartialWithFieldValue,
  Transaction,
  WithFieldValue,
} from 'firebase-admin/firestore';

/**
 * One write the current source asks for. Built with {@link setRow},
 * {@link mergeRow} or {@link deleteRow}, so each row keeps its own typed ref
 * (and converter). A row that already matches is simply not returned.
 */
export interface RowWrite {
  kind: 'set' | 'delete';
  path: string;
  apply: (tx: Transaction) => void;
}

export const setRow = <T>(ref: DocumentReference<T>, data: WithFieldValue<T>): RowWrite => ({
  kind: 'set',
  path: ref.path,
  apply: (tx) => {
    tx.set(ref, data);
  },
});

export const mergeRow = <T>(ref: DocumentReference<T>, data: PartialWithFieldValue<T>): RowWrite => ({
  kind: 'set',
  path: ref.path,
  apply: (tx) => {
    tx.set(ref, data, { merge: true });
  },
});

export const deleteRow = <T>(ref: DocumentReference<T>): RowWrite => ({
  kind: 'delete',
  path: ref.path,
  apply: (tx) => {
    tx.delete(ref);
  },
});

export interface ConvergeOutcome {
  set: number;
  deleted: number;
}

/**
 * Reads `sourceRef` in a transaction, asks `project` for the rows that source
 * means now (`null` when it no longer exists), and writes them in the same
 * transaction. `project` may read more through `tx` (all its reads run before
 * any write) and may run more than once on contention, so it must have no side
 * effects beyond those reads. The source is read raw: a projection decides for
 * itself what a malformed field means, rather than a converter throwing.
 */
export const projectRowsFromCurrentSource = async <S>({
  db,
  sourceRef,
  project,
}: {
  db: Firestore;
  sourceRef: DocumentReference<S>;
  project: (current: DocumentData | null, tx: Transaction) => RowWrite[] | Promise<RowWrite[]>;
}): Promise<ConvergeOutcome> =>
  db.runTransaction(async (tx) => {
    const sourceSnap = await tx.get(sourceRef.withConverter(null));
    const rows = await project(sourceSnap.data() ?? null, tx);
    for (const row of rows) row.apply(tx);
    return {
      set: rows.filter((row) => row.kind === 'set').length,
      deleted: rows.filter((row) => row.kind === 'delete').length,
    };
  });
