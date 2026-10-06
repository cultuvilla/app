# Deep link service: HTTPS Universal/App Links over a per-env host

> **URL shape superseded** by [spanish-village-urls](spanish-village-urls.md): paths are
> now Spanish and village-first, built by `packages/shared/src/utils/urls.ts`, and the
> apps claim the whole host. The transport decisions below (HTTPS links, per-env
> host, AASA/assetlinks per env, no interstitial) still stand.

## Context

Cultuvilla resources (events, news, villages, organizations) needed shareable
URLs that open the native app when installed and fall back to the Expo web
export otherwise. The canonical domain (Firebase Hosting today, a custom domain
later) must be able to migrate without code changes, which ties this work to the
per-env model in [dev-beta-prod-environments](dev-beta-prod-environments.md).

## Decision

- **HTTPS Universal Links (iOS) / App Links (Android) are the canonical share
  format** — no scheme-only URLs in user copy, no `/launch/...` interstitial.
  The web export renders every route, so web is the fallback by construction.
- A **pure shared builder** (`packages/shared/src/services/deepLinkService.ts`)
  owns URL shape: `getEventLink` / `getNewsLink` / `getVillageViewLink` /
  `getOrgInviteLink` (build), `parseLink` (parse), `buildShareMessage`. No
  `Linking`/`expo-router` — it runs in mobile, web, functions, and vitest.
  Paths mirror expo-router routes one-to-one except `organization` → `/o/<id>`.
- Two link **families**: content (events, news, villages — idempotent view) and
  invite (orgs — same URL doubles as a stable, token-less join link). Villages
  dropped their invite variant: joining a village is open self-service, so the
  invite link granted no capability the plain view link didn't (see CHANGELOG).
  Routing does not branch on family; the destination screen decides view vs.
  join vs. sign-in CTA. The `kind` exists only for share copy / future analytics.
- A **per-env `deepLinkHost`**: `app.config.ts` builds `deepLinkHostPerEnv`
  (`DEEP_LINK_HOST_{DEV,BETA,PROD}` env vars, defaulting to
  `villa-events[-dev|-beta].web.app`) and exposes it via
  `Constants.expoConfig.extra.deepLinkHost`; the shared service reads it there.
- Native config is **derived from the same host**: iOS `associatedDomains`
  (`applinks:<host>`) and autoverified Android `intentFilters` for the
  `/event/`, `/news/`, `/village/`, `/o/` path prefixes.
- **AASA / assetlinks served per env:** source files under
  `web/well-known/{dev,beta,prod}/`, copied to the active
  `.well-known/` at deploy. `firebase.json` adds a `Content-Type:
  application/json` header for the extension-less `apple-app-site-association`
  (static files are served before the catch-all `readSite` rewrite).

## Rejected alternatives

- **Server-issued / expiring invite tokens** — rejected for V1; the model is
  "stable, anyone with the link can join", revoked by making the entity private.
- **Scheme-only (`cultuvilla://`) share URLs** — rejected as user-facing; the
  scheme is retained only as internal transport / dev-client fallback.
- **`/launch/<type>/<id>` interstitial redirect page** — rejected; the web
  export already renders the destination route directly.

## What this binds

- The shared service is the single owner of URL shape; mobile/web/functions must
  go through it, never hand-build cultuvilla URLs.
- A domain migration is env var + redeploy + new native build — no service code
  change. Adding a resource means updating the path maps in one module plus the
  `intentFilters` / AASA `paths`.
- `parseLink` returns `null` on host mismatch or unknown path — callers treat
  null as "let the OS open the browser".

## Revisit when

- Elevated-permission invites (e.g. granting admin) are needed → token-based
  links.
- The custom domain (`cultuvilla.app`) is ready → follow the spec's migration
  path (serve AASA on both hosts during cutover).
- Org/village gain an `isPublic` flag → the Join CTA must branch to
  request-to-join for private entities.
