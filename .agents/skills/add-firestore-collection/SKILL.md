---
name: add-firestore-collection
description: Use whenever adding a new Firestore collection — usually a first-class top-level collection scoped by `municipalityId`. Encodes the multi-file checklist (model + service + index re-export + services map + rules + composite index + vitest + rules test) so the change lands complete in one commit instead of trickling in over five.
---

# Add a new Firestore collection

Adding a collection is a multi-file change that's easy to do incompletely. Every step below ships in the **same commit**.

## Decide the path

Cultuvilla uses **first-class top-level collections** scoped by a `municipalityId` field (see AGENTS.md §3 and [docs/decisions/open-feed-architecture.md](../../../docs/decisions/open-feed-architecture.md)). Two questions:

1. **Is this entity owned by exactly one parent doc, with no cross-parent queries?** Yes → nest under that parent (e.g. `users/{uid}/notifications/{nid}`, `events/{eid}/registrations/{rid}`, `organizations/{orgId}/members/{uid}`). No → top-level (`events/`, `organizations/`, `persons/`, `news/`, …) with a `municipalityId` field.
2. **Default to top-level.** Only nest when the parent–child ownership is genuine and you never need to read children across parents. Nesting is the exception, not the rule.

## Checklist

### 1. Model (Zod schema is source of truth)

Create `packages/shared/src/models/<entity>/<Entity>DataModel.ts`. The Zod schema is the source of truth — the TypeScript type is derived from it:

```ts
import { z } from 'zod';

export const <Entity>DataSchema = z.object({
  // all fields, strict — no any. Use z.string(), z.number(), z.date(),
  // z.boolean(), z.array(...), nested z.object(...), z.enum(...),
  // .nullable() for nullable fields.
});
export type <Entity>Data = z.infer<typeof <Entity>DataSchema>;

export interface <Entity>DataInput { /* fields with optional defaults */ }
export function build<Entity>Data(input: <Entity>DataInput): <Entity>Data { /* apply defaults */ }
```

Add a `packages/shared/src/models/<entity>/index.ts` re-exporting, and add `export * from './<entity>'` to `packages/shared/src/models/index.ts`.

### 2. Declare the collection — one entry in `refs/collections.ts`

Add ONE entry to `COLLECTIONS` in [`packages/shared/src/firebase/refs/collections.ts`](../../../packages/shared/src/firebase/refs/collections.ts):

```ts
<entity>s: def('<entity>s', <Entity>DataSchema),
// a subcollection: one `{name}` per parent id, in order
<parent><Entity>s: def('<parents>/{<parent>Id}/<entity>s', <Entity>DataSchema),
// rules deny every client read and write → refs/client.ts cannot bind it
<entity>s: serverOnly('<entity>s', <Entity>DataSchema),
```

That entry is the whole registration: the converter (one per schema per SDK,
memoized by `clientConverter` / `adminConverter` in `converters/sdkAdapters.*.ts`)
and the conformance gate's target both derive from it. No converter file is
needed. Write a `<entity>Converter.{client,admin}.ts` one-liner
(`export const <entity>ConverterClient = clientConverter(<Entity>DataSchema);`)
only if a service needs the converter outside a ref. Never call `makeConverter`
directly: a second converter object for one schema makes the JS SDK's
`refEqual` see two refs to one doc as different.

### 3. Ref factories (the ONLY place raw `collection()` / `db.collection()` is allowed)

Add named factories over the entry in `packages/shared/src/firebase/refs/client.ts`
and/or `refs/admin.ts` — only the side(s) that read it. They are one-liners over
each file's binder; the path and converter come from the entry, and the parent
ids are type-checked against its template:

```ts
// client.ts and admin.ts — the same text on both sides
export const <entity>sCollection = (db: Firestore) => typedCollection(db, C.<entity>s);
export const <entity>Doc = (db: Firestore, id: string) => typedDoc(db, C.<entity>s, id);
```

`rawDoc` / `rawCollection` give an unconverted ref (client writes that stamp
`serverTimestamp()`, or a collection with `schema: null`). `typedGroup` gives a
collection-group query. `test/firebase/refsTable.test.ts` holds both sides to
the table: same paths, only declared paths, one converter per schema.

The CI grep gate (`scripts/check-no-raw-firestore-refs.mjs`) fails the build if raw ref strings appear anywhere else.

### 4. Service

Create `packages/shared/src/services/<entity>Service.ts`. Banner-section style matching `eventService.ts` or `personService.ts`. Strict types on every export. No `any` at boundaries. No silent fallbacks. **Always use the typed ref factories from step 3** — never construct `doc(getDb(), '<entity>', id)` inline. The only exception: an `updateDoc(doc(getDb(), '<entity>', id), partial)` pattern is allowed *on the same line* when the typed `UpdateData<<Entity>Data>` distribution chokes on `null + FieldValue` siblings — see `membershipProfileService.ts` for an example.

