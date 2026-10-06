# Access-hardening rollout

**Priority:** high
**Landed:** dev
**Gate:** none
**Next:** promote `develop → beta` (a `release/X.Y.Z` branch; the maintainer merges the PR)

**Goal:** get the access-control changes merged on 2026-09-30 (#436–#442) from dev
to production, with no crash for clients that are already installed.

## Done

- #436 users read access narrowed to the owner and app admins; other screens read `publicProfiles/{uid}`, a server-maintained projection.
- #437 user creation bound to the signed-in email; invite tokens no longer listable.
- #438 census answers moved to `censoAnswers/{municipalityId}_{uid}`.
- #439 Storage image writes check authority over the path; persona photos follow `isPublic`.
- #440 organizations can require approval to join (`joinPolicy`); see [org-join-policy.md](../../decisions/org-join-policy.md).
- #441 the retired invite-token flow is removed.
- #442 sign-in email sends are rate-limited per caller IP as well as per email.
- Dev (`villa-events`): conformance PASS, all pre-deploy backfill markers present.
- Storage→Firestore rules access (`roles/firebaserules.firestoreServiceAgent` for the Firebase Rules service agent) granted on dev, beta and prod.
- GitHub secret scanning, push protection, Dependabot alerts and security updates enabled.

## Next steps

1. **Promote `develop → beta`** with the `prepare-release` skill. The deploy auto-applies `public-profiles`, `censo-answers-private` and `org-join-policy` before its gates; nothing needs a manual dispatch.
2. **Smoke-test on beta:**
   - open another user's profile;
   - request to join an approval-only org, then approve the request;
   - save census answers;
   - upload an image to a village, an org and a persona.
3. **Promote `beta → main`.**
4. **Right after the prod deploy, dispatch the production OTA** (`mobile-ota.yml`) from the exact commit the production binaries were built from. Installed binaries still read `users/{uid}` directly on `/usuario`, so that screen fails until the update reaches them. Verify the fingerprint with `fingerprint:compare` before publishing.
5. **Decide on `minSupported`.** Whether to raise `config/appVersion.minSupported` for binaries that the OTA cannot reach, such as the iOS 1.0.0 build that predates `expo-updates`.
6. **GitHub alerts:**
   - Close the three secret-scanning alerts for the Firebase Android keys in `apps/mobile/google-services/*/google-services.json`, which are public by design. Optionally restrict the prod key to the Android app first.
   - Triage the Dependabot backlog, runtime dependencies first.
7. When 1–6 are done, distil anything durable into `docs/decisions/` and delete this plan.

## Handoff

- The legacy `organizationJoinRequests` collection is unrelated to the new `organizations/{orgId}/joinRequests` subcollection and is still slated for removal.
- `check:dev-conformance` warns that `authEmailRateLimits`, `config` and `reactions` are unregistered root collections. That is harmless, but it is worth registering them.
