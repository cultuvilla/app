// Single source of truth for where the native apps live. Fill each URL the day
// that platform's app is actually published; everything that offers a download
// derives from these two strings.
//
// Per-platform on purpose: the two did not go live together. An empty string
// means "no listing yet" and the offer for that platform stays dormant — the
// store banner and /descarga both simply omit it.
//
// iOS: 1.0.0 was accepted by App Review on 2026-09-04 and the listing is public.
// Android: Google approved the production release (1.1.0) and the Play listing
// loads for a logged-out visitor since 2026-09-28. The URL stayed empty until
// then on purpose — a closed-track listing 404s, and a link to a 404 is worse
// than no banner at all.
export const APP_STORES: { ios: string; android: string } = {
  ios: 'https://apps.apple.com/es/app/cultuvilla/id6804756586',
  android: 'https://play.google.com/store/apps/details?id=com.cultuvilla.app',
};

// What each store actually SERVES today — the newest build a real user can
// download. Deliberately separate from the repo's own version: a promotion
// deploys the backend and the web on every merge, while a store binary moves
// only by an explicit `mobile-release` dispatch and then waits for review. The
// two drift by design, so `config/appVersion.latest` is derived from HERE and
// never from `app.config.ts` — announcing the repo's version told every iOS
// user on 1.2.2 to update to a 1.3.0 that no store had.
//
// An empty string means "nothing published on that platform", which
// `seed-app-version-config.mjs` writes as `0.0.0` — a `latest` nobody is ever
// behind, so that platform is never nudged.
//
// Update it the day a build goes LIVE (not the day it is submitted), together
// with the URL above; `pnpm check:store-claims` compares iOS against the live
// App Store and fails when the two disagree.
export const APP_STORE_VERSIONS: { ios: string; android: string } = {
  ios: '1.4.1', // live since 2026-09-28
  android: '1.5.0', // live since 2026-09-29
};

// Numeric App Store id (the `ASC_APP_ID` repo var). Safari builds its own smart
// app banner from this via the `apple-itunes-app` meta tag in public/index.html —
// see SmartAppBanner for how the two are kept from stacking.
export const APP_STORE_ID = '6804756586';

// Must match `scheme` in apps/mobile/app.config.ts. Used to attempt opening an
// already-installed app before falling back to the store.
export const APP_SCHEME = 'cultuvilla';
