# One content policy, checked against the rules emulator

**Priority:** medium — client/server permission drift has been fixed four times since August, and the last two were found only by E2E flows

**Goal:** put the "who may edit or delete this doc" answer in one pure function in `packages/shared`, and test it against `firestore.rules` in the emulator, so a button the server will refuse (or a missing button the server would allow) fails a test instead of reaching a user.

## Context

As of `83d0b039` (origin/develop, 2026-10-16).

The answer lives in three hooks and some inline expressions in the screens, and it reaches the server's answer only by hand:

- `apps/mobile/lib/auth/useEntityCapabilities.ts` → `canEdit(creatorId, organizerUserIds?)` and `canDelete(creatorId, status)`. Its doc comment says "Keep it in step with the `allow update` / `allow delete` clauses". Nothing checks that it does.
- `apps/mobile/lib/auth/useOrgCapabilities.ts` → `canManage` and `canDelete` for organizations, a separate copy of the same idea.
- Inline predicates: `canDeleteTerm` and the definition delete check `definition.createdBy === user.uid || canManage` in `apps/mobile/app/[pueblo]/palabra/[palabra].tsx`.
- `apps/mobile/lib/auth/__tests__/useEntityCapabilities.test.tsx` (174 lines) and `useOrgCapabilities.test.tsx` (97 lines) test the hooks with mocked role reads. 26 screen and component test files mock the hooks. The rules tests in `packages/shared/test/e2e/*Rules.test.ts` test the rules on their own. No test compares the two.

The commits that fixed this drift:

- `b7425f61` fix(mobile): let entity creators edit and withdraw their own places, barrios and carteles. Its message says: "The client was simply asking a narrower question than the server answers."
- `741da3d5` refactor(mobile): one canEdit predicate for every entity kind. Two of the four existing answers "disagreed with the server". This commit deleted `useEventOrganizer`, so a single `canEdit` for entity kinds already exists; what is missing is a check against the rules.
- `5f56ef7e` (2026-10-09) fix(news): show the delete button only to who may delete the article. "Found by E2E flow 80."
- `310aee6a` (2026-10-09) fix(orgs): show the group delete button only to who may delete it. "Found by E2E flow 74."

One divergence is still live: the client shows a delete it cannot perform. In `palabra/[palabra].tsx`, `canDeleteTerm = canManage || (isOwnTerm && definitionCount === 0)`. The `vocabularyTerms` delete rule also requires `status == 'active'` for the author, and the author can still read their own hidden term. So the author of a hidden term with no definitions gets a trash button that fails.

