# municipalityService: an emulator suite for village search, barrios and places

**Priority:** medium — the service is among the hottest shared files (churn 15, 4 fixes in 90 days), and 16 of its exports, including the village search, are on the untested list

**Landed:** none
**Gate:** none
**Next:** add the emulator suite for municipalityService village search, barrios and places

**Goal:** Test the municipality queries and the barrio/place lifecycle against the Firestore emulator. A wrong field name, filter or write shape in village search or in user-made barrios and places then fails a test, not a phone.

## Context

As of `294fd799` (origin/develop, 2026-11-21):

- `packages/shared/src/services/municipalityService.ts` is 498 lines with 35 exports. Its churn is 15 with 4 fix commits in the 90-day window: `be20b56e` fix(discovery): match village search on any word of the name; `75224991` fix(village): reject invalid fiesta data at the write boundary; `259c9a67` fix: route notifications… through village-first paths; `16b5f08b` fix(shared): type the slug lookup's first doc as optional.
- **The service already has tests, but they mock Firestore.** Four suites under `packages/shared/test/services/` call it against `helpers/fakeFirestore` or `vi.mock`: `municipalitySlug.test.ts` (slug cache, `resolveVillageRoute`), `municipalityPage.test.ts` (`listMunicipalitiesPage` cursor and prefix), `updateCommunityFiestas.test.ts` (fiesta validation from `75224991`) and `municipalityNested.test.ts` (`getBarrio`, `getPlace` only). The fixes that carried logic are covered there. Nothing runs the service against the emulator.
- `packages/shared/test/services/untested-exports.json` (the ratchet in `test/ci/serviceTestCoverage.test.ts`, which may only shrink) lists 16 `municipalityService.ts` exports:
  - search and lookups: `searchMunicipalities`, `getVillagesWhereAmbassador`, `watchMunicipality`, `updateMunicipality`;
  - barrios: `createBarrio`, `newBarrioId`, `updateBarrio`, `deleteBarrio`, `watchBarrio`, `watchBarrios`;
  - places: `createPlace`, `newPlaceId`, `updatePlace`, `deletePlace`, `watchPlace`, `watchPlaces`.
