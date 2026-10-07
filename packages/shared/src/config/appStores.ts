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

// What each store SERVES is deliberately not here: it is a fact about the
// stores, not the code, and a constant someone has to remember to edit went
// stale. `config/appVersion.<platform>.latest` holds it, written by the
// announce poller once the store itself says the version is live — see
// docs/decisions/announce-when-live-poller.md.

// Numeric App Store id (the `ASC_APP_ID` repo var). Safari builds its own smart
// app banner from this via the `apple-itunes-app` meta tag in public/index.html —
// see SmartAppBanner for how the two are kept from stacking.
export const APP_STORE_ID = '6804756586';

// Must match `scheme` in apps/mobile/app.config.ts. Used to attempt opening an
// already-installed app before falling back to the store.
export const APP_SCHEME = 'cultuvilla';
