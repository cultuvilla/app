# `@cultuvilla/shared` tests

Three layers, each with its own vitest config and runner.

| Layer | Location | Config | Command | Needs emulators |
|-------|----------|--------|---------|-----------------|
| **Unit (models)** | `test/models/` | `vitest.config.ts` | `pnpm test` | No |
| **Unit (services, mocked)** | `test/services/` | `vitest.config.ts` | `pnpm test` | No |
| **Integration** | `test/integration/` | `vitest.config.integration.ts` | `pnpm test:integration` (root) | Yes (firestore + auth) |
| **E2E rules** | `test/e2e/` | `vitest.config.e2e.ts` | `pnpm test:rules` (root) | Yes (firestore) |

## Shared scaffolding

- `setup/integration.setup.ts` — sets emulator host env vars before any import
- `setup/e2e.setup.ts` — same, scoped to rules tests
- `helpers/rulesTestEnv.ts` — mounts the live `firestore.rules` against the Firestore emulator. `useRulesTestEnv()` registers the standard suite lifecycle (initialize once in `beforeAll`, clear Firestore between tests in `beforeEach`, clean up in `afterAll`) and returns a getter for the live env; `createRulesTestEnv()` builds a one-off env when you need manual lifecycle control. With `RULES_COVERAGE_DIR` set (as `test:rules` and `test:all` do) its `afterAll` also saves the emulator's rule coverage for each `test/e2e/` file, which `scripts/check-rules-coverage.mjs` turns into a ratchet: every `allow` condition is seen granting and refusing, or is listed in `e2e/rules-uncovered.json` with why. An env from `createRulesTestEnv()` is not collected.
- `helpers/roles.ts` — auth-context helpers that name the actor at the call site: `asUser(env, uid)` / `asAnon(env)` return a Firestore client scoped to that identity, `asAdmin(env, uid)` seeds the `admins/{uid}` marker then returns that user's client, `seedAdmin(env, uid)` seeds the marker alone, and `seed(env, fn)` is a `withSecurityRulesDisabled` wrapper for setting up state a rule would otherwise forbid.
- `factories/villageFactory.ts`, `factories/userFactory.ts` — typed builders for test data

## Patterns

- **Reset, don't share state.** `useRulesTestEnv()` clears Firestore in a `beforeEach` so each test starts empty — call it at the top of the module.
- **Factories return data, tests persist.** Builders produce objects; the test decides where they go.
- **Rules tests bypass rules to seed.** Use `seed(env, …)` (a `withSecurityRulesDisabled` wrapper) to set up state, then exercise the rule under the role via `asUser` / `asAnon` / `asAdmin`.
