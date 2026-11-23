---
name: touch-service
description: Procedure for adding, changing, or removing exports in `packages/shared/src/services/`. Use whenever a task involves modifying a service, adding a new query/mutation, or moving logic between services and Cloud Functions. Encodes the agent-first conventions that aren't visible from grep alone.
---

# Touch a service

The service layer is the single owner of Firestore access in client code. Treat it as the data contract for the rest of the app. See [AGENTS.md §1 Service-layer ownership](../../../AGENTS.md) for the rule.

## Pre-change

1. **Grep all call sites** of the function before changing it. Service exports usually have many callers across pages, hooks, and other services. The file you're editing is one of N.

   ```bash
   git grep -n 'serviceFunctionName(' apps/ packages/
   ```

2. **Read the services map** at [`packages/shared/src/services/_services-map.md`](../../../packages/shared/src/services/_services-map.md). Cross-file interactions, placement decisions, and denormalization edges live there — not in grep. If the domain you're touching is empty in the map or stale, fix it as part of your change.

3. **Models first.** Input/return shapes come from `packages/shared/src/models/`. If a model needs a field, change it there — don't widen the service signature with an inline shape.

## Where the code goes

4. **Stay in domain.** Events → `eventService.ts`; persons → `personService.ts`; village membership → `villageMemberService.ts`; etc. Cross-domain code = call across services, not merge them.

5. **Backend boundaries.** Writes that exceed Firestore rules belong in Cloud Functions, not the client service:
   - Cross-user writes (modifying another user's doc).
   - Denormalized aggregates (counters, fan-outs).
   - Trust-sensitive state (role grants, organizer-only flips, approval lifecycle).
   - Atomic multi-doc updates spanning security boundaries.

   See the `guardrail-enforcement` skill for the callable pattern.

6. **Don't create a new service file** unless the domain is genuinely new. Add to an existing one with a new banner section if needed. See [`add-firestore-collection`](../add-firestore-collection/SKILL.md) when the change introduces a whole new collection.

## Conventions inside the service

7. **Banner sections** match the existing style. Look at `eventService.ts` for the pattern: `// =====...` rule, then `// SECTION NAME`. Group exports by domain inside the file.

8. **Strict types on every export.** Explicit input + return. No `any` at boundaries. Use `unknown` if you truly don't know, then narrow.

9. **No silent fallbacks.** Return `null` / `[]` intentionally, or throw. Don't paper over Firestore failures with empty defaults — the bug becomes invisible.

10. **Listeners (`subscribeXxx`)** return their unsubscribe function. The caller owns lifecycle. Don't accumulate listeners in module-level state.

11. **Caching.** If the data is covered by a cache (e.g. an event-feed cache), invalidate on writes. Don't leave stale entries behind.

12. **Firebase imports live in services only.** The modular SDK (`firebase/firestore`, `firebase/storage`, `firebase/functions`, `firebase/auth`) must not appear in pages/hooks/components/utils outside `apps/web/contexts/AuthContext.tsx`. Enforced by `no-restricted-imports` in `apps/web/eslint.config.mjs`. If you need data outside services, expose it via a service function.

13. **Guardrails inside the function.** Validate state and refuse invalid calls. UI hiding a button is an optimisation, not a boundary — the service is the consistency boundary, and the trust boundary is the server. See `guardrail-enforcement`.

## Comments — agent-first

Default: **no JSDoc**. Names and types should carry intent. Add a one-line comment only when something is non-obvious to an agent reading the function:

- **Side effects** beyond the return value (writes other docs, calls a callable, invalidates cache).
- **Preconditions** not enforced by types (`throws if event is past`, `requires authenticated caller`).
- **Choose-between hints** when similar exports exist (`use this for X; use getXByVillage for Y`).
- **Deprecation** (`use X instead`).

Never write `Purpose / What it does / Used in / Returns` ceremony — it goes stale, burns tokens, and grep is more reliable.

## Required outputs of the change

14. **Vitest** in `packages/shared/test/services/<service>.test.ts`. New exports → new tests; changed behaviour → updated tests. Match the existing test style. This is enforced: `packages/shared/test/ci/serviceTestCoverage.test.ts` fails when an export no test names is missing from `packages/shared/test/services/untested-exports.json`, and when a listed one is now tested or gone. Test the new export; list it with `node scripts/lib/service-test-coverage.mjs --write` only if it is a thin wrapper with nothing worth asserting. Testing a listed export or deleting one → re-run `--write` and commit the shorter list.

15. **Firestore indexes** — a new query likely needs `firestore.indexes.json` updated. Flag the deploy (use the `firestore-deploy` skill).

16. **Services map** — if a new cross-service interaction appears, update [`_services-map.md`](../../../packages/shared/src/services/_services-map.md). Don't update for trivial additions; do update when changing entry-points or denormalization edges.

## Avoid

- Renaming exports without grepping every caller — TypeScript catches some, dynamic Firestore key usage hides the rest.
- Reaching into Firestore from a page/component/hook to "skip the service" — AGENTS.md violation; the lint rule will flag it.
- Smuggling business logic into `utils/` to avoid touching a service. Utils are pure helpers.
- Adding retrocompat shims when changing data shape. Call out the migration in the PR (see AGENTS.md "No retrocompat shims unless asked").

## When this skill applies

- A task says "add a query for X", "change <serviceFn>'s return shape", "move logic from <service> to <other>".
- A code review flags a service-layer issue.
- A new feature plan touches `packages/shared/src/services/`.

## Companion skills

- `add-firestore-collection` — when the change introduces a new collection that the service owns.
- `guardrail-enforcement` — when the write should be in a Cloud Function callable.
- `firestore-deploy` — when the change touches `firestore.indexes.json`.
