# Rules coverage ratchet: every allow statement is seen to allow and to deny

**Priority:** medium — `firestore.rules` is the repo's top hotspot (67 commits and 13 fixes in a year). The suite is thorough, but nothing stops a new `allow` from shipping untested, and 13 do today.

**Goal:** `pnpm test:rules` (and CI's `pnpm test`) reads the Firestore emulator's own rule coverage report and fails when an `allow` condition has never been checked both ways (granting and refusing) and is not on a shrink-only list. A new match block then ships with both an allow test and a deny test, or with a reason it can't have them.

## Context
As of `39d69b5a` (2026-11-28):
- `firestore.rules` has 2790 lines, 76 `match` blocks, 217 `allow` lines and 133 functions. It is tested by 50 `packages/shared/test/e2e/*Rules.test.ts` files (1082 tests, about 61 s). Every file mounts the rules through `useRulesTestEnv` in `packages/shared/test/helpers/rulesTestEnv.ts`. Nothing in the repo reads the emulator's rule coverage: no match for `ruleCoverage` outside `node_modules`.
- **Where the report lives.** Firebase's "Test rules with the emulator" page documents `GET /emulator/v1/projects/<id>:ruleCoverage` (JSON) and `…:ruleCoverage.html`. The JSON lists every expression with its source line and each value it returned, with counts. Unevaluated expressions are listed with no values.
- **Measured here, not assumed.** A scratch probe against the emulator showed that loading the rules again (`initializeTestEnvironment`, once per test file) **resets the report to zero**. `clearFirestore()` and `cleanup()` do not reset it. So fetching the report once after `pnpm test:rules` would show only the last file. You have to collect it per file.
- **Measured coverage.** I ran a scratch vitest config with an extra `afterAll` that saved each file's report (49 files; storage excluded), then merged the reports:
  - 7292 of 7336 expressions were evaluated (99.4%), and all 133 functions ran at least once.
  - 280 of 287 top-level conditions were evaluated. 248 of them returned both true and false.
  - **Never evaluated (7):** `admins/{userId}` read; `users/{userId}/notifications/{notifId}` read and update; `municipalities/{id}` delete; `municipalities/{id}/members/{userId}` delete; `organizations/{orgId}/socioPersonaLocks/{personId}` read; `persons/{personId}` delete.
  - **Never refused in a test (6):** `vocabularyTerms` read; `vocabularyDefinitions` read; `organizations/{orgId}/members/{userId}` delete; `socioPersonaLocks` create; `organizations/{orgId}/joinRequests/{userId}` delete; `{path=**}/joinRequests` list.
  - Shape helpers that never returned false: `isStringOrNull`, `isList`, `isMap`, `isMapOrNull`, `isValidPartialDate`, `isPeriodKey`, `isValidCuotaAssignment`, `isValidEntityKind`. No test rejects a malformed value through them.
- **Matching collection names to test files is misleading.** A grep finds a test file for every collection name. `notifications` "matches" only through `users/${uid}/preferences/notifications` in `pushRules.test.ts`, and no test deletes a `persons` doc. The emulator's report is the only accurate measure.
- Fixes that changed rules: `7a6c4ffe` fix(events): keep a series day's stored visibility on edit; tighten the root check. `8ddfe55b` fix(cosateca): freeze kind, keep requesters off their own requests, guard asking. `197432ad` fix(moderation): all villages' reports for app admins; no resolving your own. Each one added the missing rules test after the fact. `27985e6e` fix(rules): keep createdByName to the cosas create rule undid a find-and-replace across three create rules.
- **This repo already uses this kind of ratchet:** `docs/decisions/e2e-feature-coverage.md` (`e2eCoverage.test.ts` and `apps/mobile/e2e/native/uncovered.json`: the list may only shrink, and each entry needs a reason). `docs/decisions/patch-coverage-not-absolute-total.md` rejects a threshold on *total* coverage. This plan sets no percentage. It works per statement, the same way as the e2e ratchet.

## Design
1. **Collect.** `useRulesTestEnv`'s `afterAll` fetches `:ruleCoverage` before `cleanup()` whenever `RULES_COVERAGE_DIR` is set. It reduces the report to `{line, sawTrue, sawFalse, evaluated}` for each top-level condition and writes one small JSON file per test file. (The raw report is about 2 MB per file.) All 50 files already go through this harness, so no test file changes.
2. **Check.** `scripts/check-rules-coverage.mjs` (new; logic in `scripts/lib/rules-coverage.mjs`) merges the per-file results. It maps each condition's line to a stable key, the enclosing match path plus the `allow` operations, for example `/persons/{personId} delete` (never a line number). It then compares the merged result with `packages/shared/test/e2e/rules-uncovered.json` (new). The check fails if:
   - a condition is seen only one way, or not at all, and is not listed;
   - a listed entry is now covered both ways (the list may only shrink);
   - a listed key no longer exists in the rules.
   Each entry gives a reason, for example `never-false: <why the condition cannot refuse>`. The constant `if false` and `if true` conditions are exempt.
3. **Wire.** Chain the check after vitest in `@cultuvilla/shared`'s `test:rules` and `test:all`, with the directory set. It runs inside the existing `emulator-tests` job: no new CI job and no new external service.
4. **First PR.** Write the 13 missing tests listed above, and list in the JSON only the conditions that genuinely cannot be checked both ways. Extending the check to the shape helpers that never return false is optional. It uses the same data and is worth it if those helpers stay few.

**Alternatives considered:** fetching the report once after the suite fails, because each rules reload resets it (measured). Loading the rules once per run would change every test file's lifecycle for no gain. A percentage threshold is rejected by the patch-coverage decision, and 99.4% would hide exactly the 13 gaps. Static matching of collection names against test files gives false positives (the `notifications` case above). A report-only HTML artifact is never read; a ratchet is what makes the next match block come with its tests.
**Testing strategy:** `packages/shared/test/ci/rulesCoverage.test.ts` (new, unit) feeds `scripts/lib/rules-coverage.mjs` a small fake rules file and fake reports, and checks three things: keys by match path and operation, failure on a gap that is not listed, and failure on a stale entry. The 13 new rules tests go into their existing `*Rules.test.ts` files.

## Paths
- `packages/shared/test/helpers/rulesTestEnv.ts`
- `scripts/check-rules-coverage.mjs` (new), `scripts/lib/rules-coverage.mjs` (new)
- `packages/shared/test/e2e/rules-uncovered.json` (new)
- `packages/shared/test/ci/rulesCoverage.test.ts` (new)
- `packages/shared/package.json` (`test:rules`, `test:all`)
- `packages/shared/test/e2e/` (`usersRules`, `villageRules`, `villageMemberRules`, `socioRules`, `personRules`, `vocabularyRules`, `orgMemberRules`, `orgJoinPolicyRules` tests)
- `.agents/skills/add-firestore-collection/SKILL.md` (its rules-test step points at the ratchet)

## Approval
Pre-approved under "test and CI health — flakes, missing coverage, a broken lane". It adds tests and a check inside the existing `emulator-tests` job. It changes no rule, stored shape or user-visible behaviour, and it adds no CI job (not "running cost"). No hard stop applies.

## Out of scope
- Splitting or restructuring `firestore.rules`.
- `storage.rules` coverage. The Storage emulator documents no equivalent report.
- Changing any rule a gap test exposes. A wrong rule found this way is fixed in its own `fix(rules)` change.
- Overlap with `ongoing/firestore-collection-registry.md`, which keeps rules hand-written (its Out of scope section), and with `ongoing/shared-entity-capability-policy.md`, which compares the client predicate with the rules for edit and delete. This plan measures the rules suite itself, and that plan's `contentPolicyParity.test.ts` feeds into it.
