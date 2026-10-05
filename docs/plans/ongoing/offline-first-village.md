# Offline-first — the whole village on the device

**Priority:** high — the main reason the app feels slow
**Landed:** dev
**Gate:** none
**Next:** mis-inscripciones and the remaining list screens onto watchers; then layer 3 (village sync)

## Goal

The app opens instantly, and opens **offline**, showing every public section
of the user's villages from the device, then refreshes live. Today every
screen fetches from the network on each focus, with only an in-memory cache:
the Firestore JS SDK has no persistent cache on React Native (no IndexedDB).

## Why not a query cache (TanStack Query)

It caches query *results* keyed by screen. Caching the whole village and
opening offline would mean building a second database beside Firestore —
invalidation, schema versioning, size limits (AsyncStorage caps at 6 MB on
Android by default) — with two caches that disagree. Firestore already ships a
persistent document cache, cache-backed queries, offline write queueing and
live sync; the JS SDK on RN just cannot use it.

## Layers, in order

### 1. Native Firebase SDKs — built

- Every client Firebase import goes through `packages/shared/src/firebase/sdk/`
  (firestore, auth, functions, storage): a JS-SDK file for Node and a
  `.native.ts` twin that Metro picks on device. One service codebase, two SDKs;
  the shared emulator tests keep running unchanged.
- Auth, Functions and Storage move with Firestore: native Firestore only sees
  the native Auth user.
- Persistence on (`initializeFirestore(app, { persistence: true })`).
- Verified at bundle time: an Android export contains no `@firebase/*` module
  and resolves every seam file to its native twin.
- Divergences handled: native `uploadBytes` is unimplemented (wrapped over
  `uploadBytesResumable`); error codes are prefixed differently
  (`firebaseErrorCode()`); the shared package was bundled twice (`src` + `dist`)
  and is now one copy.
- Native → store build, not OTA. Android is exercised by Maestro; iOS first
  compiles on the next build.

### 2. Cache-first reads — village home, Inicio and detail screens done

- Services gain `watch*` twins of their `get*` reads (`services/watch.ts`:
  `watchQuery`, `watchDoc`, `watchMerged`), built from the same query builder,
  so the query shape — and its index — has one source.
- The app subscribes through `useWatch(label, key, watcher)`; a new key
  resubscribes, the same key keeps the listener across renders and focus.
- `useVillageHome` runs on watchers: the village doc and all eight scrolls.
  Its per-user chrome (membership, admin, requests, censo) stays a one-shot
  read refreshed on focus.
- [x] The Inicio feeds and the eight entity detail screens read their entity
  through single-doc watchers; their focus reloads remain only for secondary,
  per-user data (residents, burials, org membership, the viewer's person).
- [ ] Mis-inscripciones and the remaining list screens (historia,
  vocabulario, mi-pueblo, perfil). Delete each screen's `useFocusEffect`
  reload as it moves.
- [ ] `getCountFromServer` call sites become cache-friendly (stored counters or
  local counts) — a server count cannot answer offline.

### 3. Village sync

- On launch and on foreground, warm the cache for the user's member villages
  plus the last village viewed as a guest: events, news, orgs, places, barrios,
  history, carteles, vocabulary, and member-only data where the user is a member.
- Prefetch the images of the visible sections into the `expo-image` disk cache.
- v1 is plain queries (Matabuena ≈ 1.4k docs, affordable today). Optimise later
  with `updatedAt` delta queries or Firestore bundles served from the CDN —
  same app shape.

## Product decisions (taken 2026-10-02)

- Plain document writes queue offline (Firestore does it). Callables
  (registration, joins, approvals) need the server: offline they show
  "Sin conexión" — capacity and authority cannot be decided offline.
- Sign-out clears the local cache: it holds member-only data, and a cache
  read is not checked against the security rules. Built
  (`lib/auth/clearLocalCache.ts`): terminate, clear, then restart the JS app —
  terminate kills every mounted listener and the native emulator wiring, so a
  restart is the only clean way back.
- Offline state is a quiet banner ("Sin conexión — mostrando datos guardados"),
  never a blocking screen. Built (`OfflineBanner`, NetInfo): shown only when
  NetInfo is certain the phone is offline.

## Risks

- A long tail of JS-SDK assumptions (ordago's migration had one). The Zod
  converters run unchanged on RNFirebase; Android passes the Maestro suite.
- iOS has compiled but not yet run on the native SDKs — the next TestFlight
  build is the first.
