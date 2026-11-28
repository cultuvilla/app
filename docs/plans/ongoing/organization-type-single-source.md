# Organization types: one list in shared, held equal to the rules

**Priority:** low — no defect has come from it yet; the cost shows up when a type is added, as `comisión` showed (two commits, seventeen files, thirteen of them code or tests)

**Landed:** none
**Gate:** none
**Next:** add the parity test for the rules and backfill type lists, then the display helpers in OrganizationDataModel.ts

**Goal:** keep the organization-type facts the app, the read site, the rules and one backfill each copy in one place in `packages/shared`, with a test that fails when `firestore.rules` disagrees. Then the next type is one enum edit plus whatever the tests name, not a hunt through the code.

## Context

As of `39d69b5a` (origin/develop, 2026-11-28).

`OrganizationTypeSchema` (`packages/shared/src/models/organization/OrganizationDataModel.ts`) stores accented ids: `ayuntamiento`, `peña`, `asociación`, `otros`, `comisión`. Since `comisión` landed, a type a build doesn't know reads as `otros`. Changing the stored ids to ASCII would be a breaking stored-schema migration for no user gain, so this plan keeps them.

A literal comparison such as `o.type === 'peña'` is type-checked against the union, so a typo already fails `tsc`. What isn't checked is the set of **lists and rules that restate the types**:

- **Rules.** `firestore.rules` names the types three times: the create check in `isValidOrganizationCreate`, `orgHasSocioRoster`, and the org `update` type check. They should match `OrganizationTypeSchema.options`, `SOCIO_ROSTER_ORG_TYPES` (`SocioDataModel.ts`) and `PROPOSABLE_ORGANIZATION_TYPES`. Rules tests check single types (`shapeRules.test.ts` "accepts a comisión de festejos", `organizationUpdateRules.test.ts`, `socioRules.test.ts`). No test compares the lists.
- **Backfill.** `scripts/backfill-socio-roster.mjs` keeps its own `ROSTER_ORG_TYPES` set.
- **The peña/grupos split.** "A peña gets its own row, everything else goes under Grupos" is written twice: `penas`/`agrupaciones` in `VillageHomeBody.tsx`, and `grupos`/`penas` in `ProfileView.tsx`.
- **The comisión card.** The comisión card shows its label instead of the member count, and that rule is written twice. The app does it in `VillageHomeBody.tsx` (`t('organization.comisión')`). The read site does it in `functions/src/web/data.ts` `orgCard`, using the hardcoded `COMISION_LABEL`. That label duplicates the catalog entry `organization.comisión`, even though the read site already reads the catalog through `msg` in `./copy`. The comment in `pages.ts` says `ORG_TYPE` can't use the catalog because `otros` reads «Entidad» on the web. That holds for `otros` only.
- **URL aliases.** `TYPE_ALIASES` in `apps/mobile/app/[pueblo]/entidades.tsx` maps ASCII query values to types. Its producers write untyped strings: `AddContentSheet.tsx` (`'type=pena'`, `'type=asociacion'`) and the Maestro flow `e2e/native/flows/75-comision-de-festejos.yaml` (`entidades?type=comision`). Only one value is tested in jest: `VillageHomeBody.test.tsx` expects `/anaya/entidades?type=pena`.
- **A stale comment.** The comment on `OrgJoinPolicySchema` says "this is always `approval` and nothing here reads it". `5ba6c927` ("a group's admin picks whether joining needs acceptance") made that false: `docs/decisions/org-join-policy.md` makes it the admin's choice, and `entidad/[entidad]/index.tsx` reads `joinPolicy === 'open'`.

Adding `comisión` took `27098a5f` (step 2) and `3a17e25e` ("list the comisión de festejos under Grupos, not in its own row"). Between them they touched `VillageHomeBody.tsx`, `ProfileView.tsx`, `entidades.tsx`, `data.ts`, `pages.ts`, `es.json`, the rules and the model, plus their tests. The plan's own touch-point list (`ongoing/comision-de-festejos-type.md`) was the only thing that tracked them.

**Dependency category:** in-process (pure helpers) plus local-substitutable (the rules file is read as text in a test).

## Design

In `OrganizationDataModel.ts` (signatures illustrative):

