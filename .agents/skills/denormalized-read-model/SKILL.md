---
name: denormalized-read-model
description: Use whenever adding a new denormalized field on a Firestore read model, or extending an existing one — codifies the source-of-truth/trigger/read-model/backfill pattern documented in docs/architecture/denormalized-read-models.md and exemplified by functions/src/syncVillageDenormalization.ts.
---

# Add or extend a denormalized read model

Cultuvilla uses denormalized read models to keep high-fan-out reads flat — instead of issuing N+1 queries to fetch `villageName` for every event in a feed, we copy that field onto the event document at write time and propagate updates via a Cloud Function trigger. See [docs/architecture/denormalized-read-models.md](../../../docs/architecture/denormalized-read-models.md) for the full rationale.

This skill walks you through adding a new denormalized field or read model. Six steps, all in one commit (plus an out-of-band backfill).

## Decide whether to denormalize

Use a denormalized read model when **all** of these are true:

1. The read happens on a hot path — list, feed, search result.
2. The data crosses a collection boundary or would require N+1 follow-up reads.
3. The denormalized fields change much **less often** than they are read.
4. You accept brief staleness between source write and propagation (typically <2s).

If any of those fails, fetch live. Denormalization adds a write-amplification cost and a trigger to keep alive.

## Step 1 — Identify the source-of-truth doc and the read targets

Write it down. "When `villages/{vid}.images[0]` changes, every `villages/{vid}/events/{eid}.villageCoverImage` should update."

Source-of-truth doc: the canonical owner. Only one place can mutate it.

Read-target docs: where the denormalized copy lives. Often N docs for one source — the trigger fans out.

## Step 2 — Add the denormalized fields to the read-target model

In `packages/shared/src/models/<read-target>.ts`, add the new fields with a comment marking them as denormalized:

```ts
interface Event {
  // … source fields …

  // ─── Denormalized from villages/{vid} — kept in sync by
  //     functions/src/syncVillageDenormalization.ts.
  villageName: string;
  villageCoverImage: string | null;
  villageCoordinates: GeoPoint | null;
}
```

The comment is the only acceptable "explain what the code does" comment in this repo, because the *why* is non-obvious: a field that looks redundant is intentional. Identify the trigger file by name.

## Step 3 — Write the trigger

In `functions/src/sync<Source>Denormalization.ts` (one file per source-of-truth collection), add or extend the `onDocumentUpdated` handler.

Pattern (mirrors `syncVillageDenormalization.ts`):

```ts
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from './firebaseAdmin';

export const sync<Source>Denormalization = onDocumentUpdated(
  '<source>/{docId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const denormalizedFieldsChanged =
      before.<fieldA> !== after.<fieldA> ||
      before.<fieldB> !== after.<fieldB>;
    if (!denormalizedFieldsChanged) return;

    const targets = await db
      .collection('<read-target-path-pattern>')
      .where('<sourceIdField>', '==', event.params.docId)
      .get();

    if (targets.empty) return;

    const batch = db.batch();
    for (const doc of targets.docs) {
      batch.update(doc.ref, {
        <fieldA>: after.<fieldA>,
        <fieldB>: after.<fieldB>,
      });
    }
    await batch.commit();

    logger.info('Denormalized fields propagated', {
      handler: 'sync<Source>Denormalization',
      sourceId: event.params.docId,
      targetCount: targets.size,
    });
  }
);
```

Notes:
- **Always early-return** when the denormalized fields are unchanged. Otherwise every unrelated update on the source triggers a fan-out write.
- **Use `batch.commit()`** when fanning out to multiple docs. Firestore caps batches at 500 writes; if you can exceed that, chunk explicitly. See `syncVillageDenormalization.ts` for the chunking pattern.
- **`handler` field in every log call.** See the `cloud-function-logging` skill.

Export the trigger from `functions/src/index.ts`.

## Step 4 — Tighten rules

Open [`firestore.rules`](../../../firestore.rules) and ensure clients cannot write the denormalized fields directly. The standard pattern:

```
allow update: if isVillageMember(villageId) &&
  !request.resource.data.diff(resource.data).affectedKeys()
    .hasAny(['villageName', 'villageCoverImage', 'villageCoordinates']);
```

This makes the trigger the only writer of the denormalized fields. If a client tries to set `villageName` on an event, the rule rejects the entire update.

## Step 5 — Backfill existing docs

Existing docs in Firestore were created before the field existed; they need a one-time backfill. Create `scripts/backfill-<source>-denorm.mjs`:

