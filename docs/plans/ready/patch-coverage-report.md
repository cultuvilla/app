# Patch coverage on every PR, report-only

**Priority:** medium

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`).

**Goal:** `test:coverage:unit` exists but no CI job runs it. Post diff-only coverage
on each PR as one comment, report-only (no gate yet).

Source: `~/githubs/ordago-app/ordago-apps` `.github/workflows/coverage.yml`, `scripts/merge-coverage.js`,
`scripts/truncate-pr-comment.js`, `docs/decisions/patch-coverage-not-absolute-total.md`.

## Done when

A CI job merges the per-workspace LCOV, comments patch coverage (updated in place, kept
under GitHub's 65,536-character limit) and never fails the PR. It must not slow the
merge-queue gate: run it beside `ci.yml`, not inside its required jobs.
