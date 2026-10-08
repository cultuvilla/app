# Drop the App Engine default account's editor grant

**Priority:** low

## Goal

Remove `roles/editor` from `<project>@appspot.gserviceaccount.com` in prod and
dev, so all three projects match beta, which never had it — and delete the
matching exception from `infra/env-parity.json` in the same change.

## Context

The App Engine default service account gets project-wide `editor` when a
project is created with App Engine. Nothing in Cultuvilla runs as it: Cloud
Functions (gen 2) and their builds run as the Compute Engine default account,
and Cloud Scheduler jobs invoke functions with that account too. A broad grant
to an identity nothing uses is pure attack surface.

The parity gate (`scripts/check-env-parity.mjs`) surfaced it on 2026-10-08:
beta lacks the grant, prod and dev have it, so beta is declared as the
exception for now.

## Approach

1. Confirm nothing authenticates as the account: Cloud Audit Logs
   (`protoPayload.authenticationInfo.principalEmail`) over 30 days in prod and
   dev, plus `gcloud scheduler jobs list` and any App Engine / Cloud Tasks use.
2. Remove the binding on dev, run a dev deploy and the nightly parity check.
3. Remove it on prod (the user's go for that run), then drop the exception.
