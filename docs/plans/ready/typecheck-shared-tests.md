# Type-check packages/shared's tests

**Priority:** high

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`).

**Goal:** `tsc` checks the shared tests the way it already checks `functions`'
(`tsc -p tsconfig.test.json`). Today `packages/shared/tsconfig.json` includes only
`src`, so vitest's esbuild strips the tests' types unchecked.

Source: `~/githubs/ordago-app/ordago-apps` `docs/decisions/tsc-gate-the-test-suite.md`, `typed-test-fixtures.md`.

## Done when

- `pnpm typecheck` covers `packages/shared/test` (a test tsconfig, so the published
  build stays `src`-only), with a test that fails if it is dropped.
- The errors it surfaces are fixed, not silenced. The ~221 `as any` / `as unknown as`
  in shared and functions tests go down with typed fixtures; the burn-down may land in
  slices behind a ratchet if it is large.
