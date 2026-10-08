# Live references (subscribe instead of copy)

The companion to [denormalized read models](./denormalized-read-models.md). That
doc covers *copying* a value from document B onto document A. This one covers the
other choice: storing only B's **id** on A and resolving B **live** at render
time. Read both before deciding how a screen should show data that lives on
another document — they are the two halves of one decision.

## The problem (same as denormalization)

Firestore has no JOINs. When document A needs to display data owned by document
B, you either **copy** B's value onto A (denormalize) or **reference** B by id
and resolve it when you render. There is no third option.

```
DENORMALIZE (copy onto A)                REFERENCE + LIVE RESOLVE (this doc)
┌─────────────────────┐                  ┌─────────────────────┐
│ news post           │                  │ news post           │
│  authorId: "u1"     │                  │  authorId: "u1"     │
│  authorName: "Ana"  │ ← copy           │  (that's it)        │
│  authorPhoto: "..." │ ← copy           └──────────┬──────────┘
└─────────────────────┘                             │ subscribe at render
   1 read, always.                                  ▼
   Copies go stale → needs              ┌─────────────────────┐
   a sync trigger forever.              │ publicProfiles/u1   │
                                        │  name (live)        │
                                        └─────────────────────┘
                                           always fresh, no trigger
```

## The decision rule

> **Copy it (denormalize) if you need it frozen in time, can't read the source
> doc, or must query/sort by it. Otherwise store the id and subscribe to the
> source (a live reference).**

Spelled out — **denormalize** when *any* of these hold:

1. **Frozen-in-time.** You want the value as it was at write time (the name shown
   on a 2-year-old comment). A live resolve would rewrite history.
2. **Source unreadable by the viewer.** If security rules forbid reading the
   source doc, you *cannot* resolve at read time — copy the safe fields over.
3. **Query/sort/filter by it.** Firestore can only order/filter on fields that
   physically live on the queried doc.
4. **Large list of a rarely-changing value.** A 50-item feed would mean 50 extra
   reads to resolve; if the value almost never changes, pay once at write time.

Use a **live reference** when *none* of those hold — the value is current,
the source is readable, you never query by it, and only a handful show at once.
A villager's name and photo are the textbook case: current, readable through
`publicProfiles/*` and `persons/*`, never queried, shown in small numbers.

## The pattern

Ported from ordago's avatar registry. Two pieces make the reference strategy as
cheap and convenient as denormalization usually is:

1. **Dedup by path.** [`useFirestoreDoc`](../../packages/shared/src/hooks/firestoreSubscription/useFirestoreDoc.ts)
   is backed by a subscription cache keyed on the doc path. N components reading
   the same doc share **one** `onSnapshot` listener — so ten avatars of the same
   person cost one read, not ten.
2. **Live, not one-shot.** It's an `onSnapshot` subscription, not a `get`. Change
   the source (upload a new photo) and every reference updates instantly. There
   is no denormalized copy to go stale, and therefore no sync trigger to write.

The resolution lives in one hook,
[`useOwnerSummary`](../../apps/mobile/lib/useOwnerSummary.ts): given an `ownerId`
+ `ownerType` (`user`/`person` → name + `photoURL`, `organization` → `name` +
`imageURL`) it builds the typed doc ref, subscribes, and returns `{ name,
imageUri }`. Two presentation components consume it:

- [`LiveAvatar`](../../apps/mobile/components/feature/LiveAvatar.tsx) — image
  only; renders the dumb `Avatar` primitive with the resolved photo.
- [`LiveOwnerChip`](../../apps/mobile/components/feature/LiveOwnerChip.tsx) —
  avatar **+ live name**, for the admin/byline surfaces that used to print a raw
  uid (join-request and organizer-request submitters, news authors).

The primitives stay presentation-only; all Firestore knowledge lives in the hook.

## Why we don't port ordago's token-pinning

Ordago keeps a stable storage URL across re-uploads and bumps a `?bust=` version
param to invalidate caches — which needs `photoToken`/`photoUpdatedAt` fields and
a `pinStorageObjectToken` Cloud Function. **Cultuvilla doesn't need any of that.**
[`imageService`](../../packages/shared/src/services/imageService.ts) writes a
**random filename** per upload, so every re-upload already yields a new URL and
caches invalidate for free. Porting token-pinning would solve a problem we don't
have.

## Prerequisite: the source must be readable

A live reference dies with `permission-denied` if the viewer can't read the
source doc. Check `firestore.rules` before adopting it for a new owner type.
Current state:

- `users/{userId}` — owner and app admins only. **Never** live-resolve another
  user here: the chip silently lost every name when this tightened. Use
  `publicProfiles/{userId}` (`allow get: if true`), its function-owned projection.
- `organizations/{orgId}` — `allow read: if true`
- `persons/{personId}` — `allow read: if isAuthenticated()`

`publicProfiles`, `organizations` and `persons` are safe to subscribe to. If a future owner type is access-restricted,
that flips the decision toward denormalizing the safe fields instead (rule 2).

## How the two strategies coexist in this app — on purpose

| Value | Strategy | Why |
|---|---|---|
| `users/{uid}.displayName` ← persona | **Denormalize** | sometimes a frozen label, and rendered without a join |
| `events/*.villageName` / `villageCoverImage` | **Denormalize** | hot cross-collection feed, rarely changes |
| event attendee counts | **Counter** (see denormalization doc) | changes on every read-side event |
| villager photo on news authors / event organizers / request submitters / member lists | **Live reference** | current, readable source, never queried, small N |

Same app, different jobs, different strategy. Reach for the decision rule above
when adding a new one.

## Where it's applied

Live (done): event-detail organization logo, news-detail author byline,
village-admin join-request submitter, app-admin organizer-request submitter, and
the organization approval list logo.

Remaining follow-up surfaces — references shown by id with no face, or one-shot
joins that can go stale on screen:

- News-feed card author (needs a byline slot on the shared `FeedCard`), plus
  news comment / reaction authors once those get UI.
- Event attendee lists (`registrations/*.userId` / `personId`).
- Organization / peña member lists (`o/[orgId].tsx` shows only a count today).
- The people-scroll joins in both village screens
  ([(tabs)/village.tsx](../../apps/mobile/app/(tabs)/village.tsx),
  [village/[villageId]/admin/index.tsx](../../apps/mobile/app/village/[villageId]/admin/index.tsx))
  — these fetch `displayName` + `photoURL` once and don't refresh; `PersonCard`
  could take an `ownerId` and live-resolve instead.
