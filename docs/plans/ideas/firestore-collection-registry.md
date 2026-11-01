# One declaration per Firestore collection

**Priority:** medium — the refs files and the conformance gate are three hand-synced lists that have drifted at least five times in 90 days, and three subcollections are not gated today

**Goal:** Declare each Firestore collection once (path, schema, which SDKs may reach it) and derive `refs/client.ts`, `refs/admin.ts` and the conformance gate's `REGISTRY` from that declaration, so adding a collection is one entry instead of five files, and the gate cannot miss a collection again.

## Context

As of `83d0b039` (2026-10-16), 90-day window:

- `packages/shared/src/firebase/refs/admin.ts` (327 lines, churn 17) and `refs/client.ts` (295 lines, churn 16) changed together 15 times. `scripts/check-dev-conformance.mjs` (churn 14, 4 fix commits) changed with `refs/admin.ts` 8 times. No test is named after either refs file.
- The two refs files differ only at the SDK seam, `collection(db, 'a', id, 'b')` against `db.collection('a').doc(id).collection('b')`, and in which collections each side exposes. Server-only entries appear in admin only: `pushQueue`, `moderationEvents`, `ambassadorLeads`, `publicProfilesCollection`, `userPreferencesCollection` and `settlementSeedDoc` (under `_admin`). The client has `joinRequestsGroup` (a collection group) and `NOTIFICATION_PREFS_DOC_ID`. Every path string, every converter pairing and the derived ids (`censoAnswersId`, `` `${municipalityId}_${personId}` ``) are written twice.
- The conformance `REGISTRY` is a third, hand-written copy. Its header says "Keep this registry in sync with refs/admin.ts". The copies have drifted:
  - `c7889600` chore(scripts): register municipalityPeople in the conformance registry
  - `d9aaf8bd` fix(wrapped): fit the Wrapped into develop's notification categories and conformance gate (registered `villageWrapped` late)
  - `21a01780` fix(comments): dedupe conformance festivalPosters entry (a rebase duplicated the entry)
  - `bb316c05` feat(vocabulary): credit who digitalized each word and meaning. This added `packages/shared/test/ci/conformanceRegistry.test.ts`, which regex-matches `export const (\w+Collection) = \(db: Firestore\) =>` in `refs/admin.ts` against `coll: \(db\) => …` strings in the script, because `vocabularyTerms`/`vocabularyDefinitions` shipped unregistered.
  - `c97bb6f4` test(ci): gate every top-level collection, with no exceptions left. The new guard immediately caught two more: `historyEntries` (shipped unregistered while that PR was open) and `contentReports` (predated the guard).
- **That test checks only top-level collections, and three subcollections are ungated now.** `refs/admin.ts` has converter-attached `eventSeatTokensCollection`, `eventRegistrationEventsCollection` and `userBlockedUsersCollection`. The `REGISTRY` walks only `registrations` under `events` and `notifications`/`devices`/`preferences` under `users`. A schema change to seat tokens, the roster audit log or block lists can reach beta/prod while the gate reports green.
- `28d91f02` fix(censo): move census answers to a private collection and `c32e0245` fix(rules): tighten users read access to owner and app admins each added one collection. Each commit had to touch both refs files, both converter files and the conformance script.
- `.agents/skills/add-firestore-collection/SKILL.md` steps 2, 3 and 11 are this sync done by hand. Its step 2 is also stale: it shows one `<entity>Converter.ts` exporting both halves. The repo actually uses a `*Converter.client.ts` / `*Converter.admin.ts` pair per collection (72 of the 76 files under `packages/shared/src/firebase/converters/`; the rest are `makeConverter.ts`, `walkers.ts` and the two `sdkAdapters`).
- `docs/decisions/firestore-typed-converters.md` (Zod schema as the single source of truth) requires that all access goes through ref factories exposed as the separate subpath exports `@cultuvilla/shared/firebase/refs/{client,admin}`, "so the admin SDK never bundles into mobile and vice versa". About 90 files import the two refs files (63 of them through those package subpaths, the rest by relative path inside `packages/shared`). This plan keeps both constraints.
- Dedup: no plan in `docs/plans/` covers ref generation or the registry. `ideas/github-security-alerts.md` item 4 (register `authEmailRateLimits`, `config`, `reactions`) is adjacent. Once this lands, each of those becomes a table entry.

## Design

**Chosen shape: an SDK-free table, with each side's bindings derived from it and the named exports kept.**

1. **`packages/shared/src/firebase/refs/collections.ts` (new, imports neither SDK).** One entry per collection: path template (parent segments plus the collection id), Zod schema (or `null` for converter-less docs such as `registrationPrivate`), `serverOnly`, an optional doc-id derivation, and conformance hints (`descend` for `municipalities`). Subcollections nest under their parent. The following sketch is illustrative:

   ```ts
   export const COLLECTIONS = {
     events: { path: ['events'], schema: EventDataSchema, subs: {
       registrations:      { schema: RegistrationDataSchema },
       seatTokens:         { schema: SeatTokenDataSchema },
       registrationEvents: { schema: RegistrationEventDataSchema },
       registrationPrivate:{ schema: null },
     }},
     pushQueue: { path: ['pushQueue'], schema: PushQueueDataSchema, serverOnly: true },
     // …
   } as const;
   ```
