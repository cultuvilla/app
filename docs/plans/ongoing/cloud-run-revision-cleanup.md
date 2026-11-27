# Clean up old Cloud Run revisions and Artifact Registry images

**Priority:** high
**Landed:** none
**Gate:** none
**Next:** being built by worker in batch 2026-11-27-harvest (leader session orda-to-cultu)

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
