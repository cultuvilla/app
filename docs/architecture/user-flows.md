# User flows reference

Living map of the principal flows in the cultuvilla app. Source of truth for "what does the user actually do", linking UI entry points → shared services → Cloud Functions → Firestore collections.

If a flow changes shape (new step, new collection, role rename), update this doc in the same commit.

## Roles & personas

Two orthogonal concepts:

- **Membership role** (`VillageMemberRole` in [packages/shared/src/models/VillageMemberDataModel.ts](../../packages/shared/src/models/VillageMemberDataModel.ts)): `admin | user`. Scoped to a single municipality via `municipalities/{id}/members/{userId}`.
- **Persona** (`Person`): identity record — given name, surnames, nickname, sex, birthday, birthplace, biography, photo, municipality links, occupation ids. Linked from `users/{uid}.personId`. See the in-flight redesign at [../superpowers/specs/2026-05-24-auth-and-persona-redesign-design.md](../superpowers/specs/2026-05-24-auth-and-persona-redesign-design.md).

| Role | Where it lives | Capabilities |
|---|---|---|
| User (neighbor) | `municipalities/{id}/members/{uid}` with `role: 'user'` | Register to events, view village |
| Village admin | `municipalities/{id}/members/{uid}` with `role: 'admin'` | Approve join requests, manage events |
| Community admin | `municipalities/{id}.community.adminUserId` | Organizer who activated the community |
| App admin | `admins/{uid}` | Approve organizer requests |

## 1. Auth

**Entry:** [apps/mobile/app/(auth)/login.tsx](../../apps/mobile/app/(auth)/login.tsx), [signup.tsx](../../apps/mobile/app/(auth)/signup.tsx); web at [apps/web/app/login/page.tsx](../../apps/web/app/login/page.tsx).

Email/password or Google OAuth via Firebase Auth, wrapped in a `useAuth()` hook. On success, mobile routes straight to `(tabs)`; the `(onboarding)` gate in `_layout.tsx` redirects if the user lacks a complete profile.

- **Services:** `userService.createUserProfile()`
- **Collections:** `users/{uid}`

## 2. Onboarding (profile + persona)

**Entry:** [apps/mobile/app/(onboarding)/complete-profile.tsx](../../apps/mobile/app/(onboarding)/complete-profile.tsx).

Today: a single screen captures displayName, birthday, telephone and writes `users/{uid}`. The persona redesign (linked spec above) splits this into account metadata + a separate Person creation step gated by `!profile.personId`.

- **Services:** `userService.createUserProfile()`; future `personService.createPerson()`
- **Collections:** `users/{uid}`; future `persons/{personId}`

## 3. Village membership

Three pathways into a village.

### 3a. Request to join

User → village admin approval.

- **Function:** [functions/src/requestJoinVillage.ts](../../functions/src/requestJoinVillage.ts) creates `municipalities/{id}/joinRequests/{userId}` with `status: pending`, notifies all admins.
- **Function:** [functions/src/respondToJoinRequest.ts](../../functions/src/respondToJoinRequest.ts) — admin approves (creates `members/{uid}` with role `user`) or rejects; requester is notified.
- **Collections:** `municipalities/{id}/joinRequests`, `municipalities/{id}/members`

### 3c. Organize an inactive village

User → app admin approval; activates a dormant municipality.

- **Function:** [functions/src/requestOrganizeVillage.ts](../../functions/src/requestOrganizeVillage.ts) creates `organizerRequests/{id}` (only allowed when `community.active !== true`), notifies app admins.
- **Function:** [functions/src/respondToOrganizerRequest.ts](../../functions/src/respondToOrganizerRequest.ts) — approval activates the community, sets `community.adminUserId`, creates an admin member doc.
- **Collections:** `organizerRequests`, `municipalities/{id}.community`, `municipalities/{id}/members`

## 4. Event lifecycle

- **Creation:** organizer-only; writes to `events` (per-municipality scope via `municipalityId` field).
- **Registration:** [functions/src/registerToEvent.ts](../../functions/src/registerToEvent.ts) — validates capacity, writes `events/{eventId}/registrations/{regId}` with `status: confirmed | waitlisted`, updates denormalized counters on the event doc.
- **Waitlist promotion:** [functions/src/waitlistPromotion.ts](../../functions/src/waitlistPromotion.ts) — on registration delete, promotes the next waitlisted person (by `position`), notifies them, recomputes counters from the registrations collection.
- **Completion:** [functions/src/eventCompletion.ts](../../functions/src/eventCompletion.ts) — scheduled hourly; flips published events to `completed` once `endDate`/`startDate` passes.

Services: `registrationService`, `eventService`, `feedService`. See also [./denormalized-read-models.md](./denormalized-read-models.md) for how event counters and village denormalization stay in sync ([functions/src/syncVillageDenormalization.ts](../../functions/src/syncVillageDenormalization.ts)).

## 5. Discover / feed

**Entry:** [apps/mobile/app/(tabs)/index.tsx](../../apps/mobile/app/(tabs)/index.tsx).

Top-level feed with two tabs:

- **EVENTOS** — `feedService.getUpcomingFeed(50)` queries `events` filtered to `status: published` and `startDate >= now`, ordered by `startDate`.
- **NOTICIAS** — placeholder; spec at [../superpowers/specs/](../superpowers/specs/) (see noticias feed design).

Tapping an event navigates to the event detail screen at `apps/mobile/app/event/`.

## 6. Tabs structure

[apps/mobile/app/(tabs)/_layout.tsx](../../apps/mobile/app/(tabs)/_layout.tsx) renders three tabs:

| Tab | Label | Icon | Notes |
|---|---|---|---|
| `index` | Explora | compass | Eventos + Noticias feed |
| `village` | `<village name>` / "Buscar Pueblo" | home / search | Switches based on `profile.activeMunicipalityId`; fetches name via `getMunicipality()` |
| `profile` | Perfil | person | Account + settings |

## 7. Notifications

All notifications are docs in `users/{uid}/notifications` with `type`, `title`, `body`, optional `municipalityId`/`eventId`, `read`, `createdAt`. Fired from [functions/src/notificationTriggers.ts](../../functions/src/notificationTriggers.ts) and [functions/src/helpers/notifyRequests.ts](../../functions/src/helpers/notifyRequests.ts).

| Type | Trigger | Audience |
|---|---|---|
| `join_request_created` | New `joinRequests` doc | Village admins |
| `join_request_approved` / `_rejected` | Admin response | Requester |
| `organizer_request_created` | New `organizerRequests` doc | App admins |
| `organizer_request_approved` / `_rejected` | App admin response | Requester |
| `event_cancelled` | Event status → cancelled | All registrants |
| `event_updated` | Published event title/date/location change | All registrants |
| `waitlist_promoted` | Registration delete triggers promotion | Promoted user |

## Related references

- [./denormalized-read-models.md](./denormalized-read-models.md) — how derived fields stay in sync
- [../ENVIRONMENTS.md](../ENVIRONMENTS.md) — dev/beta/prod project layout
- [../testing.md](../testing.md) — test harnesses per layer
- [../superpowers/specs/2026-05-24-auth-and-persona-redesign-design.md](../superpowers/specs/2026-05-24-auth-and-persona-redesign-design.md) — in-flight auth + persona split
