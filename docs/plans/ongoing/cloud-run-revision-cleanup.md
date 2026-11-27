# Clean up old Cloud Run revisions and Artifact Registry images

**Priority:** high
**Landed:** dev
**Gate:** decision:prod revision drain (970 of 1,106 deletable, dry run 2026-11-27) and the deploy cleanup step on prod — Álvaro's go
**Next:** run `node scripts/cleanup-cloudrun-revisions.mjs --env=prod --apply --confirm --max-deletes=1000 --max-minutes=60` (ADC `~/.config/cultuvilla/adc.json`), then a PR turning the deploy-firebase.yml cleanup step on for prod and updating revisionCleanup.test.ts. Dev drain unfinished (15,009 left): resume with `--env=dev --apply --max-deletes=15000 --max-minutes=600`

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
