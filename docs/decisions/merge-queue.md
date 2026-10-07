# develop merges through a GitHub merge queue

`develop` requires a merge queue. `pr:land` hands each green PR to it, and the
queue runs the full CI gate on that PR stacked on the latest `develop` (and on
every PR queued ahead of it), then merges only a green result. No PR branch is
rebased just to stay current.

## Problem

Parallel agents land many PRs at once, and `pr:land` used to keep each one
current by rebasing it whenever `develop` moved through `sharedBlastRadius`
(`packages/shared/`, root manifests, `firestore.rules`). Measured over 67
merges to `develop` (2026-09-22 → 2026-10-06): 37 moved `packages/shared/`, so
most merges rebased every open PR and re-ran its CI. A 7-PR batch on
2026-09-30, each PR green about 5 minutes after it was pushed, took 1h45 to
land, one PR after another, with single PRs running CI four times.

## Decision

- **A ruleset on `develop`** ([.github/rulesets/develop.json](../../.github/rulesets/develop.json))
  requires the merge queue and two `ci.yml` checks: *Lint, typecheck, unit,
  build* and *Emulator tests*. Settings: merge commits, up to 5 entries built
  in parallel, `ALLGREEN` grouping.
- **`ci.yml` triggers on `merge_group`.** Without it the queue waits for checks
  that never report. [mergeQueue.test.ts](../../packages/shared/test/ci/mergeQueue.test.ts)
  fails if the trigger goes, or if a required check names a job that does not
  exist or that carries an `if:` (a skipped job wedges the queue).
- **`pr:land` detects the queue on the PR** (`isMergeQueueEnabled`). It
  enqueues instead of rebasing or merging, retries once after a removal (a flaky
  emulator lane), and exits `10` on a second removal of the same head.
- **Bypass:** repository admins (direct Docs-mode pushes, `pnpm release:cut`'s
  version bump) and deploy keys. A repo ruleset cannot name GitHub Actions as a
  bypass actor, so `plans-map.yml` pushes the regenerated map with a write
  deploy key (secret `PLANS_MAP_DEPLOY_KEY`) instead of `GITHUB_TOKEN`.

## Why not ordago's local integration check

ordago answers a shared-code move with a local typecheck + unit run on the
merge result, to spare CI minutes. This repo is public, so Actions minutes are
free. Testing in CI costs no local RAM (which `agent:capacity` rations among
workers) and runs the emulator suites before the merge, which ordago's check
does not.

## Trade-offs

- A PR now runs CI twice: once on its branch, once in the queue. That costs
  minutes, which are free here, and not wall-clock time.
- A conflict still needs a rebase by hand.
- The ruleset is applied by `gh api` from the committed JSON, not synced
  automatically. Change both together:
  `gh api -X PUT repos/cultuvilla/app/rulesets/<id> --input .github/rulesets/develop.json`.
