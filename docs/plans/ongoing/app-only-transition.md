# App-only transition — the app is the product, web is a read site

**Priority:** high — unblocks offline-first, the main app-speed fix
**Landed:** dev
**Gate:** none
**Next:** promote to beta and run the phase 3 `curl` checks there, then the same on prod

The decision and the data behind it are in
[web-is-a-read-site.md](../../decisions/web-is-a-read-site.md). This plan tracks
the work until the Expo web export is gone and the read site serves every
public route in prod.

Replaces *app-first-transition* (which assumed web stays a full app) and the
*native-firebase-sdk-migration* idea (now [offline-first-village.md](../ready/offline-first-village.md)).

## Phases

| Phase | What | Ships via |
|---|---|---|
| 1 | Native analytics | store build |
| 2 | Read site (`readSite` function) | functions deploy |
| 3 | Route-by-route cutover | `firebase.json` rewrites |
| 4 | Delete the Expo web export | code removal |
| 5 | Web sign-up decision | decision record |

Offline-first starts after phase 4 — tracked in its own plan.

## Phase 1 — native analytics (measure install-from-link)

Today `apps/mobile/lib/observability/analytics.ts` is a no-op on native; only
`analytics.web.ts` reports. Without native events the phase 5 question cannot be
answered.

- [x] `@react-native-firebase/app` + `analytics`; `analytics.ts` forwards the
      same taxonomy as web, dots mapped to underscores (GA4 native rejects
      dotted names — join platforms with `REPLACE(event_name, '.', '_')`).
- [x] `app.link.opened` on every routed deep link, with `entityKind`,
      `viaInvite` and `surface` (`cold_start` / `running`).
- [x] **iOS:** an iOS app registered in each Firebase project (2026-10-02);
      `google-services/<env>/GoogleService-Info.plist` committed and locked by
      `googleServices.test.ts`. Prebuild verified; pod install + compile is
      first exercised by the next TestFlight build.
- [ ] Ship in the next `mobile-release` (native: no OTA). Confirm events in
      GA4 DebugView on one Android and one iOS build.
- [ ] GA4 reports `user_pseudo_id` as null on web today (every row counts as 0
      users) — check whether that is consent mode or config, so the platform
      split counts people, not only events.
- **Not measurable directly:** a user who installs from the store after
      tapping a link arrives without the link (no deferred deep linking). The
      proxy is web share-link visits vs. native `first_open` over the same
      window, plus `app.link.opened` for people who already have the app.

## Phase 2 — the read site

**Shape:** one Cloud Function, `readSite` (`functions/src/web/`), not Next.js
on Cloud Run — see the decision record for why. Escape-by-default templates
(`html.ts`), a router over every URL the app emits (`routes.ts`), best-effort
Admin SDK loaders that re-apply visibility (`data.ts`), pages (`pages.ts`).
Firebase Hosting stays in front and rewrites page routes to it.

- [x] Village home `/<pueblo>`, and lists: carteles, lugares, entidades,
      historia, vocabulario, barrios (the app's own screens at those paths are
      member forms; on web they are lists)
- [x] Details: evento, noticia, entidad, lugar, barrio, cartel, acontecimiento,
      palabra — each with one canonical URL (stale slugs 301)
- [x] `/<pueblo>/entidad/<ref>/unirse` → invite landing, `noindex`
- [x] `/descarga` (phones 302 to their store), `/legal/*` (content moved to
      `@cultuvilla/shared/legal`; account deletion is `/legal/eliminar-cuenta`)
- [x] App-only paths (account, forms, member views) → app hand-off, `noindex`
- [x] OG tags, JSON-LD, canonical on the project's public origin, Safari banner
- [x] Every action → app CTA (scheme hand-off, `/descarga` fallback)
- [x] Visibility: private events withheld (title not even in the URL), drafts,
      hidden news, pending orgs, hidden places/barrios/carteles 404. The sitemap
      no longer lists hidden news.

Tests: `functions/src/__tests__/web/` (templates, router, document, rich text)
and `__tests__/handlers/web/` (every page and gate against the emulator).

## Phase 3 — cutover

Done in one step rather than route by route: every page now goes to the read
site, so there is no SPA left to share routes with.

- [x] `firebase.json`: `public` is `web/dist` (assembled per env by
      `scripts/build-web-static.mjs` — brand files, this env's `.well-known`,
      `robots.txt`); rewrites are `/sitemap.xml` → `sitemap`, `**` → `readSite`
- [x] The deploy assembles static files instead of building the Expo export
- [x] `ogRenderer` deleted
- [ ] Verify per env after its deploy (`curl` with `?cb=$RANDOM`): a pueblo, an
      event, a news post, `/descarga` from a phone UA, `/robots.txt`,
      `/.well-known/apple-app-site-association` (JSON content type),
      `/sitemap.xml`, and a WhatsApp preview of one event link

Carry-over gotchas from the previous web setup that still apply:

- A Cloud Function (or Cloud Run behind Hosting) cannot serve `/robots.txt` or
  `/favicon.ico` reliably — keep both static per env.
- The sitemap uses no composite index on purpose (an index puts
  `firestore.indexes.json`, a hard-stop path, into every sitemap change).
- Verify with a cache-busting query (`?cb=$RANDOM`): Hosting caches a 404 for
  10 minutes, which reads exactly like a broken rewrite.
- The prod AASA deliberately lags the app routes — see
  [spanish-village-urls.md](../../decisions/spanish-village-urls.md) before
  widening it.

Prod-only, once the read site serves prod: Search Console property + sitemap
submission for `cultuvilla.es`, one Rich Results Test, coverage check 2–4
weeks later.

## Phase 4 — delete the Expo web export

- [x] `.web.*` overrides, `Platform.OS === 'web'` branches, `seoShell`, web
      pull-to-refresh, `SmartAppBanner`, the desktop carousel arrows,
      `public/index.html`, the `web` block in `app.config.ts`
- [x] `react-native-web`, `react-dom`, `react-easy-crop`, Playwright
- [x] `app:web:build`, `check-web-compat`, `check-web-export`, the Playwright
      suite (`test:e2e:web`) and its CI job
- [x] The `mobile-web-compat` skill
- [x] Port the product flows only Playwright covered to Maestro (flows
      `60`–`91`; register a family member was already `21`). Onboarding stays
      uncovered while `50` is quarantined — re-run it on the native SDK.

## Phase 5 — web sign-up decision

Decided 2026-10-06 (user): **no web sign-up.** The event page's CTA opens the
app, or the store when it is not installed. Recorded in the decision doc.

## Retire when

The read site serves every public route on prod (curl checks, a WhatsApp
preview, Search Console). Then delete this plan.
