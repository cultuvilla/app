# One public-read predicate for the Admin-SDK readers

**Priority:** medium — privacy is re-decided by hand in ten places that bypass firestore.rules; they agree today only because the rules forbid the shapes where they differ, and one copy (the sitemap's status gate) is already wrong

**Landed:** dev
**Gate:** none
**Next:** switch the sitemap event gate to the shared predicate's completed-event rule (Álvaro said go 2026-11-28)

**Goal:** give the server's anonymous readers (read site, sitemap, village broadcasts, Wrapped) one pure, raw-data answer to "may an anonymous visitor see this doc?" in `packages/shared/src/policy/`, checked against the `events` read rule in the emulator, so the next reader cannot forget or misspell it.

## Context

As of `294fd799` (origin/develop, 2026-11-21).

The Admin SDK bypasses `firestore.rules`, so every server reader of public content re-applies the rules by hand. The header of `functions/src/web/data.ts` says so: each loader "re-applies the visibility the app's rules and screens apply — `status`, private events, approved orgs".

**"Is this event private?" is written ten times, three ways:**

- `firestore.rules` `canReadEvent`: `visibilityOrgId != null`. This is the authority. Its comment: "The org pointer, not the enum, is the gate — a doc claiming to be private with no org named fails closed everywhere."
- Pointer only, like the rules: `functions/src/seo/sitemap.ts` `collectUrls` (`doc.get('visibilityOrgId')`), `functions/src/village/entityPublishedTriggers.ts` `onEventPublished` (`typeof … === 'string'`), `packages/shared/src/utils/urls.ts` `eventLinkTarget` (truthiness).
- Pointer or a value that cannot exist: `functions/src/web/data.ts` `toEvent` checks `d['visibility'] === 'private' || visibilityOrgId`. `EventVisibilitySchema` is `['public', 'organization']`, and the rules' create/update validation requires `d.visibility in ['public', 'organization']` with `(d.visibility == 'organization') == (d.visibilityOrgId != null)`. The `'private'` branch is dead. The fixture in `functions/src/__tests__/handlers/web/readSite.test.ts` seeds `visibility: 'private'`, a shape the rules refuse.
- Enum and pointer: `packages/shared/src/models/event/EventDataModel.ts` `isPrivateEvent` returns `visibility === 'organization' && visibilityOrgId !== null`. Its own doc comment says it "Reads `visibilityOrgId`, not the enum", and that treating a mismatched doc as public "would be the only failure mode worse than hiding it". The code does the opposite: a doc with a pointer and `visibility: 'public'` counts as public. `canViewEvent`, `assertMayJoinEvent` (`functions/src/helpers/privateEventAccess.ts`) and `functions/src/wrapped/gatherInputs.ts` (which first coerces the enum by hand) inherit that.
- Enum only, in queries: `data.ts` `listEvents`, `loadFiestaProgramme` and `loadOrgEventCards`, plus `functions/src/village/refreshVillageRanking.ts`, filter `where('visibility', '==', 'public')`. `packages/shared/src/wrapped/fiestaMovement.ts` checks `e.visibility === 'public'`.
- `functions/src/web/handler.ts` (event route) rebuilds a fake pointer, `visibilityOrgId: e.private ? 'private' : null`, only to feed `eventLinkTarget`.

**Is the disagreement live? No.** Every event is created through `buildEventData` (defined in `EventDataModel.ts`, called from `eventService.ts` on the single and series paths), which normalizes the pair: no pointer means `'public'`. The rules refuse any client create or update that does not pair them (event validation and `isValidVisibilityChange`). No Cloud Function writes `visibility` or `visibilityOrgId`. `scripts/backfill-event-visibility.mjs` only fills missing fields with `'public'` / `null`. So no stored event has `visibility == 'private'`, and none has a pointer with `visibility: 'public'`. Nothing is leaking. The copies differ only on shapes the rules forbid. There, the documented behaviour (the rules and `isPrivateEvent`'s comment) is fail closed on the pointer.

**Status gates are copied the same way.** `data.ts` repeats `status === 'active'` (news, places, barrios, posters, history, terms, definitions), `'approved'` (orgs) and `'published'` (Wrapped) in about 15 loaders and list queries. The sitemap repeats news `'active'` and orgs `'approved'`. Events use `VISIBLE_EVENT_STATUSES` (detail: `LISTED_EVENT_STATUSES` + `'cancelled'`) and `LISTED_EVENT_STATUSES` (lists).

**One copy already disagrees.** The sitemap keeps an event only when `status === 'published'`. But `completeExpiredEvents` (`functions/src/events/eventCompletion.ts`, hourly, since before the sitemap existed) flips every event to `'completed'` once its last Madrid day ends. So `EVENT_TAIL_DAYS = 120` and its comment "Past events keep ranking for a while ('fiestas de Matabuena 2026'), but not forever" never apply: an event leaves the sitemap within an hour of ending. The read site keeps serving that event's page (`loadEvent` accepts `completed`). This has been true since the sitemap's first commit, `9e3a090f` (2026-09-10). `sitemap.test.ts` (43 lines) has no event case at all, private or past.

Fix history of this class: `89c66b50` fix(functions): keep org-private events out of the Wrapped. That was an Admin-SDK reader that forgot the check. `26a85e07` fix: never put a private event's title in a URL the app builds. `data.ts` was touched by 17 commits in the window, and it has no named test of its own; `readSite.test.ts` covers it through the handler.

**Dependency category:** in-process (pure predicates over raw data), plus local-substitutable for the parity check (the rules emulator that `pnpm test:rules` already drives).

**Dedup:** `shared-entity-capability-policy` (ongoing, landed on dev) covers who may edit or delete, client side. It created `packages/shared/src/policy/`, and this plan sits beside it. `read-site-shared-list-rules` (ongoing) covers event order and count copy only. It moved `LISTED_EVENT_STATUSES` to shared, and this plan reuses that. `web-is-a-read-site.md` ("Member-only data (private events…) is never rendered on web") and `spanish-village-urls.md` ("A private event's URL never carries its title") set the rules this plan centralizes. Neither forbids this shape. No open PR touches these paths.

## Design

Hybrid of A (one minimal predicate) and B (the common caller trivial). C does not apply: no network boundary is crossed, and the rules are reached only by a test.

`packages/shared/src/policy/publicRead.ts` (new), exported from `@cultuvilla/shared/policy`. It takes **raw** data (`Record<string, unknown>`), never a typed doc. The read site's converter-less reads are deliberate (`functions/src/web/read.ts` header, `ab90cc9b`): one stale doc must not break a page. The signatures are illustrative:

```ts
/** Mirrors `canReadEvent`: the org pointer, not the enum, is the gate. */
export function isOrgPrivateEvent(raw: { visibilityOrgId?: unknown }): boolean;

/** The status each kind is public in: the value the list queries filter on. */
export const PUBLIC_STATUS = {
  news: 'active', place: 'active', barrio: 'active', festivalPoster: 'active',
  historyEntry: 'active', vocabularyTerm: 'active', vocabularyDefinition: 'active',
  organization: 'approved', wrapped: 'published',
} as const;

/** Detail pages: may an anonymous visitor open this doc at all? */
export function isPublicDoc(kind: PublicKind, raw: Raw): boolean;
/** Listings (home, sections, sitemap): should it be listed? Events: listed status and not private. */
export function isPubliclyListed(kind: PublicKind, raw: Raw): boolean;
```

- `isPrivateEvent` (typed, in `EventDataModel.ts`) delegates to `isOrgPrivateEvent`. That makes the code do what its doc comment says. `canViewEvent`, `assertMayJoinEvent` and the Wrapped follow, and `gatherInputs` drops its hand coercion of the enum.
- `data.ts`: `toEvent` uses `isOrgPrivateEvent` (the dead `'private'` branch goes). Each `snap.get('status') !== '…'` becomes `isPublicDoc(kind, d)`. Each list query's `where('status', '==', …)` takes `PUBLIC_STATUS[kind]`, so query shapes and indexes are unchanged.
- `handler.ts` passes the real `visibilityOrgId` through `EventView` (or `eventLinkTarget` takes `private: boolean`) instead of the fake `'private'` pointer.
- `sitemap.ts` and `onEventPublished` call `isPubliclyListed` / `isOrgPrivateEvent`. The sitemap's event gate becomes `LISTED_EVENT_STATUSES`, so a completed event stays listed for the `EVENT_TAIL_DAYS` window its own comment promises. Its URL is still built from `entityPath`, and private events are still skipped, so a title never reaches a URL.
- Queries that pin `visibility == 'public'` stay as they are. The enum is the field the indexes and the `list` rules ride, and the rules keep it paired with the pointer. The module's doc comment says why both fields exist.

**Alternatives considered:**
- Key everything on the enum. It lost because the rules gate on the pointer, and a pointer-only predicate is the one that fails closed.
- A typed `PublicReader` wrapping the Admin SDK, so loaders cannot skip the check. It lost because it would put a converter-like layer over reads that are converter-less on purpose. It would also restructure 880 lines to enforce what one predicate plus a test already gives.
- Leave the copies and fix only the sitemap. It lost because that fixes today's bug and leaves the next reader free to copy whichever of the three variants it finds first.

**Testing strategy:**
- `packages/shared/test/policy/publicRead.test.ts` (new): the kind × status × visibility matrix, including the shapes the rules forbid (pointer with enum `public`, enum `organization` with no pointer, the legacy `'private'` value), which must all fail closed.
- A parity case in `packages/shared/test/e2e/privateEventRules.test.ts`: seed each raw shape with rules disabled, `get` it as an anonymous user and as a non-member, and assert that `assertSucceeds`/`assertFails` matches `!isOrgPrivateEvent(raw)`.
- `functions/src/__tests__/handlers/web/sitemap.test.ts` gains the event cases it lacks: a published event is listed, a completed one inside the tail is listed, one past the tail is not, a private one is not, and no `<loc>` carries a private title.
- `readSite.test.ts` fixtures move from `visibility: 'private'` to the stored shape (`'organization'` + pointer). The handler's private-event assertions stay. Per-loader status cases that the policy matrix now covers are not duplicated in the handler tests.

## Paths

As of 2026-11-21:

- `packages/shared/src/policy/publicRead.ts` (new), `packages/shared/src/policy/index.ts`
- `packages/shared/src/models/event/EventDataModel.ts` (`isPrivateEvent`)
- `packages/shared/src/utils/urls.ts` (`eventLinkTarget`, only if its input changes)
- `functions/src/web/data.ts`, `functions/src/web/handler.ts`
- `functions/src/seo/sitemap.ts`
- `functions/src/village/entityPublishedTriggers.ts`
- `functions/src/wrapped/gatherInputs.ts`
- `packages/shared/test/policy/publicRead.test.ts` (new), `packages/shared/test/e2e/privateEventRules.test.ts`
- `functions/src/__tests__/handlers/web/sitemap.test.ts`, `functions/src/__tests__/handlers/web/readSite.test.ts`

## Approval

Pre-approved — "consolidating duplicates into one source of truth — where the copies disagree, only if the surviving behaviour is the documented or tested one". On every stored shape the copies agree. Where they differ (shapes the rules refuse), the survivor is the pointer gate that the rules and `isPrivateEvent`'s own comment document. The sitemap's completed-event gate is covered by "fixing a defect whose correct behaviour is not in dispute — … code that breaks its own docs". `EVENT_TAIL_DAYS` and its comment state the intended behaviour. The page is already served to anyone who opens it, so a reader is shown nothing new. No hard stop applies (`hardStop` is empty). The two halves stand alone: if the sitemap's completed-event gate is ever read as a product change (more past-event URLs handed to search engines), the predicate consolidation lands without it, keeping the sitemap's current `'published'` gate.

## Out of scope

- Any change to who may see what. No predicate here hides or shows a stored doc differently, except completed events returning to the sitemap.
- Client-side visibility: `canViewEvent`'s viewer logic, and `eventService`'s list queries and their `publicOnly` pinning.
- Retiring the `visibility` enum, or any stored-shape change.
- Members-only readers that are not anonymous (group avisos, `getGroupTransparency`), and edit/delete capability (`shared-entity-capability-policy`).
- Event order and count copy (`read-site-shared-list-rules`).
