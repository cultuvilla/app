# Coverage is reported on the patch, never as an absolute total

**Decided 2026-11-27 (Álvaro)**, ported from Órdago, where the same pipeline has run since 2026-09.

## Context

Every workspace could already emit LCOV (`pnpm test:coverage:unit`: Vitest v8 in
`packages/shared`, `packages/i18n` and `functions`, Jest's v8 provider in `apps/mobile`),
but no CI job ran it, so nobody saw whether a PR's new code was tested. The usual
answer, a threshold on total coverage, either blocks every PR on legacy code that was
never tested or forces a low-value backfill of it.

## Decision

[coverage.yml](../../.github/workflows/coverage.yml) runs each workspace's unit coverage
on every PR into `develop`, merges the LCOV into one repo-root-relative file
([merge-coverage.mjs](../../scripts/merge-coverage.mjs)), runs `diff-cover` against the
base branch, and posts **patch coverage** (the changed lines that ran under a test) as one
PR comment, updated in place. The whole-codebase number is shown folded, for context only.

- **Report-only.** It never fails the PR: every test, merge and diff step continues on
  error, and diff-cover runs with `--fail-under=0`. A gate, when wanted, is
  `--fail-under=<n>` on the diff — never on the total, which then ratchets up as code is
  touched.
- **Beside `ci.yml`, not in it.** The merge queue waits on `ci.yml`'s required jobs; a
  coverage step there would slow every merge for a report nothing gates on.
- **Under GitHub's 65,536-character comment limit.** A comment over it is rejected and
  fails the post; a large diff is exactly when the per-file table is longest, so
  [truncate-pr-comment.mjs](../../scripts/truncate-pr-comment.mjs) cuts it (header and
  summary first) and the full report stays in the run's `coverage-html` artifact. Órdago
  learned this when a 1,429-file release PR went red on the comment alone.
- **Self-contained.** diff-cover (pinned, via `pipx`), the Istanbul HTML reports and the
  sticky-comment action all run inside the GitHub runner; no coverage service, no data
  leaves GitHub.

Unit suites only: code reached only by the emulator-backed suites reads as uncovered.
That understates services and handlers, and is the price of a cheap job; the emulator
suites' own coverage configs (`test:coverage:all`) exist when that is worth paying for.

## Rejected

- **A threshold on the total** — blocks PRs on pre-existing debt.
- **A SaaS (Codecov and the like)** — a new external service, and the data leaves GitHub.
- **Coverage inside `ci.yml`'s jobs** — slows the merge queue's required checks.

## Revisit when

Patch coverage has been read on enough PRs to trust a number to gate on, or the emulator
suites' coverage becomes cheap enough to merge in.
