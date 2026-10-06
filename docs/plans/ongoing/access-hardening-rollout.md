# Access-hardening rollout

**Priority:** high
**Landed:** dev
**Gate:** blocked:1.6.0 must be live on BOTH stores before `beta → main` (decision 2026-10-06)
**Next:** smoke-test on beta (step 2) while 1.6.0 is in store review

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
3. **Ship 1.6.0 to both stores, then promote `beta → main`.** Decided 2026-10-06 (user): no prod promotion until the 1.6.0 binaries are live on the App Store and Google Play, then update `APP_STORE_VERSIONS`.
4. **In the same release, raise `config/appVersion.minSupported` to `1.6.0`** (Actions → *Set App Version*). Decided 2026-10-06 (user). Why an OTA cannot replace it: every installed binary (iOS 1.2.x–1.5.0, Android 1.1.0–1.5.0) reads `users/{uid}` on `/usuario`, which the new rules deny, and 1.6.0's JS cannot reach them over the air — it adds native modules, so its fingerprint differs and EAS refuses the update to older binaries. The gate refuses a `minSupported` above what the stores serve, which is the other reason the store release comes first.
5. ~~Decide on `minSupported`~~ — decided, see 4.
6. **GitHub alerts:**
   - Close the three secret-scanning alerts for the Firebase Android keys in `apps/mobile/google-services/*/google-services.json`, which are public by design. Optionally restrict the prod key to the Android app first.
   - Triage the Dependabot backlog, runtime dependencies first. Functions runtime critical/high done in #473 (2026-10-06); 8 moderate remain behind a firebase-admin 14 major; the pnpm lockfile (mostly build tooling) is next.
7. When 1–6 are done, distil anything durable into `docs/decisions/` and delete this plan.

## Handoff

- The legacy `organizationJoinRequests` collection is unrelated to the new `organizations/{orgId}/joinRequests` subcollection and is still slated for removal.
- `check:dev-conformance` warns that `authEmailRateLimits`, `config` and `reactions` are unregistered root collections. That is harmless, but it is worth registering them.
