# Emulator tests for the read site's untested routes

**Priority:** low — `functions/src/web/data.ts` is hot (17 commits, 5 fixes in a year), but no fix landed on the routes this covers; it closes the last routes nothing renders against Firestore

**Landed:** none
**Gate:** none
**Next:** add functions/src/__tests__/handlers/web/readSiteSections.test.ts covering the six section routes, detail pages and pueblo scoping

**Goal:** every public read-site route renders at least once against the emulator in `readSite.test.ts`'s style: one public doc it must show, plus one hidden doc and one doc from another pueblo it must not show. A wrong field name, status gate or `municipalityId` scope in a loader then fails CI instead of quietly rendering an empty or leaky page.

## Context

As of `39d69b5a` (origin/develop, 2026-11-28).

`functions/src/__tests__/handlers/web/readSite.test.ts` (518 lines, emulator, through `handle`) already covers most of what an anonymous visitor must not get. That includes the private event on its detail page, on the village home, on an org page and in the programa (`events/e2`, `e6`, `f4`). It covers drafts, cancelled events, hidden news, pending orgs, a hidden place, a draft Wrapped and a removed fiesta block. The renderer-only suites (`homePage`, `barrioPage`, `listOrder`, …) cover copy and order.

**Nothing renders these against Firestore:**

- **All six section routes** (`PUBLIC_SECTIONS` in `functions/src/web/routes.ts`: `carteles`, `lugares`, `entidades`, `barrios`, `historia`, `vocabulario`). That is `loadSection` → `listPosters`, `listSub`, `listOrgs`, `listHistory`, `listTerms`, and `sectionPage` (century grouping, empty states). No test requests `/<pueblo>/<section>`.
- **Three detail routes:** `loadPoster` + `posterPage` (`/cartel/`), `loadHistoryEntry` + `historyPage`, and `loadBarrio` + `barrioPage` (`barrioPage.test.ts` calls the renderer only). `loadPlace` is tested only for its 404.
- **Hidden definitions:** `loadDefinitions` filters `status == 'active'`, but the seed has only an active one. No hidden or other-village term is seeded.
- **Cross-pueblo scoping:** every top-level list goes through `byMunicipality`. The shared seed has one pueblo with content. One `/pueblos` case adds `m3` with an event, but only after making `m1` inactive, and asserts nothing about scoping. So a dropped `municipalityId` filter would pass every test.

**What the fixes show breaks:** quiet list mistakes, not leaks. `22d70850` fix(web): list every active pueblo on /pueblos (`loadActiveVillages` kept a stale `limit(60)`). `08f8de72` fix(web): cap an org's event cards. `3c6c8f50` fix(web): order events and print counts with the app's shared rules. `ab90cc9b` (converter-less reads) was a lint exemption. Each fix added its own test to the route it touched. The untested routes are the ones no fix has reached yet. Every query they run has its composite index in `firestore.indexes.json` (checked). The emulator does not enforce indexes, so these tests cannot cover that.

**Overlap:**
- `ongoing/public-visibility-predicate` (Landed: none; open as PR #799, `refactor/public-visibility-predicate`) moves these loaders' status gates onto `isPublicDoc` / `PUBLIC_STATUS` and tests the kind × status matrix as a pure function. It declines per-loader status cases in the handler tests. It does not prove each route calls the predicate. That one-hidden-doc-per-route wiring check is what this plan adds, and it is not that matrix.
- `ongoing/read-site-shared-list-rules` (Landed: dev) owns event order and count copy. Not touched here.
- `ongoing/i18n-count-plural-guard` owns `wrappedPage` copy. Not touched here.

**Dependency category:** local-substitutable (the Firestore emulator the integration config already boots).

## Design

Mechanical; the shape `readSite.test.ts` prescribes. A sibling file, `functions/src/__tests__/handlers/web/readSiteSections.test.ts` (new). It is picked up by `vitest.config.integration.mjs` (`src/__tests__/handlers/**`) and reuses `resetEmulators`, `handle` and `renderDocument` the same way. A new file, because the existing one is already 518 lines. The seed (illustrative):

- pueblo `m1` with, for each kind (poster, place, barrio, org, history entry, term with definitions): one active/approved doc, one hidden/pending doc, and for top-level kinds one active doc in a second active pueblo `m3`. Two history entries in different centuries.
- For each section: 200; the visible title is present; the hidden title and `m3`'s title are absent; `historia` shows both century headings in `sortKey` order. Plus one empty pueblo for the «Todavía no hay…» states.
- For each detail route: the canonical URL renders; a stale slug redirects permanently; the hidden doc 404s. Poster: an untitled cartel is titled «Cartel de fiestas <year>». A hidden definition is absent from `/palabra/`.

**Build order:** `public-visibility-predicate` is already under way as PR #799. Its only change to `readSite.test.ts` is the `e2` fixture (`'private'` → `'organization'`), and it adds no section or detail cases. Land this as its own PR in the new file, ideally before #799 merges: the merge queue then runs these cases against #799's rewrite of the gates. If #799 merges first, these tests still pin the result. Don't fold the cases into #799, which is another agent's open branch.

**Alternatives considered:** unit tests over a faked `Firestore` lose, because the bugs that matter here are query-shape bugs (field names, scopes), and only a real query engine catches them. Extending `readSite.test.ts`'s single seed loses too: one shared seed makes every new case a risk to the existing assertions.

**Testing strategy:** this plan is the tests. No shallow test becomes redundant. `barrioPage.test.ts` keeps its renderer-level count assertions.

## Paths

As of 2026-11-28:

- `functions/src/__tests__/handlers/web/readSiteSections.test.ts` (new)
- `functions/src/web/data.ts`, `functions/src/web/pages.ts` (read only, unless a test exposes a defect; then fix it under `fix-bug`)

## Approval

Pre-approved — "test and CI health — flakes, missing coverage, a broken lane". No code a user reaches changes.

## Out of scope

- The pure visibility/status matrix and the sitemap's event cases (`public-visibility-predicate`).
- Event order and count copy (`read-site-shared-list-rules`), and Wrapped copy (`i18n-count-plural-guard`).
- Index coverage of the read site's queries. All present today, and the emulator cannot check it.
- Whether section and detail routes should answer for a pueblo whose community is inactive. `handler.ts` `case 'section'` and the place/barrio branch of `entity` never check `v.active`, while `villagePage` withholds content and adds `noindex` for an inactive pueblo. The tests pin today's behaviour only for active pueblos. Changing it is a visible web change and needs a product call.
