# Village censo — per-village profile that gates registration

## Context

Each village (pueblo) needs a profile form ("censo") defined by its coordinador,
capturing pueblo-specific information (barrio, residency type, household, …)
without forcing it at account creation. Required censo fields gate event
registration *for that village*.

## Decision

- The censo schema lives on the municipality doc (`municipalities/{id}.profileForm`);
  a member's answers live in their own doc,
  `censoAnswers/{municipalityId}_{uid}`, readable by that member, the village's
  admins and app admins. The membership doc is world-readable, so it keeps only
  the completion flag (`profileCompletedAt`) and an always-empty legacy
  `profileAnswers: {}` that installed binaries still require to parse it. A
  trigger (`purgeMemberCensoAnswers`) deletes the answers when the membership
  ends. Schema is publicly readable.
- **Lazy fill, not signup-time.** Joining via invite never prompts the censo.
  It's filled any time from `/profile`, and **force-prompted on first event
  registration** if any required field is unanswered.
- The gate is enforced **server-side by a Cloud Function** on registration
  create (source of truth); the client redirect to the censo is a UX
  convenience.
- Fields are **predefined** (from a code registry,
  `profileFieldRegistry.ts`, with stable cross-village keys) or **custom**
  (coordinador-defined, village-local).
- **A custom `select`/`multiselect` field sources its options one of two ways,
  never both:** static `options: string[]` typed by the coordinador, **or**
  `optionsSource: 'barrios' | 'places' | 'organizations'` — options resolved
  live from that village's entities at render time (`censoFieldResolver.ts`
  `resolveFieldDisplay` + `useEntityOptions`). Dynamic options are not
  snapshotted, so a deleted entity shows as "(eliminado)" for members who had
  already selected it. `validateCensoUpdate` rejects a field that sets both
  `options` and `optionsSource`, or `optionsSource` on a non-choice type.
- **Schema edits after first answer:** a field can **always be removed, even
  once answered** — `updateCenso` erases that field's `profileAnswers.<key>`
  from every member's `censoAnswers` doc in the same batch (explicit, admin-confirmed erasure; we
  rejected soft-delete/archival and versioned schemas as over-engineering for a
  village censo). Mutating an answered field stays blocked: `type` and `key` are
  immutable, and select options can be appended but not removed once selected.
  Enforced in the builder UI, by a `validateCensoUpdate` Cloud Function
  (authoritative), and best-effort in rules.

## Rejected alternatives

- **Required censo at signup / account creation.** Rejected — pushes
  pueblo-specific friction onto every account; lazy fill defers it to the point
  of actual need (registration).
- **Storing the field registry in Firestore.** Predefined fields live in code so
  adding one ships to all villages atomically and keeps keys stable for future
  cross-village queries.

## What this binds

- "Is the censo complete" is computed by `membershipProfileService.isCensoComplete`
  — required-fields-filled, recomputed on every answer edit (clearing a required
  field re-gates on next registration, by design).
- Predefined keys are stable; reuse them rather than minting custom equivalents,
  so future cross-village reporting stays possible.
- The censo readers tolerate `options`/`optionsSource` arriving as `null` (the
  Firebase callable serializer encodes `undefined` object values as `null`);
  `CensoTypes.ts` preprocesses `null → undefined` so one field never crashes the
  whole municipality parse. Don't tighten those fields to reject `null`.

## Revisit when

- Per-event extra fields, per-user answer visibility opt-out, or a cross-village
  reporting UI are requested — all explicit non-goals today.
