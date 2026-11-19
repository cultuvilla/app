# Service export test ratchet

**Priority:** medium — 156 of 400 service exports have no test at all, including write paths with real logic (`updateEvent`'s feed boundary, `saveProfileAnswers`' completion flag), and nothing stops the count growing.
**Landed:** none
**Gate:** none
**Next:** verify the plan against develop, then build it

**Goal:** every export in `packages/shared/src/services/` is exercised by a test or sits on a list that may only shrink. A new service function then ships with its test, and the riskiest untested writes get theirs now.

## Context

As of `129efeb7` (2026-11-20). The file-level picture is almost complete. 50 of the 52 service files (not counting `index.ts`) have a test that imports them for real (`packages/shared/test/services/`, the emulator suites under `packages/shared/test/e2e/`, `functions/src/__tests__/`). The exceptions are `studioService.ts` and `mentionCandidateService.ts`. Mobile and studio tests that name a service `jest.mock` it, or import only a type (`MentionCandidate`), so they do not count.

The gap is per export. A name-level sweep of every `export function|const|class` under `packages/shared/src/services/**` against `packages/shared/test` and `functions/src/__tests__` finds **156 of 400 exports referenced by no test**. Most are thin `watch*` wrappers over a query or one-line callable wrappers. The ones that carry logic or write data:

- `eventService.updateEvent`: converts `Date` to `Timestamp` and recomputes `endBoundary` when `startDate` is patched. Its own comment says "a stale endBoundary would silently hide (or wrongly surface) the event". 4 of its 21 commits in the last 180 days are fixes to which events a feed or list shows (`e42855f5 fix(events): show same-day & ongoing events in the Explora feed`, `107e24fc`, `6c3a350e`, `8d37c2eb`). Also untested: `createEvent` (slug lookup + builder) and `updateEventStatus`, which is how the app cancels an event (`apps/mobile/app/crear/evento.tsx`, local `deleteEvent`).
- `membershipProfileService.saveProfileAnswers`: one batch writes the private `censoAnswers` doc and sets or clears the world-readable `profileCompletedAt`. That is privacy-relevant: only the completion flag may leak to the public member doc. `collectUsedValues` is untested pure logic that feeds `CensoSchemaEditor`'s schema-transition check. The only test in that file covers `answeredCountByKey`.
- `mentionCandidateService.getMentionCandidates`: merges seven sources, drops the article being edited (`excludeNewsId`), and catches each failing source on its own. Read-only, but every rule in it is untested.
- `municipalityService`: 25 of 35 exports are untested. That includes the slug cache (`getMunicipalityBySlug` writes `idBySlug`/`nameBySlug`, `resolveVillageRoute` reads them) behind the village-first URLs, and barrio/place create/update/delete. 4 of its 42 commits in 180 days are fixes.
- `personService` create/update/delete, `organizationService` `rejectOrganization`/`updateOrganization`/`deleteOrganization`, `orgMemberService` `addOrgMember`/`removeOrgMember`: thin writes whose guard is the rules. `test/e2e/*Rules.test.ts` covers those rules with the raw SDK, not through the service.
- `studioService` (4 exports): one-line `httpsCallable` wrappers. The pairing security lives in `functions/src/studio/studioPairing.ts` and is tested by `functions/src/__tests__/handlers/studioPairing.test.ts`. That gap is trivial.

Five untested exports have **no caller anywhere**: `eventService.deleteEvent`, `municipalityService.createMunicipality`, `deleteMunicipality`, `deactivateCommunity`, and `notificationService.createNotification`. Under *Delete > deprecate* they should be deleted, not tested.

Nothing gates any of this today. `packages/shared/vitest.config.ts` collects coverage only on `--coverage` ("there is no threshold gate yet"). The touch-service skill requires a vitest per new export (step 14), but only as a convention. The repo already has the shape of the fix: `packages/shared/test/ci/e2eCoverage.test.ts` is a ratchet in which every testID is either covered or listed in `uncovered.json`, and that list may only shrink.

## Design

**A ratchet on exports, not a coverage threshold.**

