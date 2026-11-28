# Production release plan as a tested script, not inline shell

**Priority:** medium — production-release.yml took 5 fixes within two hours of landing (2026-10-06), four of them to the shell in `plan`/`backend`, and its tests can only check the order of strings in that shell

**Goal:** move the "what ships" decision and the "is the prod backend green, and held?" reading out of `production-release.yml` into a pure, unit-tested `scripts/production-release-plan.mjs`, the shape `auto-promote-main.mjs` and `decideBackendHold` already use, so a wrong store/OTA/Android decision fails a test instead of a release.

## Context
As of `39d69b5a` (2026-11-28):

- **The deploy side is already extracted.** `deploy-firebase.yml`'s release plan calls `scripts/release-announce.mjs plan`, whose judgement is `decideBackendHold` in `scripts/lib/announce.mjs` (15 references in `scripts/__tests__/announce.test.mjs`). What is left there is step gating (`if: steps.release.outputs.hold_backend != 'true'`), pinned by `announceWhenLive.test.ts`, and one-line flag choices such as dd2af8c4 "fix(ci): pick --confirm in the shell, not by interpolation". Nothing in deploy-firebase.yml needs a new script.
- **The release side is not.** `production-release.yml` job `plan`, step "Compare with the previous main tip", is ~100 lines of bash that decide `store`, `android` and `ota`: previous-tip fallback (`github.event.before` all zeros → `HEAD^1`), `[skip-deploy]` / `[skip-store]` / `[skip-ota]` tokens, `STORE_RELEASE_PAUSED` / `PROD_OTA_PAUSED` / `PLAY_SUBMIT_PAUSED`, the `app.config.ts` vs `package.json` version agreement, the CHANGELOG section check, and a `grep -Ev '^(docs/|\.github/)|\.md$'` bundle-path filter. Job `backend` is a further ~50-line poll that parses the Actions API with `jq`, including the held-backend signal (the deploy job's "Deploy Cloud Functions" step concluded `skipped`).
- **Fix history:** 10 commits to the file after 62458abb "ci(release): ship production automatically on the beta -> main merge", 5 of them `fix(release)` commits the same afternoon: e4ea810e "address review on the production release workflow" (skipped deploy counted as green, transient `gh api` failure), ab76c27c "never leave the stores split on an auto release", ce06ece6 "report a Play-frozen production release", eabc6e47 "lock the android output" — these four in `plan`/`backend` — and c2221dae "re-check the Play freeze when the android job starts", a job-level `if:` that stays YAML under this design. Each fix added assertions to `packages/shared/test/ci/productionRelease.test.ts`.
- **Those tests read text, not behaviour.** "honours every kill-switch" asserts `plan.indexOf('"${STORE_RELEASE_PAUSED}" = "true"') < plan.indexOf('echo "store=${store}"')` and ~25 similar substring/order checks. They catch a deleted line, not a wrong branch: no test runs the shell on a single input.
- **The pattern exists.** `scripts/auto-promote-main.mjs` (`decideAutoMerge`, 18 cases in `scripts/__tests__/auto-promote-main.test.mjs`, 22 with `soakHours`/`checkState`): "the workflow gathers the facts with `gh` and this script judges them". `pnpm scripts:test` already runs every `scripts/__tests__/*.test.mjs` in `pnpm test`, which `ci.yml` runs on every PR and in the merge queue.
- **A second test reads this shell.** `announceWhenLive.test.ts` "production-release does not deadlock on a held backend" asserts the backend job's text (`select(.name == "Deploy Cloud Functions")`, `echo "held=${held}" >> "$GITHUB_OUTPUT"`); it moves to `readDeployState` too.

## Design
One module, two pure functions plus a thin CLI (names illustrative):

- `decideProductionRelease({ version, previous, configVersion, hasNotes, commitMessage, vars, changedFiles })` → `{ store, reason, android, androidReason, ota, otaReason, errors, warnings }`. Same precedence as today: `[skip-deploy]` first, then unchanged version, `[skip-store]`, `STORE_RELEASE_PAUSED`; preconditions (`errors`) only when `store`; `android` starts from `store`, then the Play freeze; OTA by bundle paths, `[skip-ota]`, `PROD_OTA_PAUSED`.
- `readDeployState(run, jobs)` → `{ state: 'waiting' | 'green' | 'failed' | 'no-backend', held }`, with the `deploy / ` prefix and the `Deploy Cloud Functions` step name as exported constants.
- CLI `plan`: gathers the facts with git (base sha, `version_of`, `git diff --name-only`, `extractReleaseNotes`), calls the decision, writes `$GITHUB_OUTPUT` and the summary, prints `::error::`/`::warning::`. CLI `wait-backend`: keeps the poll loop, judges each tick with `readDeployState`. Inputs keep arriving through `env:` (the injection check stays satisfied). The `plan` and `backend` jobs run no `pnpm install`, so the module imports only Node built-ins and `scripts/lib/` (as the inline `extractReleaseNotes` call does today).
- The OTA ignore list becomes one exported constant; `otaUpdates.test.ts` "skips the production OTA on exactly the paths beta ignores" compares `mobile-ota.yml`'s `paths-ignore` to it instead of to a grep regex.

The YAML keeps what only YAML can say: triggers, `needs`, job-level `if:` (the Android job's second `PLAY_SUBMIT_PAUSED` read, `play-freeze`), environments, secrets. If `ideas/store-release-pipeline.md` §4 (build on fingerprint change, not version change) is ever built, it changes `decideProductionRelease` and its table, not shell.

**Alternatives considered:** more string assertions on the shell (today's path; each fix adds one and none executes a branch); a composite action (moves the shell, tests nothing); running the bash under a test harness (bats or `bash -c` with fake git) — tests the real text but every case needs a git fixture, while the pure function needs none.

**Testing strategy:** a case table in `scripts/__tests__/production-release-plan.test.mjs`: each skip token and variable alone and combined, `[skip-deploy]` beating everything, unchanged version, zero `before`, version mismatch and missing notes failing only when binaries ship, Play freeze warning only when `store`, docs-only diff, and `readDeployState` on missing run, running, failed, skipped job, held. `productionRelease.test.ts` drops its shell-text assertions ("ships binaries only when the app version changed", "checks store preconditions", most of "honours every kill-switch", the `jq` checks in "ships nothing on a [skip-deploy] merge") and keeps job wiring plus "plan runs the script and declares `store`/`android`/`ota` outputs".

## Paths
- `scripts/production-release-plan.mjs` (new)
- `scripts/__tests__/production-release-plan.test.mjs` (new)
- `.github/workflows/production-release.yml`
- `packages/shared/test/ci/productionRelease.test.ts`
- `packages/shared/test/ci/otaUpdates.test.ts`
- `packages/shared/test/ci/announceWhenLive.test.ts` (its held-backend shell assertions)
- `docs/decisions/production-auto-release.md` (point at the script)

## Approval
Pre-approved — "test and CI health — flakes, missing coverage, a broken lane" and "debt and refactors that change nothing observable": the same inputs ship the same things; only where the decision lives and how it is tested changes. `hardStop` in `.agents/land.config.json` is empty, so it merges to develop on CI green; it first runs on main only through a promotion Álvaro merges, which is why the case table must cover every branch before it lands.

## Out of scope
- `deploy-firebase.yml`: its decision is already `decideBackendHold`; per-target outputs instead of one `hold_backend` were considered and are not worth the churn.
- `beta-build-and-submit.yml`, `mobile-release.yml`: their shell is credential checks and `eas` calls, not decisions.
- Any change to what ships or when (store-release-pipeline §3/§4).
