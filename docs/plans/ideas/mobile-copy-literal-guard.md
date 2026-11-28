# A test that keeps the app's visible copy in the i18n catalog

**Priority:** low — AGENTS.md lists "Spanish strings that escaped the i18n message catalog" as a PR flag, but nothing fails on one, and about twenty have escaped, most into shared primitives

**Goal:** a jest scan fails when a screen, component or hook in `apps/mobile` shows the user a hard-coded string (JSX text, or an `accessibilityLabel` / `accessibilityHint` / `placeholder` / `title` / `label` literal) instead of a `t()` key, and the strays it finds today move into `packages/i18n/messages/es.json` with the same wording.

## Context

As of `8d7a317b` (origin/develop, 2026-11-28).

AGENTS.md § i18n: "User-facing strings go through `useT()`; hardcoded Spanish is allowed only in dev-only admin surfaces". *Things to flag in PRs* repeats it, and *Be proactive* asks for a check instead of a written rule. Today the only catalog guards are `packages/i18n/test/{keyParity,usedKeys}.test.ts` (keys exist and are non-empty) and `apps/mobile/lib/__tests__/catalogCopy.test.ts` (count agreement for named keys). None looks at the call sites.

A grep plus a TypeScript-AST pass (the scan below, prototyped) over non-test `.tsx`/`.ts` under `apps/mobile/{app,components,lib}` finds these strays, most in shared primitives, so they repeat on every screen that uses them:
- `components/primitives/PasswordInput.tsx` — `accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}`
- `components/primitives/DateRangeField.tsx` — `'Toca el primer día'` / `'Ahora toca el último día'` (a `const` initialiser, line 61), and button text `Cancelar` / `Listo`
- `components/primitives/DateTimeField.tsx` — `accessibilityLabel="Cerrar"`, button text `Cancelar`
- `components/primitives/DateField.tsx` — button text `Cancelar`
- `components/primitives/BarrioPicker.tsx` — button text `Cancelar`
- `components/primitives/VillagePicker.tsx` — `placeholder="Buscar pueblo"`, JSX text `Sin resultados`, `Quitar`, `Cancelar`
- `components/primitives/CalendarDatePicker.tsx` — `WEEKDAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']` (three-letter abbreviations, a module `const`)
- `components/feature/NotificationRow.tsx` — `accessibilityLabel="No leído"`
- `components/feature/LegalDocScreen.tsx` — `` `Versión ${doc.version} · Última actualización: ${doc.updated}` ``
- `lib/useCallable.ts` — last-resort `Alert.alert('Error', message)` with fallback `'No se pudo completar la acción.'`
- `lib/export/rosterWorkbook.ts` — `'Sí' : 'No'` for boolean cells

Not strays: the stored `OrganizationType` values (`'peña'`, `'comisión'`, …) compared in `VillageHomeBody.tsx`, `ProfileView.tsx` and `entidades.tsx`'s `TYPE_ALIASES`, and `AuthHeader.tsx`'s `accessibilityLabel="Cultuvilla"` (the brand), `MembersList.tsx`'s `<VillageTitleBadge title="team">` (an enum prop that happens to be named `title`), and `components/auth/DevLoginButtons.tsx`'s `Dev · entrar como` (dev-only; its header says so). The scan must not flag data values, only what is rendered.

Most of the catalog strings already exist: `common.cancel` «Cancelar», `common.done` «Listo», `common.close` «Cerrar», `common.noResults` «Sin resultados», `common.yes`/`common.no`. Reuse those; only the rest need new keys.

The repo already has the scan pattern: `apps/mobile/__tests__/noTokenHexLiterals.test.ts` fails on a quoted hex in `app/` and `components/`, with an explicit allowlist.

## Design