Standard entry points to define (only those that are actually needed — YAGNI). For top-level collections the doc id alone identifies the entity; the `municipalityId` lives inside the doc and is passed in `create<Entity>Input`:

- `get<Entity>(id): Promise<Entity | null>`
- `get<Entity>sByMunicipality(municipalityId): Promise<Entity[]>`
- `create<Entity>(input: Create<Entity>Input): Promise<Entity>` — `input` includes `municipalityId`
- `update<Entity>(id, patch: Update<Entity>Input): Promise<void>`
- `delete<Entity>(id): Promise<void>`

For nested sub-collections (the exception, not the default — see "Decide the path"), thread the parent id through the signatures the same way `registrationService` does (`createRegistration(eventId, input)`).

Cross-user writes or trust-sensitive updates DO NOT go in the client service — they go in a Cloud Function callable. See the `guardrail-enforcement` skill.

### 5. Index re-export

Add the service to `packages/shared/src/services/index.ts`. Match the style of existing entries (`export * from './<entity>Service';`).

### 6. Services map

Add a row to [`packages/shared/src/services/_services-map.md`](../../../packages/shared/src/services/_services-map.md):

```markdown
| [<entity>Service](<entity>Service.ts) | `<collection>/` (top-level, `municipalityId` field) | <one-sentence summary> | `get<Entity>`, `get<Entity>sByMunicipality`, `create<Entity>`, `update<Entity>`, `delete<Entity>` |
```

The map is the agent index. Skipping this row means future sessions won't find your service.

### 7. Rules — auth + shape validation

Open [`firestore.rules`](../../../firestore.rules). TWO things go in:

**(a)** A shape predicate at the top of the file (next to `isValidNewsPostCreate` and friends). It mirrors the Zod schema — `keys().hasOnly([...])` rejects unknown fields, `keys().hasAll([...])` requires every field, plus type checks (`is string`, `is number`, `is bool`, `is timestamp`, or `in [enum, values]`):

```
function isValid<Entity>Create(d) {
  return d.keys().hasOnly([/* every field in <Entity>DataSchema */])
      && d.keys().hasAll([/* every required field */])
      && isString(d.<field>)
      && d.<enum> in ['a', 'b', 'c']
      && isTimestamp(d.<dateField>)
      ;
}
```

**(b)** A top-level match block that uses both the helper predicates AND the shape predicate. Derive the municipality from the doc's `municipalityId` field, not from the path:

```
match /<collection>/{docId} {
  allow read: if isVillageMember(resource.data.municipalityId);
  allow create: if isVillageMember(request.resource.data.municipalityId)
                  && isValid<Entity>Create(request.resource.data)
                  && request.resource.data.createdBy == request.auth.uid;
  allow update: if isOwner(resource.data.createdBy)
                  || isVillageAdmin(resource.data.municipalityId);
  allow delete: if isOwner(resource.data.createdBy)
                  || isVillageAdmin(resource.data.municipalityId);
}
```

Use the existing helper functions (`isVillageMember`, `isVillageAdmin`, `isOwner`, `isAppAdmin`) — don't redefine identity checks inline.

Shape enforcement at the rules level is the **only** defense against direct console writes or any code path that forgets to use a typed ref. The typed converter only enforces on writes that go through it; the rules apply to every write. Skipping this step means a future regression bypasses the entire schema.

If the write is cross-user or trust-sensitive (only the village admin can grant a role, only the organizer can finalize an event, etc.), tighten the rule to `allow write: if false` for the affected fields and route the write through a Cloud Function — see `guardrail-enforcement`.

### 8. Composite index

Open [`firestore.indexes.json`](../../../firestore.indexes.json). Add a composite index for the standard `(municipalityId, <sortField>)` filter+sort shape that the by-municipality query uses:

```json
{
  "collectionGroup": "<collection>",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "municipalityId", "order": "ASCENDING" },
    { "fieldPath": "<sortField>", "order": "DESCENDING" }
  ]
}
```

Use `queryScope: "COLLECTION_GROUP"` only when you genuinely need to query across nested parents (rare, since most collections are top-level). The cost of an unused index is negligible; the cost of a runtime "this query requires an index" error in front of a user is high.

### 9. Vitest

Create `packages/shared/test/services/<entity>Service.test.ts`. Cover at minimum:

- `create<Entity>` writes the expected shape (mocked Firestore or fakes — match existing tests in `packages/shared/test/services/`).
- `update<Entity>` rejects an invalid patch (e.g. missing required field) by throwing, NOT silently swallowing.
- `get<Entity>` returns `null` (not undefined) for a missing doc.

Run: `pnpm shared:test` — should pass.