- `searchMunicipalities` backs `VillagePicker` (onboarding `completar-perfil`, the membership and residence editors, the event form), so every new user goes through it. It queries `where('searchPrefixes', 'array-contains', key)` plus `orderBy('nameLower')`, and falls back to plain alphabetical order on an empty key. `be20b56e` moved it from a `nameLower` range scan to this query. The discovery screen (`VillageDiscovery.tsx`) runs the same prefix query through `listMunicipalitiesPage`, which only the `fakeFirestore` suite `municipalityPage.test.ts` covers. The key builders (`municipalitySearchKey`, `municipalitySearchPrefixes`) have unit tests (`test/models/municipality/MunicipalityDataModel.test.ts`, `test/validation/municipalitySearchDrift.test.ts`). The query that joins them to the stored field is tested only through mobile mocks (`MembershipVillageEditor.test.tsx` mocks `searchMunicipalities`; `VillageDiscovery.test.tsx` mocks `@cultuvilla/shared`).
- Barrios and places are user-written content: any village member may create one (`firestore.rules` `match /barrios`, `match /places`, tested in `test/e2e/barrioProposalRules.test.ts` and `placeProposalRules.test.ts`). The service lists the `status == 'active'` ones by `name`, and `getPlaces(kind)` filters by kind in memory. `updateBarrio`, `updatePlace` and `updateMunicipality` write through a bare `doc()` that bypasses the converter, while every read parses through `BarrioDataSchema` / `PlaceDataSchema` / the municipality schema. The service's own comment on `assertValidFiestas` describes the hazard: a patch the read schema rejects makes the doc unreadable for every user. No test round-trips a barrio or place through create → update → read.
- At least 10 mobile screen tests mock the module (barrio, barrio/editar, lugar/editar, mi-pueblo, …). They stay as they are, because they test screens.
- An emulator harness for exactly this already exists: `packages/shared/test/integration/` (README "When to write one": the query's shape matters), `vitest.config.integration.ts`, `helpers/rulesTestEnv.ts`, `factories/villageFactory.ts`. `villageMemberServiceIntegration.test.ts` is the model to copy (seed with rules disabled, `vi.spyOn(firebaseModule, 'getDb')`). It runs in the existing `pnpm test:integration` / `pnpm test` lane.

## Design

Write one new suite, `packages/shared/test/integration/municipalityServiceIntegration.test.ts`, in the README's pattern. Seed through `withSecurityRulesDisabled`, build municipalities with `buildMunicipalityData` so `searchPrefixes` and `nameLower` come from the real builders, and point `getDb` at an authenticated emulator context. Cases (illustrative):

- **Search:** a distinctive word finds a multi-word name ("manzanas" → "Villanueva de las Manzanas"), an accentless query finds an accented name, a co-official alias matches, results come back in `nameLower` order and respect `limit`, an empty or whitespace query returns the first `limit` alphabetically, and a word in no name returns `[]`. One `listMunicipalitiesPage` case runs the same search against the emulator across two pages, since that is the discovery screen's path.
- **Lookups:** `getActiveCommunities` returns only `communityActive` villages, by name. `getVillagesWhereAmbassador` returns the villages whose `community.organizerId` is the user. `watchMunicipality` delivers the doc, then an `updateMunicipality` patch, and the patched doc still parses.
- **Barrios and places lifecycle:** `newBarrioId` → `createBarrio` → `getBarrio`/`getBarrios`/`watchBarrios` see it. A barrio hidden by moderation (`status` no longer `active`) drops out of the list. `updateBarrio` with a partial patch leaves a doc the read converter still parses. `deleteBarrio` removes it and `watchBarrio` emits `null`. Places get the same cases, plus `getPlaces(kind)`.

Then run `node scripts/lib/service-test-coverage.mjs --write` and commit the 16 fewer entries. **Replace, don't layer:** delete `municipalityNested.test.ts`, whose two `getBarrio`/`getPlace` fake-store cases the lifecycle cases subsume. Keep `municipalitySlug`, `municipalityPage` and `updateCommunityFiestas`: they test in-process logic (cache, cursor, validation), where a fake is the right tool.

The suite changes no source file. If a case exposes a real defect, such as a partial `updateBarrio` patch the schema rejects, file the fix as a separate plan (or, where the correct behaviour is not in dispute, a separate fix PR under the defect clause), not inside this one.

Related plan: `ongoing/spanish-settlement-dataset.md` has shipped its code (all tasks checked; it waits only on a prod soak). Barrios now carry `kind` (`barrio` / `pedania` / `parroquia`), `source` and `isSeat`, but `getBarrios` took no `kind` argument: `useVillageHome` splits by kind on the client. A user-created barrio defaults to `kind: 'barrio'` (the only kind a user may create; the others are seeded by `startVillage`), so the suite seeds a `pedania` row with rules disabled and asserts that `getBarrios`/`watchBarrios` return both kinds.

**Alternatives considered:** more `fakeFirestore` unit tests (rejected: the fake returns whatever it is told, so it cannot catch a wrong field name or a write the converter rejects, which are this module's risks); listing the 16 exports as thin wrappers (rejected: search and the bypassing update paths carry real risk); including `feedService` (left out: its one untested export sits in code `ongoing/event-madrid-day-cutoff.md` is rewriting); splitting barrios/places out of the module (a separate refactor, not this unit).

**Testing strategy:** the new integration suite is the boundary test. It removes `municipalityNested.test.ts`, and the ratchet list shrinks by 16 entries.

## Paths

As of 2026-11-21:

- `packages/shared/test/integration/municipalityServiceIntegration.test.ts` (new)
- `packages/shared/test/services/untested-exports.json` (regenerated, 16 entries fewer)
- `packages/shared/test/services/municipalityNested.test.ts` (deleted)
- `packages/shared/test/factories/villageFactory.ts` (only if a barrio/place factory helps)

## Approval

Pre-approved — "test and CI health — flakes, missing coverage, a broken lane". It adds tests to the existing integration lane, changes no source, adds no CI job and changes nothing a user sees.

## Out of scope

- Any change to `municipalityService.ts`, including validating the `updateBarrio`/`updatePlace`/`updateMunicipality` patches. A defect the suite finds gets its own plan or fix.
- `feedService.ts` (`ongoing/event-madrid-day-cutoff.md` owns it) and `personService.ts` (4 untested CRUD exports, churn 2, a separate unit if wanted).
- Splitting barrios and places into their own service.
- The mobile screen tests that mock the module.
