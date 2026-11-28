# Burn down the hand-written service mocks in apps/mobile

**Priority:** medium — 341 hand-written `jest.mock('@cultuvilla/shared/services/…', () => ({…}))` factories drift from the real service exports; a renamed export keeps passing in the mock and fails on device

**Landed:** none
**Gate:** none
**Next:** four parallel slices (components/feature A–L, components/feature M–Z, app/**, lib/** + the rest) each move their files to `fakeModule`/`fakeService` and lower `apps/mobile/test/handWrittenServiceFactories.json`

## Context

As of #797 (merged 2026-11-28): `apps/mobile/test/fakeModule.ts` builds a service fake from the real module's exports, the `SERVICE_HAND_WRITTEN_FACTORY` lint rule refuses new factories, and `handWrittenServiceFactories.json` pins the per-file count (341 total), held by `packages/shared/test/eslint/appLintRules.test.ts`. Files by folder: components/feature 61, app/** ~41, lib/** ~25.

## Approval

Pre-approved: "debt and refactors that change nothing observable" and "test and CI health". Tests only; no app source changes. Each slice deletes its entries from the ratchet file; the finish line is an empty file and the allowlist removed.
