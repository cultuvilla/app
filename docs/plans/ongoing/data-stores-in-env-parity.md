# Declare every data store and its retention in env-parity

**Priority:** low
**Landed:** dev
**Gate:** none
**Next:** grant roles/bigquery.metadataViewer to gha-deployer in dev, beta and prod (Álvaro said go 2026-11-28), record it in infra/env-parity.json, and add BigQuery datasets to the dataStores check

**Pre-approved** under AGENTS.md § Approval — second Órdago harvest run, 2026-11-27 (`_workspace/docs/plans/ideas/harvest-across-repos.md`); Álvaro asked to keep porting in parallel. Verify the gap against the code before building.

**Goal:** env-parity declares PITR but not the backup schedule and its retention, log buckets or BigQuery datasets, so an undeclared store goes unnoticed. Declare them and check them in the existing nightly run.

Source: ordago-apps `scripts/lib/data-stores.js`, `scripts/check-data-stores.js`, `docs/ops/data-store-census.md` (commit 78a5ad265).
