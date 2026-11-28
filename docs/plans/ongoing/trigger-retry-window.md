# The trigger seam owns the retry window

**Priority:** medium
**Landed:** dev
**Gate:** release:1.14.0
**Next:** once a release carrying #776 is live in prod, confirm no trigger logs a redelivery older than the window, then retire (dev deploy green)

**Pre-approved** under AGENTS.md § Approval — second Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro asked to keep porting in parallel. Verify the gap against the code before building.

**Goal:** `functions/src/shared/define/defineDocumentTrigger.ts` passes `retry` through raw, so a retried trigger is redelivered for up to 7 days; `village/onAmbassadorRequestCreated.ts` hand-rolls its own `RETRY_WINDOW_MS`. Move the bounded window into the seam, one constant, and delete the copy.

Source: ordago-apps `functions/src/shared/define/defineDocumentTrigger.ts` (`TRIGGER_RETRY_WINDOW_MS`), `define/redeliverLater.ts`, tests `documentTriggerRetryBounds.test.ts`, `retryWindowSingleSource.test.ts`; commits 7b9f6a8fb, a2946ab91, 7d8597c61, 00bbc95fc.

## Done when

Every retrying document trigger drops events older than the seam's window, and a test fails on a second copy of the constant.
