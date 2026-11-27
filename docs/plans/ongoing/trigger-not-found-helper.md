# One helper for triggers whose subject was deleted

**Priority:** medium
**Landed:** none
**Gate:** none
**Next:** being built by worker in batch 2026-11-27-harvest (leader session orda-to-cultu)

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`).

**Goal:** a trigger that updates a document deleted in the meantime ends quietly on
NOT_FOUND instead of failing and retrying. `isNotFound` is copied into 6 handlers
(e.g. `functions/src/interaction/syncEntityInteractionCounts.ts`) while 48 files call
`.update(`.

Source: `~/githubs/ordago-app/ordago-apps` `docs/decisions/triggers-tolerate-a-deleted-subject.md`.

## Done when

One shared helper in `functions/src/shared/`, the copies replaced, every trigger
`.update(` on a doc that can be deleted under it uses it, and a short convention line
in `functions/` docs (or a lint) keeps new triggers on it. Tests per handler touched.
