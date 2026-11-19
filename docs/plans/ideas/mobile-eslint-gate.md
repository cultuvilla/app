# Lint-gate invariants 1 and 5 in the mobile app and the studio

**Priority:** medium — the two largest client workspaces (~760 TS files in `apps/mobile` alone) hold two of the six architecture invariants by convention only, and a probe run already finds them broken
**Gate:** blocked:PR #680 (edits `completar-perfil.test.tsx` and `completar-perfil.tsx`, which hold 9 of the dead `eslint-disable` lines this plan deletes)

**Goal:** Give `apps/mobile` and `apps/studio` an ESLint config that enforces only the invariant rules (no Firebase SDK outside the seam and the auth boundary, no `any`), wired into `pnpm lint` and so into CI, so the next bypass fails a PR instead of waiting for a reviewer to spot it.

## Context

As of `129efeb7` (2026-11-20):

- `pnpm lint` is `pnpm shared:lint && pnpm functions:lint` (root `package.json`). Neither `apps/mobile` nor `apps/studio` has an ESLint config or a `lint` script; `ci.yml` runs `pnpm lint`, so CI checks neither. AGENTS.md says so itself (invariant 1: "`apps/mobile` has no ESLint config yet, so there the rule is convention"; invariant 5: "even though it isn't lint-gated yet").
- `packages/shared/eslint.config.mjs` has no custom rules: it is `typescript-eslint` `recommendedTypeChecked` + `strictTypeChecked` plus `@typescript-eslint/no-explicit-any`, `no-unused-vars` and a `@typescript-eslint/no-restricted-imports` block (`firebase/*`, `@firebase/*`, `@react-native-firebase/*`, type imports allowed, the seam `src/firebase/sdk/**` and `src/firebase/firebaseApp*.ts` exempt). `packages/shared/test/eslint/sdkSeamRule.test.ts` pins that block. `eslint@9.39.4` and `typescript-eslint@8.60.0` are already root devDependencies; `eslint-plugin-react-hooks` is not installed.
- A read-only probe (a throwaway non-type-checked flat config with those two rules, `reportUnusedDisableDirectives: 'error'`, run over `apps/mobile` and `apps/studio/src`, ~784 TS files) found:
  - **Raw SDK imports outside the sanctioned files:** `components/feature/VillageDiscovery.tsx` (`import type { QueryDocumentSnapshot } from 'firebase/firestore'`, for the cursor of `listMunicipalitiesPage`; the seam `@cultuvilla/shared/firebase/sdk/firestore` already re-exports it, as `municipalityService` uses). The others are the expected boundary files: `lib/auth/AuthContext.tsx` (exempt by invariant 1), `lib/firebaseInit.ts` and `app.config.ts` (type-only `FirebaseOptions`, the bootstrap and build config), `lib/observability/analytics.ts` and its `__tests__/analytics.native.test.ts` (`@react-native-firebase/analytics`, which has no seam twin).
  - **Seam reached from app code instead of a service:** `lib/observability/errorBridge.ts` calls `httpsCallable` from `@cultuvilla/shared/firebase/sdk/functions`; `lib/useOwnerSummary.ts` reads `refs/client` docs directly; `lib/auth/clearLocalCache.ts`, `lib/auth/legacySession.ts` reach `sdk/firestore` / `sdk/auth`. `sdk/errors` (`firebaseErrorCode`) is imported by six files, which AGENTS.md sanctions. `apps/studio` is clean: only `StudioAuth.tsx` (its exempt auth boundary) and `src/firebase.ts` (bootstrap) touch Firebase.
  - **`any`:** 4, all in tests — `app/ajustes/__tests__/cambiar-email.test.tsx` (`fillAndSubmit(getByLabelText: any, getByText: any, …)`) and `components/feature/censo/__tests__/censoEditorReducer.test.ts` (`(r[0] as any)` twice).
  - **Dead directives:** 29 `eslint-disable` comments silence rules nothing runs. 15 name rules a gate would report as unused (`@typescript-eslint/no-var-requires` ×8, deprecated since typescript-eslint 8.0.0 in favour of `no-require-imports` — still shipped in the installed 8.60.0, but enabled by nothing here; `no-require-imports` ×3; `no-this-alias` ×2; `no-non-null-assertion` ×1; `prefer-const` ×1). 14 name `react-hooks/exhaustive-deps`, which ESLint 9 rejects as an unknown rule unless the plugin is loaded.
- No plan in `docs/plans/` and no record in `docs/decisions/` mentions ESLint for the apps.

## Design

One flat config per app, **invariant rules only** — not a style ruleset, and not type-checked (`no-explicit-any` and `no-restricted-imports` need no type info, so 800 files lint in seconds):

