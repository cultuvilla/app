# Cultuvilla

Mobile-first web app for Spanish village communities to organize and participate in local events. Orgs (ayuntamientos, peñas, asociaciones) publish events; residents and visitors discover them, sign themselves up, and can also sign up family members via proxy profiles.

## User types

Cultuvilla has **six user types**. They compose — an org member is also a village member is also an authenticated user.

| # | Role | What defines them |
|---|------|-------------------|
| 1 | **Anonymous visitor** | Unauthenticated. Browses public event listings; sees attendee counts only, never names. |
| 2 | **Authenticated user** | Signed in. Can browse events globally and **request to join any event in any village**, regardless of village membership. Manages own profile and personas. |
| 3 | **Village member** | Joined a village via invite link. Sees full attendee lists for that village's events, can request org creation. |
| 4 | **Org member** | Belongs to an `ayuntamiento`, `peña`, or `asociación` within a village. Creates, edits, and cancels that org's events. |
| 5 | **Village admin** | One per village. Generates invite links, approves/rejects org requests, manages village info, can cancel any event in the village. |
| 6 | **Superadmin** (app-wide) | Global. Creates villages, manages all villages and users. Owns the `/admin/*` pages (municipalities, barrios, places, occupations, proposals). |

### "Persona" — distinct concept

A **persona** in this codebase is **not** a user type. It is a *proxy profile* (up to 50 per user) for someone who won't use the app themselves — typically an elderly relative. Personas carry their own name, birthday, bio, and photo. They exist so one logged-in user can register multiple family members to an event in a single flow. Owner-only read/write.

When code says `personaId`, it means "which family member is this registration for," not "what kind of user."

## Stack

- **App**: Expo + React Native (TypeScript) in `apps/mobile` — runs on iOS, Android, and web via React Native Web
- **Shared package**: `@cultuvilla/shared` (types, schemas, helpers) in `packages/shared`
- **Backend**: Firebase (Firestore, Auth, Storage) + Cloud Functions in `functions/`
- **Data model**: Data nested under `villages/{villageId}/`, collection group indexes for cross-village queries
- **Environments**: `villa-events` (dev) + `cultuvilla-beta` (beta) + `cultuvilla-prod` (prod) Firebase projects — see [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md)
- **i18n**: Spanish default; shared message catalog in `packages/i18n`
- **Package manager**: pnpm workspaces

## Setup

```bash
pnpm install
pnpm app:start        # Expo dev server (scan QR with Expo Go, or press 'w' for web)
```

See [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md) for the full env layout and deploy commands.

## Commands

Run `pnpm help` for the full list. Most-used:

```bash
pnpm app:start        # Expo dev server (iOS/Android/web)
pnpm app:web          # Expo web only
pnpm check            # typecheck + test + build (full CI gate)
pnpm shared:test      # vitest in packages/shared
pnpm typecheck        # all workspaces

pnpm deploy:rules:dev      # firestore + storage rules → villa-events
pnpm deploy:functions:dev  # cloud functions → villa-events
pnpm deploy:all:dev        # everything → villa-events
# :beta and :prod variants exist — see docs/ENVIRONMENTS.md
```

## Design docs

The code is the source of truth for what exists. Design work follows a lifecycle
(see the `managing-plans-lifecycle` skill):

- **[docs/plans/](docs/plans/)** — in-flight design by stage: `ideas/` (proposals),
  `ready/` (decided, not started), `ongoing/` (being implemented, with a Status header).
- **[docs/decisions/](docs/decisions/)** — durable rationale for shipped work
  (open feed architecture, persons registry, village censo, dev/beta/prod
  environments, news feed, typed converters, deep links, mobile scaffold, …).

## License

Copyright © 2026 Álvaro Francisco Gil.

Licensed under the [European Union Public Licence v1.2](LICENSE) (EUPL-1.2).
