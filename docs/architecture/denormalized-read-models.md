# Denormalized read models

When and how to copy data from one Firestore document onto another, and how to keep those copies in sync. This is the pattern cultuvilla uses for high-fan-out reads. Read this before adding a new collection or a new feature that lists data from across the app.

## The problem

Firestore reads are cheap individually, but they don't compose. A naïve "list upcoming events across all villages" view that needs to show `villageName` and `villageCoverImage` for each event would either:

1. Do one read per event to fetch the village → N+1, slow, expensive at the limit.
2. Issue a single collection-group query and discover at render time that it doesn't carry the fields the UI needs.
3. Force the client to maintain a parallel `villages` cache.

None of these survive contact with mobile networks and Firestore quotas.

## The pattern

Pick a small set of fields that callers need at list time. Store a **copy** of those fields directly on the read-target documents at write time, and update the copies whenever the source changes — via a Cloud Function trigger, never the client.

For example, a municipality's escudo is the source of truth for a village's
cover image. Every event carries a denormalized copy as
`events/{eid}.villageCoverImage`. The feed query reads top-level events only; it
never has to JOIN to municipalities. (On the municipality/village naming, see
[municipality-vs-village.md](./municipality-vs-village.md): events live in a flat
top-level `events/` collection keyed by a `municipalityId` foreign key, and carry
`village*` display copies.)

```
                   ┌─ source of truth ──────────┐
                   │   municipalities/{id}      │
                   │   .name                    │
                   │   .escudoManualUrl/escudoUrl│
                   │   .coordinates             │
                   └────────────┬───────────────┘
                                │ onDocumentUpdated
                                ▼
                   ┌─ Cloud Function trigger ───┐
                   │ syncVillageDenormalization │
                   └────────────┬───────────────┘
                                │ batch update
                                ▼
                   ┌─ read model ───────────────┐
                   │ events/{eid} (top-level)   │
                   │   .villageName             │
                   │   .villageCoverImage       │
                   │   .villageCoordinates      │
                   └────────────────────────────┘
```

## When to use it

Use a denormalized read model when **all** of the following are true:

1. The read happens on a hot path — a list, a feed, a search result — where the user is waiting.
2. The data crosses a collection boundary, or would require N+1 follow-up reads.
3. The denormalized fields change much less often than they are read. (Cover image: rare. Attendee count: often. Different tradeoffs.)
4. You are willing to accept brief staleness between source write and propagation (typically <2s in practice).

If any of these is false, don't denormalize — query the source instead.

## When **not** to use it