A new `apps/mobile/__tests__/noHardcodedCopy.test.ts` parses each non-test `.ts`/`.tsx` under `app/`, `components/` and `lib/` with the TypeScript compiler API (`typescript ~5.9.2` is already a devDependency of `apps/mobile`, so a plain `require('typescript')` works in jest; `ts.createSourceFile(…, ScriptKind.TSX)` needs no program or tsconfig) and reports:
1. `JsxText` nodes with a letter in them;
2. string literals and template literals with literal letters in their static parts that are the value of a JSX attribute in a fixed set, or a JSX child expression, descending through `? :`, `??`, `||` and parentheses but not into calls (so `t('a.b')` keys and `x === 'peña'` comparisons stay quiet). The attribute set is `accessibilityLabel`, `accessibilityHint`, `placeholder`, `title`, `label`, `subtitle`, `message`;
3. string literals passed as the first two arguments of `Alert.alert(…)` (this catches `useCallable.ts`'s `'Error'`).

A prototype of exactly this over today's tree reports 17 hits and nothing else: 14 strays that sit in JSX, plus the three non-strays to allowlist. (The `.ts` pass for rule 3 adds `useCallable.ts`'s `'Error'`.)

It allowlists by `file:literal` in the test (the brand name, any dev-only admin surface AGENTS.md exempts), and fails listing every hit. Then each stray above moves into `es.json` under the component's existing namespace (`common.*` for the primitives), with the identical Spanish, so nothing a user sees changes. `CalendarDatePicker`'s weekday abbreviations: `format.ts` has no weekday helper today (`formatDate` styles give only `weekday: 'long'`), but it has `monthShortLabels()`, which derives «Ene»…«Dic» from `Intl` and capitalises; add its twin `weekdayShortLabels()` (Monday-first). `Intl.DateTimeFormat('es-ES', { weekday: 'short' })` gives «lun mar mié jue vie sáb dom», so capitalised it is exactly today's array — pin that in `packages/shared/test` so a Hermes/ICU difference shows.

Four strays are outside what the AST rule sees: `DateRangeField`'s `const` label, `CalendarDatePicker`'s array, `useCallable.ts`'s fallback message, and `rosterWorkbook.ts`'s `'Sí'`/`'No'` (a pure builder with no `t`; pass the two labels in from its callers, `lib/export/runExport.ts` and `components/feature/groups/AsambleaChecklist.tsx`, which can read `common.yes`/`common.no`). `useCallable.ts` is a hook, so its `'Error'` title and fallback read `useT()`. Move these by hand in the same change and note the gap (copy in variable initialisers) in the test's header.

**Alternatives considered:** `react/jsx-no-literals` from eslint-plugin-react catches JSX text but not `accessibilityLabel` props, where half the strays are, and adds a plugin; an accented-letter regex (what found the list above) misses unaccented Spanish like `"Cerrar"` and flags stored enum values.

**Testing strategy:** the scan is the test. Export its finder and unit-test it on inline source strings (a JSX text, a literal `accessibilityLabel`, an allowlisted enum comparison) so it is proven to fire and to stay quiet. `packages/i18n/test/usedKeys.test.ts` then confirms each new key exists.

## Paths

As of 2026-11-28:
- `apps/mobile/__tests__/noHardcodedCopy.test.ts` (new)
- `packages/i18n/messages/es.json`
- `apps/mobile/components/primitives/{PasswordInput,DateRangeField,DateTimeField,DateField,BarrioPicker,VillagePicker,CalendarDatePicker}.tsx`
- `packages/shared/src/utils/format.ts` (`weekdayShortLabels`) and its test
- `apps/mobile/components/feature/{NotificationRow,LegalDocScreen}.tsx`
- `apps/mobile/lib/useCallable.ts`, `apps/mobile/lib/export/{rosterWorkbook,runExport}.ts`, `apps/mobile/components/feature/groups/AsambleaChecklist.tsx`

## Approval

Pre-approved — "test and CI health — flakes, missing coverage, a broken lane" for the scan, and "debt and refactors that change nothing observable" for moving strings into the catalog with the same wording.

## Out of scope

`apps/studio` (no strays found today; add it to the scan later if it grows). Rewording any string. The `OrganizationType` literal comparisons (data values, not copy). Plurals: `i18n-count-plural-guard` (ongoing, PR #796) checks catalog *messages*, this checks *call sites*; they share only `es.json`. `bounded-text-scaling` (idea) is about font multipliers on `Text`, not copy.
