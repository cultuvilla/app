# The read site reuses the app's event order and count copy

**Priority:** medium — one live defect (today's events listed as past on the web) and a plural fix being done twice (PR #679) while «1 integrantes» is still live
**Landed:** dev
**Gate:** soak:the first release carrying #691 is live in prod
**Next:** once prod serves #691, check a village page lists today's events as upcoming and a one-member group says «1 integrante», then retire (villageHomeWatchers' LISTED_STATUSES copy is folded in by the offline-first follow-up)

**Goal:** make the read site take its event order and its count/label copy from `packages/shared` and `@cultuvilla/i18n`, so a rule fixed for the app is fixed on the web too.

## Context

As of `129efeb7` (origin/develop, 2026-11-20).

The read site (`functions/src/web/`) shares models and URL builders with the app (`docs/decisions/web-is-a-read-site.md`, decision 2). But it keeps its own copy of two kinds of rule that the app already has in a shared place.

**Event order.** The app orders every event list with `upcomingThenPast` (`packages/shared/src/models/event/EventDataModel.ts`) and then `firstOfEachSeries` (`EventSeriesModel.ts`). `useVillageHome`, `OrgEventsSection`, `GroupEvents`, `grupos.tsx` and `ComposeMessageSheet` all do this. The read site has its own `orderEvents` in `functions/src/web/data.ts`, used by `loadVillageHome` and `loadOrgEventCards`. `docs/decisions/weekly-event-series.md` says `orderEvents` "does the same" as the app's `upcomingThenPast` + `firstOfEachSeries`, and `orderEvents`' own doc comment calls its order "the app's order". They do not:
- The app decides "past" by Madrid calendar day: `isStartDayOver(eventEndBoundary(e), now)`. An event stays upcoming until its day ends.
- `orderEvents` decides "past" by the exact time: `(end ?? start) < now`. A single-day event at 10:00 counts as past on the web from 10:00 the same day. It drops behind every future event, into the most-recent-first tail. So on a fiesta day, today's events are missing from the top of the pueblo page that people open from WhatsApp.
- The listed statuses `['published', 'completed']` are written twice: `LISTED_EVENT_STATUSES` in `data.ts` and `LISTED_STATUSES` in `apps/mobile/lib/useVillageHome.ts`.

**Counts and labels.** `@cultuvilla/i18n` is not used on the server (see the header of `functions/src/wrapped/render/copy.ts`). So the read site writes Spanish copy by hand that mirrors `es.json`:
- `orgCard` (`data.ts`) and `orgPage` (`pages.ts`) print `` `${n} integrantes` ``, which renders «1 integrantes». The catalog already has the correct plural, `organization.membersCount` («1 integrante» / «# integrantes»).
- PR #679 (open) fixes «1 vecinos» twice: with an ICU plural in `es.json` for the app, and with a new hand-written `residentsLabel()` in `data.ts` for the web.
- `pages.ts` copies `NEWS_CATEGORY`, `PLACE_KIND` and `TERM_KIND` from `news.compose.category`, `village.admin.places.kind` and `village.vocabulary.kind`. Its comment says the enum labels "mirror" `es.json`, naming the first two keys (`TERM_KIND`'s source is not named). Today the values agree (checked).
- The one ICU plural formatter lives in the app, in `applyPlurals` (`apps/mobile/lib/i18n.tsx`), so the server cannot use it.

Co-change in the last 90 days: 36 commits touched `functions/src/web/data.ts` or `pages.ts`. Most were landing-page work that only touches the web. The ones that made the same rule change on both sides were `3a17e25e` (comisión listed under Grupos, in `VillageHomeBody.tsx` and `data.ts`), `c9d8e6af` (comisión type, both sides) and `b3a5b2eb` (weekly series: the web got its own `orderEvents` and the app got `firstOfEachSeries`, in the same commit). PR #679 is the next one. The duplication is narrow, not broad. Sections, their order and card subtitles really are different on the two surfaces, and those are product choices.

Dependency category: in-process. These are pure functions, so they need no stand-in.

## Design

Shape A (minimal interface), on both strands:

1. **Event order.** Delete `orderEvents`. `listEvents` and `loadOrgEventCards` map their rows to the shape the shared helpers take (`startDate`, `endDate`, `series: { id } | null`). Then they call `firstOfEachSeries(upcomingThenPast(rows, now))`. Where `firstOfEachSeries` asks for the full `EventSeries` type, loosen its generic bound to `{ series: { id: string } | null }`. Move `['published', 'completed']` to one exported constant next to `upcomingThenPast` (illustrative: `LISTED_EVENT_STATUSES`). `useVillageHome` and `data.ts` both import it.
2. **Copy.** Move `applyPlurals` and the dotted-path lookup out of `apps/mobile/lib/i18n.tsx` into `@cultuvilla/i18n` as one pure function (illustrative: `translate(messages, key, vars?) → string`). `createI18n` keeps its API and calls it. The read site calls `translate(getMessages('es'), …)` for:
   - `organization.membersCount`, in `orgCard` and `orgPage` (fixes «1 integrante»);
   - `village.admin.barrios.residentCount`, which replaces #679's `residentsLabel`;
   - the three mirrored enum maps.

   `ORG_TYPE` stays local, because its `otros` reads «Entidad» on the web and «Otros» in the catalog, and choosing one is a copy decision. `BARRIO_KIND` and `SECTION_TITLE` also stay local, because the catalog has no singular labels for them.

`functions` already depends on `@cultuvilla/shared` and bundles with esbuild. `@cultuvilla/i18n` is a workspace package with a JSON import (~110 KB). It needs a `file:` dependency in `functions/package.json` (like `@cultuvilla/shared`'s `file:../packages/shared`; `functions/` installs with its own `npm ci`), and the bundle has to inline the JSON (esbuild bundles `.json` natively; `packages/i18n/index.ts` imports it `with { type: 'json' }`). Check the bundle size and the cold start once.

**Alternatives considered:**
- B, a shared `villageHomeSections()` that returns the ordered sections both surfaces render. It lost because the two surfaces deliberately show different sections, in a different order, with different subtitles (peñas and agrupaciones are split in the app, barrios are split by kind). Forcing one list would make a product decision.
- Keeping the web copy and fixing «1 integrantes» by hand like #679 did. It lost because it is the pattern that keeps doubling every copy fix.

**Testing strategy:**
- `functions/src/__tests__/web/orderEvents.test.ts` is replaced by one read-site test: a single-day event earlier today still leads the home's event cards. The ordering and series cases are already covered by `packages/shared/test/models/event/EventDataModel.test.ts` and `eventSeries.test.ts`, so they are not duplicated.
- `applyPlurals` gets its unit tests in `packages/i18n/test/`, moved from the mobile adapter's tests, and `catalogCopy.test.ts` keeps passing.
- #679's `barrioPage.test.ts` keeps its 1/4 assertions against the catalog-backed label, and an org card gets the same 1/N check.

## Paths

- `functions/src/web/data.ts`, `functions/src/web/pages.ts`
- `functions/package.json`, `functions/esbuild.shared.mjs` (if the JSON import needs a loader)
- `functions/src/__tests__/web/orderEvents.test.ts` (replaced), `functions/src/__tests__/web/homePage.test.ts`, `functions/src/__tests__/web/barrioPage.test.ts` (from #679)
- `packages/shared/src/models/event/EventDataModel.ts`, `packages/shared/src/models/event/EventSeriesModel.ts`
- `apps/mobile/lib/useVillageHome.ts`
- `packages/i18n/index.ts`, `packages/i18n/test/` (new test file)
- `apps/mobile/lib/i18n.tsx`
- `docs/decisions/weekly-event-series.md` ("What this binds" names `orderEvents`)

## Approval

Pre-approved:
- "fixing a defect whose correct behaviour is not in dispute — a crash, a leak, a wrong result, code that breaks its own docs or tests". Today's events are listed as past on the web, against `weekly-event-series.md`, which says the read site orders like the app. «1 integrantes» is a wrong plural where the catalog already has the right one.
- "consolidating duplicates into one source of truth — where the copies disagree, only if the surviving behaviour is the documented or tested one". Only labels that already agree are moved. The one that disagrees (`ORG_TYPE.otros`) stays out.

## Out of scope

- Whether the web lists barrios by name (today) or by resident count (the app's order). That is a visible change on the web and a product call.
- «Entidad» vs «Otros» for `otros` groups, and «personas» (`village.hub.memberCount`, the app's village home) vs «integrantes» (the web and the org screens) on org cards. These are copy decisions.
- Server copy outside the read site: Wrapped (`functions/src/wrapped/render/copy.ts`) and notification copy. This plan makes them able to use the catalog later, but does not move them.
- Section selection and section order on either surface.
