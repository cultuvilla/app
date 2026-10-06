# Open Graph previews via a Hosting-edge Cloud Function

> **Superseded 2026-10-02 by [web-is-a-read-site.md](web-is-a-read-site.md).**
> The read site (`readSite`, `functions/src/web/`) renders every public page
> with its own OG tags and JSON-LD, so there is no SPA shell to inject into and
> `ogRenderer` is deleted. What still holds from below: previews are
> best-effort raw reads, one canonical URL per doc, and private content is
> withheld from the anonymous reader.

> **Paths superseded** by [spanish-village-urls](spanish-village-urls.md): the renderer now
> serves `/<pueblo>` and `/<pueblo>/{evento,noticia,entidad}/<ref>` (+ `/unirse`), looks
> villages up by slug, and 301s a stale title or pueblo to the canonical path.

## Context

The deeplink service produces working share URLs (`/event/<id>`, `/news/<id>`,
`/village/<id>`, `/o/<id>` plus their `/join` invite variants), but those URLs
return the SPA's empty `index.html` shell. Crawlers (WhatsApp, Twitter,
Facebook, iMessage, Slack, LinkedIn, Google) see no `<title>` or `<meta og:*>`,
so shared links render as bare URLs with no preview.

Earlier sessions tried Expo Router SSR on Cloud Run. That failed on two counts:
`expo export` in SDK 56 doesn't emit a per-request SSR module (only API routes +
middleware), and `firebase-admin` doesn't survive Expo's Hermes transform of the
code it does bundle. The real problem is small — `url → fetch one Firestore doc
→ return HTML with og:* injected` — which is a serverless-function shape, not a
long-running-server shape.

## Decision

One `onRequest` Cloud Function (`ogRenderer`, `europe-west1`) sits behind
Firebase Hosting rewrites for the four URL families (and `/join` variants),
placed **before** the `**` → `/index.html` catch-all. The SPA stays on the
existing static CDN for every other path — no continuously-running SSR server.

- **Fetchers** ([functions/src/og/fetchers.ts](../../functions/src/og/fetchers.ts))
  — four pure async reads over admin Firestore (`getEventOg`, `getNewsOg`,
  `getVillageOg`, `getOrgOg`), each returning `{ title, description, imageUrl }`
  or `null` on a missing doc. News og:image is a 7-day admin **signed URL** of
  the first image's storage path.
- **Injection** ([functions/src/og/html.ts](../../functions/src/og/html.ts)) —
  pure string transform inserting `<title>`, `og:*`, and `twitter:*`
  (`summary_large_image`) into `<head>`.
- **SPA shell** ([functions/src/og/spaShell.ts](../../functions/src/og/spaShell.ts))
  — lazily fetches the site's own `/index.html` once per cold start, cached in
  module state with a 1h TTL, so the function never needs redeploying when the
  SPA is rebuilt. Falls back to a thin HTML skeleton (og:* + `<noscript>` link)
  if the fetch fails, so crawlers still get metadata.
- **Router** ([functions/src/og/render.ts](../../functions/src/og/render.ts)) —
  branches by path prefix, returns the shell with defaults and a **404 +
  `noindex`** on a missing doc (a thrown fetch stays a 200), sets
  `Cache-Control: public, max-age=600, s-maxage=3600` (5 min at the edge for a
  404, so a doc created right after a miss is not hidden for an hour).
- Rewrites live in [firebase.json](../../firebase.json); coverage is locked by
  [functions/src/__tests__/handlers/og/render.test.ts](../../functions/src/__tests__/handlers/og/render.test.ts).

Per-resource og:* mapping (as implemented):

| URL           | og:title            | og:description                    | og:image                                          |
|---------------|---------------------|-----------------------------------|---------------------------------------------------|
| `/event/<id>` | `event.title`       | ~200 chars of `event.description` | `event.imageURL` ?? `villageCoverImage`           |
| `/news/<id>`  | `post.title`        | ~200 chars of `post.body`         | signed URL of `post.images[0].storagePath` (7d)   |
| `/village/<id>` | `municipality.name` | ~200 chars of `community.description` | `escudoManualUrl` ?? `escudoThumbUrl` ?? `escudoUrl` |
| `/o/<id>`     | `org.name`          | ~200 chars of `org.description`   | `org.imageURL`                                    |

`/join` variants share the parent resource's metadata but are cached under
distinct URL keys, so invite copy can diverge later without a cache collision.

## Rejected alternatives

- **Per-request SSR (Expo Router on Cloud Run).** No remaining use case justifies
  a runtime server; the SDK-56 export + `firebase-admin`/Hermes issues made it
  the harder path for a strictly smaller problem.
- **`generateStaticParams` pre-rendering.** Wouldn't cover user-generated events/
  news/orgs uniformly; the function covers all four resource families with one
  code path.
- **Branch.io / dynamic-link providers.** Third-party dependency and cost for a
  problem solvable with one $0-at-our-scale function.

## What this binds

- **Cloud Run sees the `run.app` host, not the Hosting domain.** `render.ts` must
  read `x-forwarded-host` before `host`, or the SPA-shell self-fetch targets the
  function's own origin instead of the CDN and returns the wrong shell.
- **The prod cache header is unverified and will silently disable caching.** The
  global `Cache-Control: no-cache, no-store, must-revalidate` on the `**` header
  glob in [firebase.json](../../firebase.json) clobbers the function's own
  `public, max-age=600, s-maxage=3600`, so every OG request hits Firestore —
  tolerable in dev, wasteful in prod. Firebase does **not** document
  header-precedence when multiple globs match the same path (first-match is
  documented only for redirects/rewrites), so a `hosting.headers` override for
  `/event/*`, `/news/*`, `/village/*`, `/o/*` (+ `/join` variants) can't be
  assumed to win: after adding it, `curl -sI` an OG URL on a non-prod project and
  confirm the response carries `max-age=600, s-maxage=3600`, not `no-store`,
  before trusting it in prod.
