# Firestore typed converters: Zod schema as the single source of truth

## Context

Every service hand-rolled a `map<X>Doc` function (~17 services, ~500 lines of
drift-prone boilerplate) to translate raw Firestore data into typed models, and
nothing validated shapes at runtime. With ~17 services and ~20 functions, no
production users, and Zod 4 already a dependency, this was the cheapest moment
to enforce schema-as-source-of-truth — roughly 10× cheaper than the later
retrofit. This supersedes the converter goal that the old codebase-guidelines
work had carried but never delivered.

## Decision

- **Schema-first.** Each model file exports a Zod schema and derives the type
  via `z.infer` (e.g. `EventDataSchema` → `type EventData`). The schema is the
  source of truth; hand-written interfaces are gone.
- A generic **`makeConverter(schema, sdk)` factory** produces a Firestore
  `withConverter`-compatible object. Reads `normalize` raw data then
  `schema.parse` (throws on mismatch); writes `schema.parse` the model then
  `denormalize`. Both directions are **strict** — drift is a loud signal, not a
  silent corruption, which is the right tradeoff while there are no real users.
- **Recursive walkers** (`walkers.ts`) translate SDK shapes ↔ schema shapes:
  `Timestamp` ↔ `Date`, `GeoPoint` ↔ `{lat, lng}`. Coordinates are detected
  structurally — an object with **exactly** the numeric keys `lat` and `lng`.
- **SDK adapters** (`sdkAdapters.client.ts`, `sdkAdapters.admin.ts`) bind the
  generic factory to either the client SDK or admin SDK, and memoize exactly one
  converter per schema per SDK (`clientConverter` / `adminConverter`): the JS
  SDK's `refEqual` compares converters by identity.
- **A collection is declared once**, in `firebase/refs/collections.ts` (path
  template, schema, `serverOnly`). Both refs files bind that table, and the
  conformance gate walks every entry with a schema.
- **All Firestore access goes through ref factories** in `firebase/refs/client.ts`
  and `firebase/refs/admin.ts`, exposed as distinct **subpath exports**
  (`@cultuvilla/shared/firebase/refs/{client,admin}`) so the admin SDK never
  bundles into mobile and vice versa.

## Rejected alternatives

- **Separate TS interface + runtime validator** — rejected; guarantees drift.
  `z.infer` keeps type and validator in lockstep by construction.
- **SDK-coupled schemas (`Timestamp`/`GeoPoint` in the schema)** — rejected; the
  `{lat, lng}` / `Date` convention lets one schema serve both SDKs and stay
  JSON-serializable for logs.
- **Lenient reads (coerce/passthrough)** — rejected; with no users, throwing on
  drift surfaces bugs immediately.
- **Staged multi-PR rollout** — rejected at this scale; landed as one migration.

## What this binds

- Coordinate pairs are the **only** plain object allowed to be exactly
  `{lat: number, lng: number}` — anything else gets wrapped in a `GeoPoint` on
  write. Do not introduce non-coordinate `{lat, lng}` objects.
- New collections must add a schema-first model, a client+admin converter pair,
  and ref-factory entries. No `collection(getDb(), '...')` or raw
  `db.collection('...')` outside `refs/`; no new `map<X>Doc`.
- `setDoc`/`addDoc` payloads must be plain models (`Date`, not
  `serverTimestamp()`) — the converter's write-side `parse` will throw
  otherwise. `updateDoc` bypasses the converter, so FieldValue sentinels stay
  legal there.

## Revisit when

- Beta launch nears → run the deferred audit + backfill against dev Firestore so
  strict reads don't crash on legacy seed data.
- Per-read parse cost shows up on a high-volume realtime listener.
- The test surface grows enough that typed fixture builders pay for themselves.
