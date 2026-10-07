# Village-first URLs — finish the prod rollout

**Priority:** medium

**Goal:** a shared village-first link opens the iOS app on prod, and both store
consoles declare the Spanish legal URLs.

## Context

The village-first URLs (#341, #348, #350) have served prod since v1.2.0
(2026-09-14). Two steps waited on the store. Both are unblocked now: prod serves
1.7.1 on both stores (`config/appVersion`, 2026-10-08), well past iOS 1.2.1, the
first build with the new routes. Yet prod's AASA still claims only the legacy
paths (`/event/*`, `/news/*`, `/village/*`, `/o/*`), checked on 2026-10-08. So
every new-style link opens Safari instead of the app. Why the claim waited is in
[spanish-village-urls.md](../../decisions/spanish-village-urls.md#hosting-and-native-links).
These steps came from the store-release runbook plan, which retired on 2026-10-08.

The installed-client concern: an iOS binary older than 1.2.1 would open a
new-style link with no screen for it. `minSupported` is 1.7.1, so such a binary
is already walled.

## File Structure

- `web/well-known/prod/apple-app-site-association`: set `paths` to `["NOT /entrar", "NOT /entrar/*", "*"]`.
- `packages/shared/test/ci/storeRelease.test.ts`: update the pinned prod path list.
- `apps/mobile/__tests__/appConfig.test.ts`: include `prod` again.
- `docs/decisions/spanish-village-urls.md` and AGENTS.md (*Deep links*): delete the "prod's AASA deliberately lags" exception.

## Tasks

- [ ] Widen prod's AASA and update both tests and both docs in one PR.
- [ ] After the prod deploy, check
      `curl -s "https://cultuvilla.es/.well-known/apple-app-site-association?cb=$RANDOM"`.
      Then open one `/<pueblo>/evento/…` link on an iPhone with the app installed.
      iOS caches the AASA through Apple's CDN, so allow up to a day.
- [ ] **User, in the consoles (no API exists):** set the privacy policy URL to
      `https://cultuvilla.es/legal/privacidad` in App Store Connect → App
      Information, and in Play Console → Policy and programs → App content →
      Privacy policy. The old `/legal/privacy` 301s, so nothing is broken
      meanwhile.