- `@typescript-eslint/no-explicit-any: error`.
- `@typescript-eslint/no-restricted-imports: error` in two patterns, anchored to package names (the probe showed an unanchored `firebase/*` also matches `@cultuvilla/shared/firebase/...` and `./firebase`):
  1. raw SDKs — `firebase`, `firebase/*`, `@firebase/*`, `@react-native-firebase/*`, **type imports included** (invariant 1 sends types through `@cultuvilla/shared/firebase` too). Exempt files: `lib/auth/AuthContext.tsx`, `lib/firebaseInit.ts`, `app.config.ts`, `lib/observability/analytics.ts` (+ its test); in the studio, `src/auth/StudioAuth.tsx`.
  2. seam internals from app code — `@cultuvilla/shared/firebase/sdk/*` and `@cultuvilla/shared/firebase/refs/*`, with `sdk/errors` allowed. Today's importers (`firebaseInit.ts`, `lib/auth/**`, `errorBridge.ts`, `useOwnerSummary.ts`, their tests, and `components/feature/__tests__/LiveAvatar.test.tsx`, which imports `refs/client`) go in an explicit allowlist, so the gate lands green and only a *new* bypass fails. Moving `errorBridge` and `useOwnerSummary` behind a service is a follow-up, not this plan.
- `linterOptions.reportUnusedDisableDirectives: 'error'` so a silencing comment can't outlive its rule again.
- `eslint-plugin-react-hooks` (new devDependency) with `rules-of-hooks: error` and `exhaustive-deps: error`, so the 14 existing directives mean something; if `exhaustive-deps` surfaces more than a handful of new findings, the builder sets it to `off`, deletes those 14 directives, and notes it.
- Fix in the same change: `municipalityService` exports a `MunicipalityPageCursor` type alias and `VillageDiscovery.tsx` imports that (importing `QueryDocumentSnapshot` from `sdk/firestore` instead would itself trip pattern 2); type the 4 test `any`s; delete the 15 dead directives; ignore `.expo/**`, `android/**`, `ios/**`, `dist/**`.
- Wire it: `lint` script in both app `package.json`s, root `lint` becomes `shared:lint && functions:lint && app:lint && studio:lint` (CI already runs `pnpm lint`, so no workflow change). Update the two AGENTS.md sentences that say the apps aren't gated, and invariant 1's "The **only** exempt file is … AuthContext.tsx", which the exempt list above widens (bootstrap and analytics files).

**Alternatives considered:** `eslint-config-expo` / a full recommended ruleset — lands with hundreds of style findings in a 760-file app and turns a guardrail into a cleanup project; a later phase can add it. A grep test in jest (like `no-console.test.ts` in functions) — cheaper, but can't tell type imports from value imports, can't police `eslint-disable`, and duplicates what ESLint already does in the other two workspaces. Type-checked rules — slower and noisier for no extra coverage of these two invariants.

**Testing strategy:** a vitest test beside `packages/shared/test/eslint/sdkSeamRule.test.ts` that imports both app configs and pins the restricted groups, `allowTypeImports: false`, and the exact exempt/allowlist file sets — so widening an exemption is a visible diff, as for the shared seam rule. The gate itself is exercised by `pnpm lint` in CI.

## Paths

- `apps/mobile/eslint.config.mjs` (new), `apps/studio/eslint.config.mjs` (new)
- `apps/mobile/package.json`, `apps/studio/package.json`, `package.json`, `pnpm-lock.yaml`
- `packages/shared/test/eslint/appLintRules.test.ts` (new)
- `apps/mobile/components/feature/VillageDiscovery.tsx` (possibly `packages/shared/src/services/municipalityService.ts`)
- `apps/mobile/app/ajustes/__tests__/cambiar-email.test.tsx`, `apps/mobile/components/feature/censo/__tests__/censoEditorReducer.test.ts`
- dead directives: `apps/mobile/__tests__/appConfig.test.ts`, `apps/mobile/app/(onboarding)/__tests__/completar-perfil.test.tsx`, `apps/mobile/app/crear/evento.tsx`, `apps/mobile/components/feature/__tests__/MembershipVillageEditor.test.tsx`, `apps/mobile/lib/__tests__/imageCrop.test.ts`, `apps/mobile/lib/__tests__/images.test.ts`
- `AGENTS.md` (invariants 1 and 5)

## Approval

Pre-approved — "internal instrumentation and tooling no user sees — telemetry, log severity, diagnostics, scripts;" and "debt and refactors that change nothing observable". The only source change outside tests is a type-only import in `VillageDiscovery.tsx`, erased at build. No hard-stop paths.

## Out of scope

- Moving `errorBridge.ts`, `useOwnerSummary.ts` and `lib/auth/*` behind services (they are allowlisted, not fixed).
- A style or `recommended` ruleset, type-checked rules, lint-staged on commit.
- Any rule beyond invariants 1 and 5 (i18n, raw palette classes, primitives).
