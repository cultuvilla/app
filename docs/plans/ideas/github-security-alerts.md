# GitHub security alerts and leftover access cleanup

**Priority:** medium

**Goal:** a GitHub security tab with no stale alerts, so a real one stands out.

## Context

This is what was left of the access-hardening rollout (#436–#442) when it
retired on 2026-10-08. The rollout itself is done: prod serves 1.7.1, and
`config/appVersion.minSupported` is 1.7.1 on both platforms. Secret scanning,
push protection and Dependabot were switched on during that rollout. Since then
they have built up alerts that nobody has triaged.

## Design / approach

1. **Secret scanning:** close the three alerts for the Firebase Android API keys
   in `apps/mobile/google-services/*/google-services.json`. Those keys are public
   by design. Optionally, restrict the prod key to the Android app first.
2. **Dependabot:** triage runtime dependencies first. The functions runtime
   critical and high alerts were fixed in #473 (2026-10-06). Eight moderate ones
   remain behind a firebase-admin 14 major upgrade. The pnpm lockfile (mostly
   build tooling) comes next.
3. **Legacy `organizationJoinRequests` data:** the code no longer references
   the old top-level collection. `organizationJoinRequestsCollection` in
   `packages/shared/src/firebase/refs/` is the live
   `organizations/{orgId}/joinRequests` subcollection. Check each env for stale
   top-level docs, and delete any with a registered `cleanup` script.
4. **Register the root collections** `authEmailRateLimits`, `config` and
   `reactions` with `check:dev-conformance`, which warns that they are
   unregistered. The warning is harmless but noisy.

## Open questions

- Restrict the prod Android key before closing its alert, or just close it?
