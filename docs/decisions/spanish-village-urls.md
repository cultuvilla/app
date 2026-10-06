# Spanish, village-first URLs

## Context

Share links were `cultuvilla.es/village/aB3xK9…`, `/event/Zx8k…`, `/o/…`: English
path words and random Firestore ids. Nothing in them told a WhatsApp recipient
what they were about to open, a pueblo could not print its own address on a
bando, and the path carried none of the words people search for. The app was
also inconsistent — `/descarga` and `/legal/eliminar-cuenta` already sat beside
`/event` and `/village`.

## Decision

- **Every path is Spanish, and every public path starts with the pueblo.**
  `cultuvilla.es/matabuena`, `/matabuena/evento/fiestas-de-san-roque_<id>`,
  `/noticia`, `/entidad`, `/lugar`, `/barrio`, `/cartel`, `/acontecimiento`,
  `/palabra`. App screens are Spanish too (`/ajustes`, `/buzon`, `/perfil`,
  `/crear/evento`, …).
- **The pueblo is a root-level slug.** `cultuvilla.es/matabuena` is the one
  address worth printing. The cost is a reserved-word list: no slug may equal a
  top-level app route (`RESERVED_ROOT_SEGMENTS` in `packages/shared/src/utils/urls.ts`).
- **Organizations live under their home pueblo** (`/<pueblo>/entidad/…`), like
  every other entity.
- **One module owns URL shape** — `packages/shared/src/utils/urls.ts`. It is pure
  (no Expo, no Firebase), so the app (`lib/navigation/routes.ts`), the deep-link
  service, the share-preview server, the sitemap and the emails all build and
  parse paths from the same table. Screens never hand-write a path.

### Municipality slugs

Every municipality has a permanent `slug`, assigned once over the whole INE set
by `assignMunicipalitySlugs`:

- the bare name when no other place has it (`matabuena`);
- `name-province` for **every** holder of a shared name (`moya-cuenca`,
  `moya-las-palmas`) — 20 names, 41 municipalities, none repeated within a
  province, so the province always settles it; nobody wins the bare name by
  being seeded first;
- docs that share an INE code are one place (a seeded demo village beside its
  INE doc), not a clash — the activated one takes the bare name.

A slug **never moves**, not even when a municipality is renamed. It is a
permalink; a changing slug would break every link already shared.

### Entity refs: `<title-slug>_<id>`

The id is authoritative; the title slug is decoration. It may go stale when a
title is edited, and nothing reads it — `parseEntityRef` takes everything after
the **first** `_`. Slugs only ever contain `[a-z0-9-]`, while ids may contain
`-` (seed ids do), so `_` is the one separator that always splits unambiguously.

The read site (`readSite`, which replaced the share-preview server `ogRenderer`) answers any stale form — an edited
title, a wrong pueblo — with a **301 to the canonical path**, so each doc has
exactly one URL to rank. A well-formed path to nothing — an unknown pueblo, a
deleted event — is a **404 with `noindex`**, still serving the SPA shell so the
app shows its own not-found screen; a 200 there would make every mistyped
village its own indexable page. A fetch that *throws* stays a 200, so a
Firestore blip cannot deindex a real page.

**On web, a cold visit to `/<pueblo>` keeps its URL.** Native sends a share-link
arrival into the tab shell (`/mi-pueblo?villageId=<doc id>`), which is invisible
there; on web the same redirect would put a doc id in the address bar of every
visitor and crawler. Web renders the village in place instead, and back — with
no history — goes into the tab shell showing that village.

**A private event's URL never carries its title** (`evento-privado_<id>`): the
share preview withholds the title from anyone outside the org, and a slug in the
link would hand it to every chat the link is pasted into.

### `villageSlug` is denormalized

A card has to build its href synchronously, and a feed mixes pueblos. So the
top-level entities — `events`, `news`, `organizations`, `festivalPosters`,
`historyEntries` — carry `villageSlug`, stamped by their create service (which
looks the slug up, cached) and immutable afterwards (services and rules both
refuse to change it). No sync trigger exists because slugs never change. Places
and barrios live under `municipalities/{id}/…`, so wherever they are linked the
pueblo is already in hand.

Rules check `villageSlug` is a string but not that it matches the
municipality's: a mismatch is cosmetic (screens load by id, and the preview
server redirects to the canonical path), and checking it would add a `get()` to
every create.

### Navigating by id

A few surfaces hold only an id: owner chips (`openOwner`), `@`-mentions of
another village (`openMention`), and inbox rows (`openVillage`). Each resolves
the doc before navigating. Everything else passes the entity it already has.

### Hosting and native links

- Hosting sends every page to the read site (`readSite`), whose router
  (`functions/src/web/routes.ts`) answers reserved segments with the app
  hand-off and everything else as a pueblo or entity. `packages/shared/test/ci/villageUrls.test.ts` fails if the route
  files, the reserved list and the rewrites disagree.
- Because a URL can start with any slug, the apps claim the **whole host**:
  Android intent filters take every path (Android cannot exclude), and the iOS
  AASA takes `*` except `/entrar`, so a sign-in link stays in the browser.
- **Prod's AASA is the exception, until an iOS build with these routes is live.**
  An association file applies to every installed version of the app, and the
  App Store build (iOS 1.0.0) predates both these routes and `expo-updates`, so
  no OTA can teach it them. Claiming `*` on prod would open `/<pueblo>/evento/…`
  inside an app with no such screen — a dead end in place of a working web page.
  So prod keeps the legacy claim (`/event/*`, `/news/*`, `/village/*`, `/o/*`):
  links shared before the change still open 1.0.0, and every new URL opens on the
  web. Widen prod to the dev/beta claim in the same change that confirms an iOS
  build with the village-first routes is on sale — `storeRelease.test.ts` pins the
  legacy list so that widening is a deliberate edit, not drift. Android has no
  such split: the Play build never went public with the old paths, and its
  path claim lives in the binary's manifest, not in `assetlinks.json`.

## Rejected alternatives

- **`/pueblo/<slug>` prefix.** No reserved-word list and no whole-host link
  claim, but `cultuvilla.es/pueblo/matabuena` is worse on a poster, which is the
  point of the exercise.
- **A unique slug per entity (no id).** Needs a slug registry with reservation
  writes and a rename policy, for items that are mostly short-lived. The
  decorated id gets the readability without the machinery.
- **Resolving a slug from the id at render time.** Would put a read, or an async
  gap, behind every card in a feed.
- **Keeping the old paths as redirects.** Declined: no public release yet, and
  the old URLs had barely been indexed. The one exception is `/legal/privacy`
  and `/legal/terms`, which store listings reference — Hosting 301s them to
  `/legal/privacidad` and `/legal/terminos`.

## What this binds

- New entity kinds add a segment to `ENTITY_SEGMENT` and, if top-level, a
  `villageSlug` field (model + create service + rules + the
  `village-slug-denorm` backfill).
- New top-level app routes add their segment to `RESERVED_ROOT_SEGMENTS` and to
  the app-route rewrite in `firebase.json`; the contract test enforces both.
- A new municipality gets its slug from `assignMunicipalitySlugs`, never from a
  bare `slugify`.

## Revisit when

- A municipality genuinely changes name and the old slug reads wrong — decide
  then whether to add a slug-alias redirect; do not move the slug.
- Multi-village organizations arrive — `/<pueblo>/entidad/…` then means "home
  pueblo", and the page must say so.