### 10. Rules tests — auth AND shape

Create `packages/shared/test/e2e/<entity>Rules.test.ts` for auth checks and add cases to `packages/shared/test/e2e/shapeRules.test.ts` (or a new `<entity>ShapeRules.test.ts`) for shape checks. Cover at minimum:

Auth:
- An authenticated village member CAN create a doc.
- An authenticated NON-member CANNOT create a doc.
- A doc owner CAN update; a non-owner non-admin CANNOT.

Shape (in `shapeRules.test.ts`):
- A valid full-shape payload is ACCEPTED.
- A payload with an unknown field is REJECTED (`hasOnly` check).
- A payload with a missing required field is REJECTED (`hasAll` check).
- A payload with the wrong type on a critical field is REJECTED.
- A payload with an unknown enum value is REJECTED.

Run: `pnpm test:rules` — should pass. It ends with the **rules coverage ratchet** (`scripts/check-rules-coverage.mjs`): every `allow` condition you add must be seen by a test both granting and returning `false` (an evaluation error does not count as a refusal). If one genuinely cannot be, list its key (`/<match path> <ops>`, as the check prints it) in `packages/shared/test/e2e/rules-uncovered.json` with a `never-…: <why>` reason. Must use `useRulesTestEnv()` — that harness is what collects the coverage.

### 11. The conformance gate — nothing to do

[`scripts/check-dev-conformance.mjs`](../../../scripts/check-dev-conformance.mjs)
walks `conformanceTargets` from `refs/admin`, derived from `COLLECTIONS`: every
entry with a schema, at any depth. Step 2 registered it. Before landing a
collection that already holds data in beta/prod under a schema change, run the
gate against that env (`env -u GOOGLE_APPLICATION_CREDENTIALS node
scripts/check-dev-conformance.mjs --env beta`): it gates the next promotion.

### 12. Deploy notes in the PR description

If the rules or indexes file changed, the PR description must note that a deploy is needed and to which env (default dev — use the `firestore-deploy` skill). Indexes build asynchronously after deploy.

## Required outputs

- [ ] Zod schema in `packages/shared/src/models/<entity>/<Entity>DataModel.ts` with `z.infer` type and `build<Entity>Data` factory.
- [ ] One entry in `COLLECTIONS` (`packages/shared/src/firebase/refs/collections.ts`).
- [ ] Named factories over it in `refs/client.ts` and/or `refs/admin.ts`.
- [ ] Service in `packages/shared/src/services/<entity>Service.ts` using the typed refs (zero raw `doc()` / `collection()` outside the documented `updateDoc` pairing).
- [ ] Service exported from `index.ts` + row added to `_services-map.md` in the same commit.
- [ ] Rules block in `firestore.rules` with BOTH auth helpers AND a `isValid<Entity>Create` shape predicate wired into `allow create`.
- [ ] Composite index entry in `firestore.indexes.json` for `(municipalityId, sortField)` (or the equivalent shape your queries use).
- [ ] Service vitest + auth rules e2e test + shape rules e2e cases.
- [ ] `pnpm check:no-raw-firestore-refs` passes.
- [ ] PR description notes the deploy needed.

## Don't

- **Don't write raw `collection(getDb(), '...')` or `db.collection('...')` anywhere outside `firebase/refs/`.** The grep gate fails the build. The ONE exception is an inline `updateDoc(doc(getDb(), '...', id), partial)` on the same line, and only when the typed `UpdateData<T>` distribution chokes on `null + FieldValue` siblings.
- **Don't skip the shape predicate in the rules.** The converter only protects writes that go through typed services. A manual console edit, a third-party script, or any future code that forgets to use a typed ref bypasses the converter entirely. Rules are the only enforcement that catches that.
- **Don't ship the service without updating `_services-map.md`.** Stale map = blind future sessions.
- **Don't put a cross-user write in the service.** Wrong layer. Use a callable. See `guardrail-enforcement`.
- **Don't nest under a parent doc when top-level works.** Top-level + `municipalityId` is the default; only nest when the parent–child ownership is genuine and you'll never need to query children across parents.
- **Don't redefine identity check predicates in the rules block.** Use the existing helpers.
- **Don't ship rules + indexes without flagging the deploy** — they don't auto-propagate from the merge.

## When this skill applies

- A user asks to "add a <thing> collection", "model <entity>", or "track <thing> per village".
- A feature spec mentions a new entity that doesn't have a service today.
- A code review flags a query that can't be expressed against existing collections.

## Companion skills

- `touch-service` — once the service file exists, every change to it follows that procedure.
- `firestore-deploy` — for actually pushing the rules + indexes to dev.
- `guardrail-enforcement` — for any write that needs to live in a Cloud Function rather than the client service.
- `denormalized-read-model` — if the new collection holds copies of fields owned elsewhere.