- The query is admin-only or runs once a day.
- The field changes on every read-side event (e.g., live attendee count — use a counter field instead).
- You're tempted to copy *every* field of the source. That isn't denormalization, it's duplication; you'll fight drift forever.
- The value should stay **current** everywhere, lives on a **readable** source doc, and you never query by it (e.g. a villager's profile photo). Don't copy it — store the id and subscribe to the source. See [live references](./live-references.md) for that pattern and the full copy-vs-reference decision rule.

## The rules

1. **One source of truth.** The original document is authoritative. The copy is disposable; the function rebuilds it from the source on every relevant change.
2. **Copy only what the read needs.** If the feed shows name + cover image, copy those two fields. Not the village description, not the timezone, not the admin list.
3. **Sync runs server-side, never on the client.** Clients write the source; a function propagates. Clients must not write to denormalized fields directly — Firestore rules should reject it.
4. **The trigger lives next to the source.** Name it for what it does: `syncVillageDenormalization`, not `onVillageUpdate`. If villages get archived (delete), the trigger handles that too.
5. **Batch in chunks of 500.** Firestore commits cap at 500 ops. The existing trigger paginates; copy that idiom.
6. **Trigger only on actual changes.** Compare `before` and `after`; bail out early when none of the watched fields changed. This is what keeps the function from re-running itself in a loop, and keeps cost predictable.
7. **Record every denormalized field in the [services map](../../packages/shared/src/services/_services-map.md).** New denormalized fields without a documented trigger are a bug.

## The canonical example

[functions/src/village/syncVillageDenormalization.ts](../../functions/src/village/syncVillageDenormalization.ts) is the example to copy. It demonstrates:

- Watching `municipalities/{municipalityId}` for updates.
- Comparing watched fields (`name`, escudo, `coordinates`) between before/after.
- Early return when nothing relevant changed.
- A top-level query (`events` where `municipalityId == ...`) for fan-out.
- Chunked batched updates (500 per commit).

When adding a new denormalization trigger, mirror its structure.

## Existing read models

### `municipalityPeople/{municipalityId}_{personId}` ← `persons/{personId}`

The village people roster reads a municipality-scoped projection rather than
joining membership records to account profiles or trying to query partial
objects inside `persons.municipalityLinks`. One row is created for every
municipality linked from a persona, including dependent personas with no user
account. Rows carry only display data and a normalized `sortName`, allowing the
directory query to return an alphabetical list in one read.

Rows carry the person's `barrioId` for that municipality, so the **barrio
roster reads this directory too** rather than querying `persons` by
`municipalityLinks`. That isn't a performance choice: the persons read rule is
evaluated per matched document, so a persons query that could match a private
persona is rejected outright — filtering them out would drop those people from
the barrio entirely instead of merely leaving their row unlinked.

Rows also mirror `persons.isPublic`. A private dependent persona keeps its row —
the pueblo census stays honest about who lives there — but the roster reads the
projected flag to know the row leads nowhere, since the person doc itself is
denied to everyone but its creator.

- **Source of truth:** `persons/{personId}.municipalityLinks` and its person
  display fields.
- **Trigger:** [functions/src/village/syncMunicipalityPeople.ts](../../functions/src/village/syncMunicipalityPeople.ts)
  fires on every person write, diffs the linked municipality set, and writes or
  deletes deterministic directory rows.
- **Rules:** village members and app admins may read their municipality’s rows;
  all writes are function-owned.
- **Backfill:** [scripts/backfill-municipality-people.mjs](../../scripts/backfill-municipality-people.mjs)
  reconciles directory rows in dev after the trigger deploys;
  [scripts/backfill-person-visibility.mjs](../../scripts/backfill-person-visibility.mjs)
  seeds `isPublic` on both `persons` and the projection;
  [scripts/backfill-municipality-people-barrio.mjs](../../scripts/backfill-municipality-people-barrio.mjs)
  seeds `barrioId` on the projection.

### `users/{uid}.displayName` ← `persons/{personId}`

The user document carries a denormalized projection of the linked persona's
name (`buildDisplayName(person)` = givenName + middleNames + firstSurname +
secondSurname). The user menu and several name-rendering surfaces read it
without joining the persons collection.

- **Source of truth:** `persons/{personId}` with the link
  `person.userId == users/{uid}`.
- **Trigger:** [functions/src/users/syncPersonDenormalization.ts](../../functions/src/users/syncPersonDenormalization.ts).
  Fires `onDocumentWritten`, projects the name, short-circuits when unchanged,
  uses `set(merge:true)` so it can populate `users/{uid}.displayName` even
  before the client's onboarding flow has finished creating the user doc.
- **Rules:** `firestore.rules` blocks clients from writing `displayName` on
  `users/{uid}` for both create and update.
- **Backfill:** none available — `scripts/backfill-user-displayname.mjs` reconciled
  user docs whose persons predated the trigger, but it has been deleted and this
  entry linked at nothing. If these ever drift, the reconciliation has to be
  rewritten; the trigger's `set(merge:true)` repairs a doc on the next person write.
- **Delete behavior:** the trigger leaves `users/{uid}.displayName` intact on
  person delete — the user's name is still a useful last-known value; an
  explicit account flow can clear it later if needed.

### `publicProfiles/{uid}` ← `users/{uid}`

The account doc holds private contact fields and is readable only by its owner
(and app admins). Everything the app shows about *another* account — its name
and active village — comes from this projection instead: a comment author, an
org's member list, `/usuario/{uid}`.

- **Source of truth:** `users/{uid}.displayName` (itself projected from the
  linked person, see below) and `users/{uid}.activeMunicipalityId`.
- **Trigger:** [functions/src/users/syncPublicProfile.ts](../../functions/src/users/syncPublicProfile.ts).
  Fires `onDocumentWritten` on `users/{uid}`, writes exactly those two fields,
  short-circuits when they are unchanged, and deletes the row with the account.
- **Rules:** single-doc `get` is public; `list` and every client write are
  denied. A listable projection would be an account directory.
- **Backfill:** [scripts/backfill-public-profiles.mjs](../../scripts/backfill-public-profiles.mjs)
  (registered, `pre-deploy`, auto-applied). Reconciles rows and deletes orphans.
- **Adding a field:** only if anyone, signed out included, may read it. Contact
  details never belong here.

### `commentCount` ← `comments/`

Every comment-capable kind (event, organization, festivalPoster, place, barrio,
news, vocabularyTerm, historyEntry) carries a running comment count on its own doc, so cards and detail screens
can show it without a `getCountFromServer` per entity per render.

- **Source of truth:** the generic top-level `comments/` collection, each doc
  carrying `entityKind` + `entityId` (+ `municipalityId` for routing to
  nested parents).
- **Trigger:** [functions/src/interaction/syncEntityInteractionCounts.ts](../../functions/src/interaction/syncEntityInteractionCounts.ts)
  — `syncEntityCommentCount`, an `onDocumentWritten` on `comments/`. Routes by
  `entityKind` to the right parent doc: top-level for `event` /
  `organization` / `festivalPoster` / `news` / `vocabularyTerm` / `historyEntry`, nested
  (`municipalities/{municipalityId}/places/{id}` or `.../barrios/{id}`) for
  `place` / `barrio`. The count is incremented/decremented with
  `FieldValue.increment`, not recomputed from a full scan — this is a
  counter, not a projected copy (see "Counters vs. denormalization" below).
- **Rules:** `firestore.rules` excludes `commentCount` from every entity
  doc's client-writable update fields; only the trigger (admin SDK) can
  change it. Create rules require the field present and zeroed.
- **Backfill:** [scripts/backfill-entity-comment-counts.mjs](../../scripts/backfill-entity-comment-counts.mjs)
  reconciles existing entity docs against the actual `comments` data.
- **Delete behavior:** deleting an entity does not need to zero its own
  count (the doc goes away); deleting a `comments` doc via cascade (e.g.
  `deleteNewsPost`) still fires the trigger per deleted doc, so counts on a
  *surviving* parent stay correct. A parent deleted out from under a
  still-in-flight trigger is a no-op (`isNotFound` guard), not a retry loop.

### `vocabularyWords/` ← `vocabularyTerms/`

One row per *word*, across every village that records it — what the "añadir
palabra" search reads so that a villager sees "esbardo · en 3 pueblos" while
typing, instead of coining a second entry for a word the app already has.

Unlike every other row here it projects whole documents, not a field: the index
row **is** the word.

- **Source of truth:** `vocabularyTerms/` — each village's own entry. A word
  exists precisely because some village wrote it down, which is why the index is
  derived rather than authored: when the last village drops the word, the row
  goes with it, and no client can invent a word no pueblo records.
- **Trigger:** [functions/src/vocabulary/syncVocabularyWordIndex.ts](../../functions/src/vocabulary/syncVocabularyWordIndex.ts)
  — `syncVocabularyWordIndex`, an `onDocumentWritten` on `vocabularyTerms/`. It
  **recounts** the word's active entries rather than incrementing a counter: a
  term's status flips under moderation, and the entry that created the word can
  be the one deleted. The display spelling and kind come from the village that
  recorded it first, so a later pueblo cannot rename a shared word.
- **Only `palabra` and `dicho` are indexed.** A `mote` names one village's
  family and a `toponimo` one village's field — "El Cerro" in two pueblos is two
  different places, so merging those would be a factual error, not
  de-duplication. See `SHARED_VOCABULARY_KINDS`.
- **Rules:** `vocabularyWords` is public-read and `allow write: if false`. A
  client write would let one villager restyle a word's spelling for every pueblo.
- **Backfill:** none — the index shipped before any village had recorded a word.
  If it ever drifts, it rebuilds by re-writing the `vocabularyTerms` entries.
- **Delete behavior:** the last active entry going away deletes the word row. A
  stale row would offer villagers a word no pueblo actually has.

### `definitionCount` ← `vocabularyDefinitions/`

Every vocabulary term carries a running count of the active definitions
pointing at it. Unlike the other counters here it is **not** cosmetic:
`firestore.rules` reads it to decide whether the author of a headword may still
withdraw it, so an incorrect value is a security fact, not a display glitch.

- **Source of truth:** the top-level `vocabularyDefinitions/` collection,
  filtered to `termId == {termId}` and `status == 'active'`.
- **Trigger:** [functions/src/vocabulary/syncVocabularyDefinitionCount.ts](../../functions/src/vocabulary/syncVocabularyDefinitionCount.ts)
  — `syncVocabularyDefinitionCount`, an `onDocumentWritten` on
  `vocabularyDefinitions/`. Hiding and unhiding count as leaving and rejoining:
  a hidden meaning is not visible to the pueblo, so it must not hold an
  otherwise-empty headword hostage.
- **Rules:** `vocabularyTerms` is `allow update: if false` for clients
  outright, so the trigger (admin SDK) is the only writer. The create rule
  requires the field present and zeroed.
- **Backfill:** none — the collection is new, so there is no pre-existing data
  to reconcile.
- **Delete behavior:** a term deleted out from under an in-flight trigger is a
  no-op (`isNotFound` guard), not a retry loop.

### `replyCount` ← `comments/`

Every top-level comment carries a running count of its replies (comments with that doc's id as their `parentCommentId`), so the UI can show a "View N replies" toggle without fetching replies on list render.

- **Source of truth:** the generic top-level `comments/` collection, filtering to docs where `parentCommentId == {parentCommentId}` (the replies to one parent).
- **Trigger:** [functions/src/interaction/syncEntityInteractionCounts.ts](../../functions/src/interaction/syncEntityInteractionCounts.ts)
  — `syncEntityCommentCount`, an `onDocumentWritten` on `comments/`. When the comment is a reply (`parentCommentId != null`), increments/decrements the parent comment's `replyCount` using `FieldValue.increment` (not a full recompute, same as entity-level comment counts).
- **Rules:** `firestore.rules` excludes `replyCount` from client-writable update fields on comment docs; only the trigger (admin SDK) can change it. Create rules require the field present and zeroed on all comments.
- **Backfill:** [scripts/backfill-comment-threading.mjs](../../scripts/backfill-comment-threading.mjs)
  adds `replyCount: 0` to top-level comments and `parentCommentId: null` to all comments missing the field.
- **Delete behavior:** deleting a comment (reply or otherwise) fires the trigger; if it was a reply, the parent's `replyCount` is decremented. Deleting a parent comment cascades its replies, so `replyCount` zeroes along with the parent.

### `readCount` ← incremented directly by a callable (no source collection)

Every entity kind also carries an invisible `readCount`, tracking detail-screen
views. Unlike every other row in this doc, there is no source-of-truth
collection to project from — the mobile app fires a fire-and-forget
`recordEntityView({ entityKind, entityId, municipalityId })` once per detail
screen mount, and the callable increments the field directly. There is no
reactions/likes feature — it was removed in favor of this invisible counter.

- **Write path:** [functions/src/interaction/recordEntityView.ts](../../functions/src/interaction/recordEntityView.ts)
  (`recordEntityView` callable) calls the same `applyToParent` helper
  `syncEntityCommentCount` uses, so both counters route through one
  entity-kind switch.
- **Rules:** `firestore.rules` excludes `readCount` from client-writable
  update fields, same as `commentCount`; only the callable (admin SDK) can
  change it. Create rules require the field present and zeroed.
- **Backfill:** [scripts/backfill-entity-readcount.mjs](../../scripts/backfill-entity-readcount.mjs)
  sets `readCount: 0` on existing entity docs missing the field and drops any
  leftover `reactionCounts` field from the old reactions feature.
- **Not surfaced in the UI today** — it's tracked for future use (e.g.
  ranking, moderation signal), not rendered on any card or detail screen.

### `_card` / `_thumb` image renditions ← any uploaded Storage object

Feed cards and section rows render into boxes a few hundred dp wide; the
originals behind them are phone photos. Rather than storing a second URL on
each of the nine image-bearing models (and migrating their strict converters
and projections), the renditions are addressed **by convention**: a sibling
object with the original's basename plus `_card.webp` / `_thumb.webp`.

- **Write path:** [functions/src/images/generateImageVariants.ts](../../functions/src/images/generateImageVariants.ts)
  (`onObjectFinalized`) resizes with sharp and writes both renditions next to
  the original. It skips its own output — without that guard the trigger would
  recurse on every write it makes.
- **Read path:** `variantImageURL` in
  [packages/shared/src/utils/imageVariants.ts](../../packages/shared/src/utils/imageVariants.ts),
  applied inside the `RemoteImage` primitive. A rendition that does not exist
  yet 404s and the component falls back to the original, so the rewrite is safe
  to apply everywhere.
- **Access:** a rendition matches its original — the original's download token
  is copied when it has one (a token bypasses `storage.rules`, so an auth-gated
  person photo needs it), and omitted when the original is served publicly
  through the rules.
- **Delete path:** [functions/src/images/cleanupRemovedImages.ts](../../functions/src/images/cleanupRemovedImages.ts)
  — one `onDocumentWritten` trigger per entity collection (news, events, orgs,
  places, barrios, festival posters, history entries) diffs the image
  references before/after the write and deletes each one no longer referenced,
  original plus both renditions. It only ever deletes objects under the
  entity's **own** upload prefix, so a copied URL or another entity's image is
  never touched. Person/user photos and escudos are out of scope: they live
  under the uploader's prefix, not the doc's, so ownership can't be proven from
  the path (`deleteAccount` removes them by prefix).
- **Backfill:** [scripts/backfill-image-variants.mjs](../../scripts/backfill-image-variants.mjs)
  for images uploaded before the trigger existed, and
  [scripts/backfill-image-cache-control.mjs](../../scripts/backfill-image-cache-control.mjs)
  for the immutable cache header. Deliberately **not** `autoApply` — it
  re-encodes every stored image, which is minutes of work and real egress, so
  it is dispatched per env rather than redone on every deploy.

### `burialCount` ← `persons/{personId}.burialPlace`

Cemetery place cards show how many people have been added to that cemetery
without issuing one `persons` query per place in the village home scroll.

- **Source of truth:** `persons/{personId}.burialPlace`, carrying
  `{ municipalityId, placeId }` for deceased personas assigned to a cemetery.
- **Trigger:** [functions/src/village/syncPlaceBurialCount.ts](../../functions/src/village/syncPlaceBurialCount.ts)
  (`syncPlaceBurialCount`), an `onDocumentWritten` on `persons/`. It diffs the
  before/after burial place and increments/decrements
  `municipalities/{mid}/places/{pid}.burialCount` with
  `FieldValue.increment`.
- **Rules:** `firestore.rules` requires `burialCount: 0` on place create and
  blocks client updates to the field; only the trigger can mutate it.
- **Backfill:** [scripts/backfill-place-burial-count.mjs](../../scripts/backfill-place-burial-count.mjs)
  recalculates existing place counts from `persons/`.

### `memberCount` ← `organizations/{orgId}/members/` and `residentCount` ← `persons/`

Membership-size counters that back **ordering** on the village hub: peñas /
agrupaciones sort by member count, barrios by resident count (both descending,
name as tie-break). They are the reason these are denormalized triggers rather
than the `getCountFromServer` aggregate the "Counters vs. denormalization"
section below would otherwise prescribe — the hub renders *every* org and barrio
in the village, so the old approach fired one count-aggregate query per entity
(an N+1 on a hot path) **and** the counts arrived in a separate async map after
the list order was already fixed, so they couldn't drive ordering at all. Moving
the count onto the list doc removes the fan-out and lets the hub sort in memory
with no extra reads and no visible reshuffle.

- **Source of truth is membership, not a count doc.** `syncOrgMemberCount`
  ([functions/src/organizations/syncOrgMemberCount.ts](../../functions/src/organizations/syncOrgMemberCount.ts))
  watches `organizations/{orgId}/members/{userId}` and applies ±1 on
  create/delete (role changes are a no-op). `syncBarrioResidentCount`
  ([functions/src/village/syncBarrioResidentCount.ts](../../functions/src/village/syncBarrioResidentCount.ts))
  watches `persons/{personId}` and diffs the `municipalityLinks` barrio set,
  applying ±1 to each barrio a person gains or loses (whole-village links with
  `barrioId: null` count toward no barrio). Both use the field-path
  `.update(field, increment)` overload (no converter) and swallow `NOT_FOUND`
  so a parent deleted mid-cascade doesn't retry forever.
- **Rules:** `firestore.rules` forbids clients writing `memberCount` /
  `residentCount` on update and requires them zeroed at create — function-owned,
  same as the comment/read counters.
- **Backfill:** [scripts/backfill-org-member-count.mjs](../../scripts/backfill-org-member-count.mjs)
  and [scripts/backfill-barrio-resident-count.mjs](../../scripts/backfill-barrio-resident-count.mjs)
  recompute the true count from the source and write it; they double as repair
  tools if a trigger ever drifts.

### `villageSlug` ← `municipalities/{id}.slug`

Every URL starts with its pueblo (`/matabuena/evento/…`), and a feed card has to
build its href synchronously, from the doc it already holds. So the top-level
entities — `events`, `news`, `organizations`, `festivalPosters`,
`historyEntries` — carry a copy of their municipality's `slug`. See
[docs/decisions/spanish-village-urls.md](../decisions/spanish-village-urls.md).

- **No sync trigger, on purpose.** A slug is a permalink: it is assigned once
  and never changes, not even on a municipality rename. There is nothing to
  propagate, so there is no trigger to keep in step.
- **Written at create, by the service.** `createEvent`, `createNewsPost`,
  `requestOrganization`, `createFestivalPoster` and `createHistoryEntry` look the
  slug up (`getVillageSlug`, cached per session) and stamp it; callers never
  pass it. The `requestAyuntamiento` callable does the same server-side.
- **Rules:** `villageSlug` must be a string on create and is immutable on
  update. It is not cross-checked against the municipality — a wrong value is
  cosmetic (screens load by id, and the share-preview server 301s to the
  canonical path), and checking would add a `get()` to every create.
- **Backfill:** [scripts/backfill-municipality-slug.mjs](../../scripts/backfill-municipality-slug.mjs)
  assigns the slugs, then [scripts/backfill-village-slug-denorm.mjs](../../scripts/backfill-village-slug-denorm.mjs)
  (which `dependsOn` it) copies them onto the entities. Both are registered,
  `pre-deploy`, and `autoApply` on every env.

### `community.organizerSex` ← the Embajador's `persons/{personId}.sex`

The pueblo's Embajador title is gendered — "Embajador" or "Embajadora" — and
every viewer, including the anonymous web reader, has to be able to say which.
The Embajador's person doc is often private, so the municipality carries a copy
of that one person's `sex` next to the pointer it describes
(`community.organizerId`). See
[docs/decisions/embajador-title.md](../decisions/embajador-title.md).

- **Why not on `users/{uid}`:** the user doc is public, so that copy would expose
  every user's sex. On the municipality it exposes only the one person whose
  public title reveals it anyway.
- **Writers:** the functions that move the pointer —
  `respondToOrganizerRequest` (approval) and `transferVillageAmbassador` (hand-over)
  read the new Embajador's person in the same transaction; `deleteAccount` nulls
  both fields together.
- **Trigger:** [functions/src/users/syncPersonDenormalization.ts](../../functions/src/users/syncPersonDenormalization.ts)
  re-projects it onto every municipality whose `community.organizerId` is the
  user when their person's `sex` changes.
- **Rules:** diff-locked with the pointer in `organizerIdUnchanged`
  (`firestore.rules`) — a village admin may edit the community but not either
  field.
- **Backfill:** [scripts/backfill-community-organizer-sex.mjs](../../scripts/backfill-community-organizer-sex.mjs)
  — registered, `pre-deploy`, `autoApply` on every env, and doubles as the repair
  tool if the copy ever drifts.

## Adding a new denormalized field — checklist

1. Add the field to the **read-model document's** data model in `packages/shared/src/models/`.
2. Set it on document creation (in the relevant service's `create*` function) so new documents are correct from day one.
3. Add a trigger in `functions/src/` that watches the **source** document and propagates the field on update.
4. Add a row to the "Denormalized fields" table in [_services-map.md](../../packages/shared/src/services/_services-map.md).
5. Tighten Firestore security rules so clients cannot write the denormalized field directly.
6. Decide what happens on source delete: cascade? null out? leave a tombstone? Implement that in the trigger.
7. If the read model is large and existing documents need backfilling, write a one-shot script under `scripts/` and run it once.

## Counters vs. denormalization

If the field you want to copy is a **count** (attendees, comments, likes), don't write a denormalization trigger — write a counter. Maintain a counter field (incremented in a transaction or by a function on the write trigger), or — for a small, bounded set the app already reads, like a user's unread notifications — count a live listener's rows with `watchCount`. Not an aggregation query (`getCountFromServer`) in the app: a server count cannot answer offline, and the app reads from its on-device cache (see [offline-first-village.md](../plans/ongoing/offline-first-village.md)). Counters and denormalization look similar but the staleness profile is different.

## Failure modes

- **Drift.** The trigger silently fails on one event in a 500-doc batch, and that one event renders with a stale village name forever. Mitigation: every trigger should log structured info (`functions.logger.info({ event, count })`); set up alerting; reseed via a script if drift is detected.
- **Infinite loops.** A trigger writes to a doc that triggers itself. Mitigation: rule (6) — bail on no-op updates; also, never let the trigger touch the source document.
- **Cascading writes.** A new field added without thought turns one write into hundreds. Mitigation: rule (3) — copy only what the read needs.
- **Forgotten triggers.** A new service writes denormalized fields on create, but no trigger updates them. Mitigation: services-map row + trigger live in the same PR.

## Future work

This pattern works at our current scale. If we ever need to denormalize across thousands of villages with frequent source-side updates, we should revisit:
- Switching to event-sourced read models (write all changes to an `events` log, build read models from there).
- Using Cloud Tasks to throttle very wide fan-outs.
- Moving high-churn fields back to a JOIN-style two-read flow and caching on the client.

We are nowhere near needing any of that today.