- `orgHubRow(type): 'peñas' | 'grupos'`. `VillageHomeBody` and `ProfileView` use it instead of their own filters.
- `ORG_TYPE_QUERY: Record<OrganizationType, string>` (ASCII) and `orgTypeFromQuery(value): OrganizationType | undefined`. `entidades.tsx` uses the parser. `AddContentSheet` builds its hrefs from the map. This deletes `TYPE_ALIASES`.
- `showsTypeInsteadOfCount(type)`, true for `comisión`, for the card subtitle. The app and `orgCard` both use it. `orgCard` takes the label from `msg('organization.comisión')`, and `COMISION_LABEL` goes away (the text is identical). `pages.ts` imports it too, for `ORG_TYPE`'s `comisión` entry, which also switches to `msg`; `ORG_TYPE` keeps its deliberate `otros` → «Entidad» override, and the comment above it is narrowed to say only `otros` is the exception.
- The `OrgJoinPolicySchema` comment is rewritten to match `org-join-policy.md`.

**The parity test:** `packages/shared/test/ci/orgTypeRulesParity.test.ts` (new) reads `firestore.rules` as text, the way `test/ci/*` already reads repo files. It extracts the three `in [...]` lists named above and asserts each one equals its TS constant. It asserts the same for `ROSTER_ORG_TYPES` in the backfill script, or the script imports `SOCIO_ROSTER_ORG_TYPES` from `@cultuvilla/shared/models`, as `audit-referential-integrity.mjs` and `check-dev-conformance.mjs` already import from the shared package. The existing `test/validation/rulesShapeContract.test.ts` pins rule key sets only, not enum lists, so it does not already cover this.

**Alternatives considered:**

- **ASCII stored ids:** lost. It is a breaking schema migration that every installed binary would have to survive, and it brings no user gain.
- **One `ORG_TYPE_TRAITS` table (row, roster, proposable, label key) that drives everything:** lost for now. With five types and four traits, a table is heavier than the helpers. Revisit if a sixth type arrives.
- **Generating the rules lists from TS:** lost. The repo writes rules by hand, and the parity test gives the same safety.

**Testing strategy:** pure cases for the three helpers, plus a round-trip `orgTypeFromQuery(ORG_TYPE_QUERY[t]) === t` for every type, in `test/models/organization/OrganizationDataModel.test.ts`. Add the rules-parity test. The existing `VillageHomeBody`, `ProfileView` and `homePage` tests should pass unchanged. That they pass is the proof that nothing visible moved.

## Paths

As of 2026-11-28:

- `packages/shared/src/models/organization/OrganizationDataModel.ts`, `packages/shared/test/models/organization/OrganizationDataModel.test.ts`
- `packages/shared/test/ci/orgTypeRulesParity.test.ts` (new; `test/ci/**` is already in `vitest.suites.ts`)
- `apps/mobile/components/feature/VillageHomeBody.tsx`, `apps/mobile/components/feature/profile/ProfileView.tsx`
- `apps/mobile/app/[pueblo]/entidades.tsx`, `apps/mobile/components/feature/AddContentSheet.tsx`
- `functions/src/web/data.ts`, `functions/src/web/pages.ts` (open PR #799 also edits `data.ts`; rebase on it if it lands first)
- `apps/mobile/e2e/native/flows/75-comision-de-festejos.yaml` (keeps `type=comision`; the round-trip test pins that value)
- `scripts/backfill-socio-roster.mjs`

## Approval

Pre-approved — "consolidating duplicates into one source of truth — where the copies disagree, only if the surviving behaviour is the documented or tested one". The copies agree today. Also "test and CI health — flakes, missing coverage, a broken lane" covers the parity test, and "docs, plans and comments that contradict the code" covers the `OrgJoinPolicySchema` comment. Nothing a user sees changes: the same rows, labels and links, and the web's «Entidad» stays.

## Out of scope

- Changing any rule, any stored value or any label. This includes aligning the web's «Entidad» with the app's «Otros», which is copy and needs a yes.
- The org detail screen `entidad/[entidad]/index.tsx`. `entidad/__tests__/entidad.test.tsx` already covers it with 18 cases (join policy, consent, leaving). Its two October fixes, `d023822f` (invite banner first) and `d6e81b35` (empty group hides count and roster), have no screen-level regression test. That is a small test addition for whoever next touches the screen, not a plan.
- New organization types or the comisión-specific features (`ongoing/comision-de-festejos-type.md`).
