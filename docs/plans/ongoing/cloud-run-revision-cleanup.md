# Clean up old Cloud Run revisions and Artifact Registry images

**Priority:** high
**Landed:** dev
**Gate:** release:1.14.0
**Next:** after the first prod deploy that carries #775, confirm its "Clean up old Cloud Run revisions" step ran on prod (log shows deletes or 0 deletable), then retire. Prod drained by hand 2026-11-27 (970 deleted, 0 failed, 136 left, 68/68 services Ready); dev's ~14.8k backlog drains 150 per deploy

State 2026-11-27: #758 merged. Beta drained 1,719 → 201. Artifact Registry needs nothing in any env (only gcf-artifacts, already on Firebase's 1-day policy).

**Decided 2026-11-27 (Álvaro):** yes — from the Órdago harvest, all three envs.

**Goal:** every deploy leaves revisions and images behind. Órdago reached 1,529 revisions
holding CPU quota and every deploy failed. Cultuvilla deploys about 80 function exports to
dev, beta and prod on every promotion.

Source: `~/githubs/ordago-app/ordago-apps` `scripts/ops-cleanup-cloudrun-revisions.js`, `scripts/setup-artifact-cleanup.sh`.

## Done when

- Artifact Registry cleanup policies (keep recent N plus what serving revisions use) are
  applied to dev, beta and prod by a script, and recorded in `infra/env-parity.json` so
  the parity check holds them.
- A revision-cleanup step (never a serving revision) runs after each deploy or on a
  schedule; dry run first, counts logged. Prod application is covered by this yes.
