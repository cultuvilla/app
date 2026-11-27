# After a deploy, prove every function is healthy, not just present

**Priority:** medium
**Landed:** dev
**Gate:** release:1.14.0
**Next:** on the next beta deploy, confirm the "Parity check — live rules, indexes and functions are this commit's" step is green with no function-health findings, then retire this plan (#772 shipped it; dev green in run 46006747833)

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`).

**Goal:** `check-env-parity.mjs --scope=artifacts` compares exported and deployed
function **names** only. Add Órdago's state checks: each function `ACTIVE`, its
Eventarc trigger present, its Cloud Run revision healthy and on the image the deploy
built.

Source: `~/githubs/ordago-app/ordago-apps` `scripts/verify-deployed-functions.js`, `reconcile-deployed-functions.js`,
`docs/decisions/verify-running-cf-container-image.md`.

## Done when

The post-deploy parity step fails on any of those states, with tests on the parsing, and
`docs/decisions/environment-parity.md` says what it now covers. Coordinate with
`cloud-run-gateways.md`: gateway services are Cloud Run services the check must know.