1. `scripts/lib/service-test-coverage.mjs` (new) lists every named export under `packages/shared/src/services/**` (excluding `index.ts`). It reports each one no test file references by name. The test roots are `packages/shared/test/**` and `functions/src/__tests__/**`; mobile and studio tests are excluded because they mock services. `--write` rewrites the list.
2. `packages/shared/test/services/untested-exports.json` (new), seeded with today's list and grouped by file. Entries are sorted, so a diff reads cleanly.
3. `packages/shared/test/ci/serviceTestCoverage.test.ts` (new), modelled on `e2eCoverage.test.ts`. It fails when an export is untested and not listed, which means a new export shipped without a test. It also fails when a listed export is now tested or no longer exists, so the list only shrinks. The failure message names the export and the `--write` command.
4. Seed real tests for the exports where a bug would cost the most. Each one comes off the list in the same change:
   - `updateEvent`: `endBoundary` is recomputed when `startDate` is patched and left alone when it isn't; dates are written as `Timestamp`. Use the `fakeFirestore` helper (`packages/shared/test/helpers/fakeFirestore.ts`), which already fakes `updateDoc`, `Timestamp` and `serverTimestamp`.
   - `saveProfileAnswers`: complete answers set `profileCompletedAt`, incomplete ones clear it to `null`, and the answers never land on the member doc. `collectUsedValues` gets pure unit tests. `fakeFirestore` has no `writeBatch`, so add one to the helper (or use the emulator harness).
   - `getMentionCandidates`: the post being edited is excluded, a failing source contributes nothing, and each kind maps to the right label.
   - `getMunicipalityBySlug` / `resolveVillageRoute`: a hit fills the cache, and the second resolve does not read again. The cache is module-level `Map`s with no reset, so each test needs a fresh module (`vi.resetModules()` + dynamic import).
5. Delete the five zero-caller exports, and their `_services-map.md` mentions, rather than listing them.

Illustrative shape of the guard (not final):

```ts
const { untestedExports } = await import('scripts/lib/service-test-coverage.mjs');
const listed = new Set(readJson('untested-exports.json'));
const found = untestedExports();
expect(found.filter((e) => !listed.has(e)), 'new service export without a test').toEqual([]);
expect([...listed].filter((e) => !found.includes(e)), 'now tested or gone; run --write').toEqual([]);
```

**Alternatives considered:**
- *File-level guard* (every service file has a test): the repo already passes it except for two files, so it would catch almost nothing. The gap is per export.
- *v8 coverage threshold*: line coverage is dominated by the many thin wrappers, so any repo-wide percentage is a number nobody can act on. It also needs the emulator suites to be meaningful.
- *Only write the missing tests*: that closes today's gap but leaves nothing to stop it reopening. The ratchet costs about one file.

The name match is a proxy. An export named only inside a `vi.mock` factory, or in a comment, counts as tested. That is acceptable because shared and functions tests mock Firebase, not services. The script should still ignore comment lines.

**Testing strategy:** the ratchet is itself the test. Each seeded test sits at the service boundary against `fakeFirestore` or the emulator harness that service's existing tests already use. None of them duplicates a rules test, which covers the guard and not the payload.

## Paths

- `scripts/lib/service-test-coverage.mjs` (new)
- `packages/shared/test/ci/serviceTestCoverage.test.ts` (new)
- `packages/shared/test/services/untested-exports.json` (new)
- `packages/shared/test/services/eventService.update.test.ts` (new)
- `packages/shared/test/services/membershipProfileService.test.ts`
- `packages/shared/test/services/mentionCandidateService.test.ts` (new)
- `packages/shared/test/services/municipalitySlug.test.ts` (new)
- `packages/shared/test/helpers/fakeFirestore.ts` (add `writeBatch`)
- `packages/shared/src/services/eventService.ts`, `municipalityService.ts`, `notificationService.ts` (dead exports deleted)
- `packages/shared/src/services/_services-map.md`
- `.agents/skills/touch-service/SKILL.md` (step 14: point at the ratchet)

## Approval

Pre-approved: "test and CI health — flakes, missing coverage, a broken lane". The deletion of the five zero-caller exports is covered by "debt and refactors that change nothing observable". No user-visible change, no stored data, no new CI job (the guard runs inside the existing vitest unit lane).

## Out of scope

- Tests for the remaining roughly 140 thin `watch*` and callable wrappers. They stay on the list, to come off whenever someone touches them.
- Lint-gating `apps/mobile`, or counting mobile jest tests (they mock services).
- Any coverage-percentage threshold.
- Rules tests: the `test/e2e/*Rules.test.ts` suites already own the guards.