2. **Per-SDK binders.** Each refs file gets a small `bind(entry)` that returns typed `collection`/`doc` builders over its own SDK. The client side still goes through the `../sdk/firestore` seam, so `sdkParity.test.ts` keeps working. Each binder creates exactly one converter per (schema, SDK). The existing `*Converter.{client,admin}.ts` files become re-exports of that converter, or they are deleted and their few direct importers (`appConfigService`, `orgMemberService`, `registrationService`, `villageMemberService` and converter tests) are moved. Either way, one converter object per schema per SDK survives: the JS SDK's `refEqual` compares `left.converter === right.converter` (`@firebase/firestore` 4.17.0), so two `makeConverter` calls for one schema would be a behaviour change.
3. **The named exports stay.** `refs/client.ts` and `refs/admin.ts` keep every exported name and signature (`export const eventSeatTokenDoc = (db, eventId, token) => …`), now as one-line bodies over the binder. Importers, subpath exports and `check-no-raw-firestore-refs.mjs` stay unchanged. The client file exports nothing it does not export today: `serverOnly` entries get no client factory.
4. **The conformance `REGISTRY` is derived.** `refs/admin.ts` exports a `conformanceTargets` list built from the table: every entry with a schema, subcollections included. `check-dev-conformance.mjs` walks that list instead of its hand-written array. This closes the `seatTokens`/`registrationEvents`/`blockedUsers` gap.
5. **Order of landing.** First run the read-only gate against dev and beta with the three newly walked subcollections. Free investigation, prod reads included, is allowed. If any doc fails to parse, land its registered `pre-deploy` backfill first. The conformanceRegistry test's own comment warns that registering a collection gates promotions on data never walked. The table and refs migration can follow in the same PR or the next one.
6. **Update `add-firestore-collection`.** Steps 2, 3 and 11 collapse into "add one entry to `collections.ts`". Steps 7, 8 and 10 (rules, indexes, rules tests) stay hand-written. Fix the stale single-file converter example.

**Alternatives considered:**
- **A, minimal:** keep both refs files hand-written and derive only the `REGISTRY` from a list exported by `refs/admin.ts`. This removes one of the three lists and the regex test, but leaves the 15× client/admin co-edits and the duplicated path strings.
- **C, codegen:** a script writes `refs/client.ts`/`admin.ts` from the table, with a CI drift check. This adds a generated-file gate and a build step for what TypeScript generics already do in-process.
- **Fully generated exports via mapped types** (`export const { eventsCollection, … } = makeRefs(COLLECTIONS)`): fewer lines, but it hides names from grep and risks the TS2742 declaration-emit problem that `refs/client.ts` already guards against with its `import type {} from 'firebase/firestore'`.

**Testing strategy:** a new `packages/shared/test/firebase/refsTable.test.ts` builds every factory on both sides against unconnected Firestore instances. It asserts that client and admin produce the same `.path` for the same arguments, that every non-`serverOnly` entry has both factories, and that each schema-bearing ref carries the side's single converter. `conformanceRegistry.test.ts` is replaced by an assertion that `conformanceTargets` covers every schema-bearing table entry, subcollections included. The regex over source text goes away. Existing service, converter and `check:no-raw-firestore-refs` tests must pass unchanged. That they do is the evidence that nothing observable moved. Run `pnpm check:dev-conformance` against dev before and after.

## Paths

As of 2026-10-16:

- `packages/shared/src/firebase/refs/collections.ts` (new)
- `packages/shared/src/firebase/refs/client.ts`
- `packages/shared/src/firebase/refs/admin.ts`
- `packages/shared/src/firebase/converters/` (the `*.client.ts`/`*.admin.ts` pairs: re-exports, or removed)
- `packages/shared/src/services/appConfigService.ts`, `orgMemberService.ts`, `registrationService.ts`, `villageMemberService.ts` (only if the converter files are removed)
- `scripts/check-dev-conformance.mjs`
- `scripts/check-no-raw-firestore-refs.mjs` (only if the binder lands outside the two allowed files)
- `packages/shared/test/ci/conformanceRegistry.test.ts`
- `packages/shared/test/firebase/refsTable.test.ts` (new)
- `.agents/skills/add-firestore-collection/SKILL.md`
- `docs/decisions/firestore-typed-converters.md` (one line: the table is where a collection is declared)

## Approval

Pre-approved under two clauses. The first is "debt and refactors that change nothing observable": every exported ref name, path and converter stays the same, and no stored shape or rule changes. The second is "test and CI health — flakes, missing coverage, a broken lane": the gate starts walking three subcollections it skips today. If that walk finds nonconforming beta data, the repair is a dev/beta backfill, which is pre-approved. Any prod run stays with the user, as always. No hard stop applies (`hardStop` is empty).

## Out of scope

- `firestore.rules`. Shape predicates and match blocks stay hand-written, guarded by `rulesShapeContract.test.ts` and `test:rules`.
- `firestore.indexes.json`, and the `firestore-index-hygiene` plan.
- Registering `authEmailRateLimits`, `config` and `reactions`. That is `ideas/github-security-alerts.md` item 4, and each becomes a table entry once this lands.
- Changing any collection path, id scheme, schema or converter strictness.