```js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'villa-events';
initializeApp({ projectId });
const db = getFirestore();

const sources = await db.collection('<source>').get();
for (const source of sources.docs) {
  const data = source.data();
  const targets = await db
    .collection('<read-target>')
    .where('<sourceIdField>', '==', source.id)
    .get();

  if (targets.empty) continue;

  let batch = db.batch();
  let count = 0;
  for (const target of targets.docs) {
    batch.update(target.ref, {
      <fieldA>: data.<fieldA>,
      <fieldB>: data.<fieldB>,
    });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
  console.log(`${source.id}: backfilled ${targets.size} targets`);
}
```

### Run the backfill AFTER the trigger is deployed, never before

Until the new trigger is live, the **old** one is still handling writes — and it
doesn't know about the new field. Any source doc that changes in the gap gets its
target row rewritten without the field, silently undoing the rows you just
backfilled. Reads then hit the strict Zod converter, which *throws* rather than
tolerating the missing field, so the screen reading that collection crashes.

This has bitten twice. Both times the backfill itself was correct; it just ran too
early. A backfill is only durable once the code that maintains the field is live.

**Dev** — you deploy, so you control the order. Deploy the function first
(`firestore-deploy` skill), then run the backfill, then verify:

```bash
GOOGLE_CLOUD_PROJECT=villa-events node scripts/backfill-<source>-denorm.mjs
pnpm check:dev-conformance   # walks every dev collection through its converter
```

No confirmation needed — dev is safe to mutate. Verify a sample doc in the console
too; `check:dev-conformance` catches converter breakage, not a wrong value.

**Beta / prod** — you do *not* run these, and there is no ordering decision to make
by hand. Mark the change's `changelog.d/` entry with a `**Migration:**` line naming the script:

```markdown
**Migration:** existing `<collection>/` docs are backfilled with `<field>` by
running `scripts/backfill-<source>-denorm.mjs` (per env).
```

That marker is the whole handoff. `prepare-release` greps the stamped version block
for it and emits a per-env backfill checklist into the `develop → beta` and
`beta → main` promotion PRs, where a human runs it at promotion time. Code deploys
automatically on promotion; a backfill does not — without the marker it is simply
forgotten. The conformance gate then blocks the deploy if the backfill was skipped,
which is the safe failure but a late and noisy one.

Ordering holds across envs for the same reason as dev: the promotion deploys the
function, *then* the checklist item runs the backfill.

## Step 6 — Integration test

Create `packages/shared/test/integration/<source>Denorm.test.ts`. The test:

1. Boots the Firestore + Functions emulators (the harness in `scripts/run-tests-with-emulators.mjs` handles this).
2. Creates a source doc and N target docs that should be kept in sync.
3. Mutates the source.
4. Polls the targets (up to a 2s budget) until the denormalized fields match the new source values.
5. Asserts every target was updated.

Run: `pnpm test:integration` — should pass.

## Step 7 — Document

Add a row to the **Denormalized fields** table in [`packages/shared/src/services/_services-map.md`](../../../packages/shared/src/services/_services-map.md):

```markdown
| `<fieldA>`, `<fieldB>` | `<read-target-collection>` | `<source-collection>` | [functions/src/sync<Source>Denormalization.ts](../../../../functions/src/sync<Source>Denormalization.ts) |
```

Add a paragraph to [`docs/architecture/denormalized-read-models.md`](../../../docs/architecture/denormalized-read-models.md) under "Existing read models" describing the new one and why it exists.

## Required outputs

- [ ] Model updated with denormalized fields + comment naming the trigger file.
- [ ] Trigger written, exported from `functions/src/index.ts`, with `handler` field on every log call.
- [ ] Early-return on unchanged source fields.
- [ ] Rules updated to forbid client writes to the denormalized fields.
- [ ] Backfill script created and run against dev **after** deploying the trigger, verified with `pnpm check:dev-conformance` + a sample doc.
- [ ] `**Migration:**` marker in the `changelog.d/` entry naming the script, so beta/prod inherit the backfill at promotion time.
- [ ] Integration test that mutates source → asserts target updates.
- [ ] `_services-map.md` and `docs/architecture/denormalized-read-models.md` updated.

## Don't

- **Don't skip the early-return on unchanged fields.** Every unrelated source update will fan out a no-op batch — wasted writes and noise in logs.
- **Don't denormalize a field that changes more often than it's read.** Use a live read or a small cache instead.
- **Don't write the denormalized field from a client service.** The trigger is the only writer; the rule enforces this.
- **Don't ship without a backfill plan.** Existing docs become inconsistent the moment the trigger goes live.

## When this skill applies

- The user asks to "show <field-from-other-collection>" on a list or feed.
- A query plan ends up needing N+1 reads.
- A new collection joins fields owned elsewhere (in which case run this alongside `add-firestore-collection`).

## Companion skills

- `add-firestore-collection` — if the read target itself is new.
- `cloud-function-logging` — for the structured-log convention used in the trigger.
- `firestore-deploy` — to push the rules + functions to dev.
