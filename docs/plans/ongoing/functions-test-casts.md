# Burn down the casts in the functions tests

**Priority:** low
**Landed:** none
**Gate:** none
**Next:** add a cast ratchet for functions tests (as packages/shared has), then replace casts with typed fixtures slice by slice

**Pre-approved** under AGENTS.md § Approval (test health, nothing observable changes). Follow-up of the retired typecheck-shared-tests plan (#755, #761, #779 took the shared tests from 105 casts to 7 behind a ratchet).

**Goal:** `functions` tests are already type-checked (`functions/tsconfig.test.json`), but about 124 `as any` / `as unknown as` casts in `functions/src/**/*.test.ts` hide whether a fixture still matches the model. Reuse the shared bridges (`firestoreOf`, the typed SDK fakes) where they fit.

## Done when

A ratchet pins the count in CI and it is down to the unavoidable boundary casts.
