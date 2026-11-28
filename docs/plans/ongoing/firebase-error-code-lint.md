# Firebase error codes are compared only through firebaseErrorCode()

**Priority:** high
**Landed:** dev
**Gate:** none
**Next:** step 3: a fakeModule helper in apps/mobile/test/ and a lint rule against new hand-written service jest.mock factories, existing ones allowlisted behind a ratchet (#788 shipped the fix and the error-code rule, #793 the jest guards)

**Pre-approved** under AGENTS.md § Approval — third Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro: "go to everything, keep going". Verify the gap before building.

**Goal:** `packages/shared/src/services/villageWrappedService.ts:53` compares `code === 'permission-denied'`, which never matches on device (`firestore/permission-denied`), so `getReadableWrapped` throws instead of returning null for a reader opening a draft Wrapped. Fix it and add Órdago's lint rule banning bare code compares in every workspace. Then, in the same worker: Jest focused-test guard for mobile (`jest/no-focused-tests`, `jest/expect-expect`), and the `fakeModule` helper plus a lint rule against new hand-written service mock factories (allowlist the 348 existing ones behind a ratchet).

Source: ordago-apps `packages/shared/eslint/bareFirebaseErrorCode.mjs` + test (7fa4c833e); `apps/ordago-app/eslint.config.mjs` jest rules; `apps/ordago-app/testing/fakeModule.ts`, `moduleFakes.ts`, tripwire test (0e98b7eca).

## Done when

The bug is fixed with a test, the three lint rules are on and pinned in `appLintRules.test.ts`, and the hand-written-factory count is a ratchet.
