# A trigger tolerates its subject being deleted

A Firestore trigger or scheduled sweep runs after the read or write that
started it, and the document it then updates can be deleted in between: an
account deletion removes the person, the push-queue entries and the socio
rows; deleting an org, event, comment or headword cascades its children, each
of which fires its own trigger against the parent that is already gone.
`update()` rejects that with gRPC `5 NOT_FOUND`. Unhandled, it fails the run;
with retries it loops against a document that will never come back, and in a
loop or a batch it takes every other write in that run down with it.

Taken from Órdago, where the same premise ("the trigger fired on this doc, so
it exists") shipped three times in two days.

## Decision

- **One helper:** [functions/src/shared/notFound.ts](../../functions/src/shared/notFound.ts).
  `isNotFound(err)` is the only NOT_FOUND predicate; `updateIfStillExists(() =>
  ref.update(…), { handler, path })` runs the write and returns `false` when
  the document is gone, logged at INFO with `reason: 'documentDeleted'` —
  an expected race, never an ERROR that alerts would key on. Every other code
  propagates.
- **Inside a transaction**, read the document first and skip it when absent;
  catching mid-transaction cannot work, the commit fails as a unit.
- **A batch** over documents someone else can delete becomes per-document
  writes (a BulkWriter), so one deleted document cannot fail the other 499.
- A `set` on a document the trigger owns (a read model, a marker) has no
  missing-document failure mode and needs none of this.

## Enforced by

[triggersTolerateDeletedSubject.test.ts](../../functions/src/__tests__/helpers/triggersTolerateDeletedSubject.test.ts):
no second NOT_FOUND predicate anywhere under `functions/src/`, and every
`.update(` in a file that defines a trigger or schedule goes through the helper,
a transaction, or a listed exception with its reason. It is a text scan of the
defining file, so a helper module a trigger calls is still reviewed by hand.
Handler tests simulate the race with
[deletedSubject.ts](../../functions/src/__tests__/helpers/deletedSubject.ts),
which deletes the document just before the update (or right after the query
that returned it), so the emulator answers with a real NOT_FOUND.
