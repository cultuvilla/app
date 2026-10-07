# App Check rollout (mobile)

**Priority:** high

## Goal

Attest that Firestore/Storage/Functions traffic comes from a genuine, unmodified
build of the Cultuvilla mobile app — turning on Firebase App Check with
DeviceCheck/App Attest (iOS) and Play Integrity (Android), per environment, via
the existing `initMobileAppCheck()` seam.

> **Supersedes the retired web-era plan.** The original `app-check-rollout` targeted
> `apps/web` (Next.js) with reCAPTCHA Enterprise and `NEXT_PUBLIC_RECAPTCHA_SITE_KEY_*`.
> That app no longer exists (the repo migrated to Expo/React Native) and the
> config-injection refactor removed the site-key hook it edited. Nothing from the
> web plan is salvageable except the intent; this is a ground-up mobile plan. The
> one durable artifact — the no-op `initMobileAppCheck()` seam
> ([apps/mobile/lib/appCheck.ts](../../../apps/mobile/lib/appCheck.ts)) — anchors it.

## Context

- Guest browsing ([docs/decisions/guest-browsing.md](../../decisions/guest-browsing.md))
  opened `persons` (and other feed collections) to unauthenticated reads. App Check
  is the intended lever against scraping/abuse of those open reads — not re-gating.
- The seam is already wired: `bootstrapFirebase()`
  ([apps/mobile/lib/firebaseInit.ts:71](../../../apps/mobile/lib/firebaseInit.ts))
  calls `initMobileAppCheck()`, currently a no-op. This plan fills it in.
- Firebase config is injected per environment by `apps/mobile/app.config.ts` into
  `expoConfig.extra.firebaseConfig` from `FIREBASE_*_<ENV>` vars (dev = `villa-events`,
  beta = `cultuvilla-beta`, prod = `cultuvilla-prod`). App Check config follows the
  same channel — no `NEXT_PUBLIC_*`.
- **Expo has moved to SDK 56** (see [apps/mobile/AGENTS.md](../../../apps/mobile/AGENTS.md)):
  read <https://docs.expo.dev/versions/v56.0.0/> before choosing the package. Do
  not hardcode an API from memory — confirm the current App Check story
  (`@react-native-firebase/app-check` vs. a config-injected `firebase/app-check`
  path that works under Expo) against the live docs at implementation time. Installing
  a native module means a clean prebuild (see the `expo-native-rebuild` skill).

## Design / approach

- **Per-env opt-in via a debug/attestation split.**
  - Dev (`villa-events`): use the **App Check debug provider** so the Expo dev
    client and emulators keep working without real device attestation. Register the
    debug token in the Firebase console for `villa-events`.
  - Beta/prod: real providers — App Attest/DeviceCheck (iOS), Play Integrity
    (Android). Enforcement is turned on in the Firebase console **per product**
    (Firestore, Storage, Functions) only after metrics show verified traffic.
- **`initMobileAppCheck()` becomes real** but stays a single seam: it reads the
  env (same source as `firebaseConfig`), picks the provider, and activates App
  Check on the already-initialized app. It must remain safe to call on the web
  build (guard like `bootstrapFirebase` does) and idempotent under hot reload.
- **No enforcement flip in code.** Turning enforcement on/off is a console action,
  reversible without a release. The app always attaches a token once the provider
  is active; enforcement is the server-side gate.
- **Roll out enforcement gradually**, watching the App Check "verified vs.
  unverified requests" metrics per env before enforcing, so an older installed
  client release isn't locked out.

## File Structure

**Modify**
- `apps/mobile/lib/appCheck.ts` — implement `initMobileAppCheck()` (provider
  selection by env, web guard, idempotency).
- `apps/mobile/app.config.ts` — inject any App Check config/keys per env into
  `extra` alongside `firebaseConfig`; add the config plugin if the chosen package
  ships one.
- `apps/mobile/.env.example` — document the new App Check vars per env.
- `apps/mobile/eas.json` — pass the new vars through the `dev`/`beta`/`prod` build
  profiles if they're build-time.
- `docs/ENVIRONMENTS.md` (or the mobile env doc) — App Check setup + debug-token
  registration steps.

**Create (native, via prebuild)**
- Whatever the chosen App Check package's config plugin generates (iOS entitlements
  for App Attest, Android Play Integrity wiring). Run a clean prebuild; don't
  hand-edit `ios/`/`android/` if they're gitignored/managed.

## Tasks

### Stage 1 — Provider wiring (dev only)
- [ ] Confirm the App Check package + API against the Expo SDK 56 docs; install it
      and run a clean prebuild (`expo-native-rebuild`).
- [ ] Implement `initMobileAppCheck()` with the **debug provider** for dev; keep the
      web guard and idempotency.
- [ ] Register the dev debug token in the `villa-events` Firebase console.
- [ ] Verify the dev client still boots and Firestore reads/writes succeed with App
      Check active but **not enforced**.

### Stage 2 — Real attestation (beta/prod build config)
- [ ] Add App Attest/DeviceCheck (iOS) + Play Integrity (Android) provider selection
      for beta/prod in `initMobileAppCheck()`.
- [ ] Wire per-env vars through `app.config.ts` / `eas.json` / `.env.example`.
- [ ] Produce a beta build and confirm it emits **verified** App Check tokens
      (console metrics), enforcement still off.

### Stage 3 — Enforcement rollout
- [ ] Watch verified-vs-unverified metrics on beta until unverified is negligible.
- [ ] Enforce App Check on Firestore, then Storage, then Functions on beta;
      confirm no legitimate client is locked out.
- [ ] Repeat the metrics-then-enforce sequence on prod.
- [ ] Update `docs/ENVIRONMENTS.md` with the final enforcement state per env/product.

## Out of scope

- reCAPTCHA / any web App Check — there is no web app.
- Changing the guest-read rules — App Check is the abuse lever; read rules stay open
  (see the guest-browsing decision).

## Open questions

- Which package under Expo SDK 56 is the least-friction path to DeviceCheck/Play
  Integrity — a `@react-native-firebase/app-check` install with a config plugin, or
  a JS `firebase/app-check` custom provider that works with the config-injected
  `initFirebase`? Resolve against the current Expo docs before Stage 1.
- Does beta need App Attest **and** DeviceCheck fallback for older iOS, or is App
  Attest-only acceptable given the minimum iOS target?