One divergence goes the other way, and this plan only records it. The client's news `canDelete` lets the author delete only while the post is `active`, which matches the hook's comment (and `b7425f61`'s "creator while still `active`"). The `deleteNewsPost` callable (`functions/src/news/deleteNewsPost.ts`) checks only author or admin, with no status check. `docs/decisions/delete-in-edit-flow.md` is silent on status: it says the callable is "authorized for the author, not just admins" and gates the button by "`canManage` (or author, for news)".

`docs/decisions/event-news-ownership-and-single-date.md` already requires the control predicate to be "identical everywhere (rules, `canEdit`, the walk-in function)". This plan adds the test that enforces that requirement.

**Dependency category:** in-process (the predicate) plus local-substitutable (`firestore.rules` runs in the emulator, which `pnpm test:rules` already drives through `useRulesTestEnv` and `test/helpers/roles.ts`).

## Design

**A pure policy in shared.** Add `packages/shared/src/policy/contentPolicy.ts` (new). The signature below is illustrative:

```ts
type Actor = { uid: string | null; isAppAdmin: boolean; isVillageAdmin: boolean; isVillageMember: boolean; isOrgAdmin?: boolean };
type PolicyKind = 'event' | 'news' | 'place' | 'barrio' | 'festivalPoster' | 'historyEntry'
                | 'organization' | 'vocabularyTerm' | 'vocabularyDefinition';
type PolicyDoc = { createdBy?: string | null; proposedBy?: string | null; organizerUserIds?: readonly string[];
                   status?: VisibilityStatus; definitionCount?: number };
can(action: 'edit' | 'delete' | 'moderate', kind: PolicyKind, actor: Actor, doc: PolicyDoc): boolean
```

- Each kind has one row in a table. The row says which field identifies the author (`createdBy` or `proposedBy`), whether named organizers count, the delete condition, and the server surface that answers the question: `rules`, `callable:deleteNewsPost`, or `update:cancel` for events, which are cancelled rather than deleted.
- The new table copies today's client answers exactly. The one change is the vocabulary-term `status == 'active'` clause, which is a defect fix.
- `useEntityCapabilities` and `useOrgCapabilities` become thin adapters. Each resolves the `Actor` (the role reads they already make) and exposes `can(action, kind, doc)`. Callers move from `canEdit(place.proposedBy)` to `can('edit', 'place', place)`, and the palabra screen loses its inline predicates.
- Following "no shims", the old `canEdit`/`canDelete` signatures are removed in the same change, and every caller listed under Paths moves.
- `canManage`, `isMember` and `uid` stay on the hook, because screens that are not entity screens (censo, comunidad, miembros, resumen) use them for role-mode UI.

**The parity test.** Add `packages/shared/test/e2e/contentPolicyParity.test.ts` (new), which runs under `pnpm test:rules`.

- It builds the matrix kind × actor (anon, stranger, member, author, named organizer, org admin, village admin, app admin) × status (`active`, `hidden`).
- For each case it seeds the doc, attempts a minimal valid update and a delete as that actor, and asserts that `assertSucceeds`/`assertFails` matches `can(...)`.
- Kinds whose client delete does not go through a rules delete are marked in the table, so the test cannot pass without checking them. News goes through the callable, and the test asserts the news rule's `delete: if false`. Events are cancelled through an update, so the test checks the cancel update. The events rule still allows a direct delete to the creator, named organizers and admins, with no status check, so the test also asserts that clause against the table's edit predicate.
- The news callable's missing status check goes in an explicit `KNOWN_DIVERGENCES` entry that links this plan. It stays visible without being silently "fixed".

**Alternatives considered:**

- **A. Minimal interface:** move only the two lambdas into shared and keep `canEdit(creatorId, organizers)`. This lost because the organization and vocabulary predicates would stay outside the policy, which is where the October drift happened.
- **C. Ports and adapters:** a policy service injected into screens. This lost because rules are a DSL and cannot share code with the client, so a port adds no seam the parity test does not already give.
- **Generate the client predicate from `firestore.rules`:** this lost because parsing the rules DSL is brittle, and the rules carry shape checks the client does not need.
- **Put the policy in `apps/mobile/lib/entities/registry.ts`:** this lost because the emulator tests in `packages/shared/test` cannot import mobile code, and `vocabularyTerm` and `vocabularyDefinition` are not entities. The registry keeps its icons.

**Testing strategy:**

- Add `packages/shared/test/policy/contentPolicy.test.ts` (new), which tests the table purely.
- Add the emulator parity test above.
- The predicate cases in `useEntityCapabilities.test.tsx` and `useOrgCapabilities.test.tsx` move to the pure test. The hook tests keep only actor resolution and `loading`. Replace them rather than adding a second layer of tests.
- Screen tests keep mocking the hook for UI wiring. They can then return `can: () => true/false` instead of hand-built capability objects.
- Run `pnpm test:rules`, `pnpm shared:test` and `pnpm app:test`.

## Paths

As of 2026-10-17:

- `packages/shared/src/policy/contentPolicy.ts` (new), `packages/shared/src/policy/index.ts` (new), and a `./policy` entry in the `packages/shared/package.json` exports, which lists every subpath explicitly
- `packages/shared/test/policy/contentPolicy.test.ts` (new), plus `test/policy/**/*.test.ts` in `UNIT_INCLUDE` in `packages/shared/vitest.suites.ts`. Without it `test/ci/testGateParity.test.ts` fails on the new directory.
- `packages/shared/test/e2e/contentPolicyParity.test.ts` (new)
- `apps/mobile/lib/auth/useEntityCapabilities.ts`, `apps/mobile/lib/auth/useOrgCapabilities.ts`, and their `__tests__/`
- `apps/mobile/app/[pueblo]/{lugar,barrio,cartel,acontecimiento,noticia,evento}/[*].tsx`, and the `editar.tsx` routes of `lugar`, `barrio`, `cartel` and `acontecimiento`. News and events are edited in `crear/`.
- `apps/mobile/app/[pueblo]/entidad/[entidad]/editar.tsx`, `apps/mobile/app/[pueblo]/palabra/[palabra].tsx`
- `apps/mobile/app/crear/evento.tsx`, `apps/mobile/app/crear/noticia.tsx`
- the screen tests under `apps/mobile/app/**/__tests__/` that mock `canEdit`/`canDelete`
- `docs/decisions/event-news-ownership-and-single-date.md` (change "`useEntityCapabilities().canEdit`" to the shared policy) and `docs/decisions/delete-in-edit-flow.md` (gating names)
- `changelog.d/vocabulary-hidden-term-delete.md` (new) for the one defect fix

## Approval

Pre-approved under three clauses:

- "debt and refactors that change nothing observable"
- "test and CI health — flakes, missing coverage, a broken lane"
- "consolidating duplicates into one source of truth — where the copies disagree, only if the surviving behaviour is the documented or tested one"

The single visible change, hiding the vocabulary-term trash button the rules refuse, falls under "fixing a defect whose correct behaviour is not in dispute" (the same class as `5f56ef7e`/`310aee6a`). No rule, callable or stored shape changes. No hard stop (`hardStop` is empty).

## Out of scope

- Changing any rule or callable. Aligning `deleteNewsPost` with the client's active-only author delete is a product rule (who may delete) and needs its own plan and yes. This plan only records it as a known divergence.
- Having Cloud Functions such as `deleteNewsPost` or the walk-in authorization import the policy. This is a natural follow-up once the parity test exists, but it would change the callable's behaviour.
- Persons and burial editing (`canEditPerson` in `lugar/[lugar].tsx`). It matches the `persons` rule today, and persons are not entities.
- Read visibility (who sees hidden content). That is decided by services and queries, not by edit/delete affordances.
