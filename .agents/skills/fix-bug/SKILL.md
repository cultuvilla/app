---
name: fix-bug
description: Procedure for fixing a reported bug in cultuvilla. Forces RED/GREEN — write the failing test first in the right harness (vitest for `packages/shared`, vitest emulator harness for `functions/`, `@firebase/rules-unit-testing` under `packages/shared/test/e2e/` for rules), then fix, then commit. Routes to `touch-service`, `guardrail-enforcement`, `firestore-deploy`, and `cloud-function-logging` for layer-specific work.
---

# Fix a bug

Red/green. The regression test is written **before** the fix and committed in the same commit — that's the proof.

## 1. Reproduce

Pin down: entry point (page / service / callable / trigger), inputs (IDs, account state), expected vs. actual, environment (dev / beta / prod — default dev). If you can't reproduce, don't code: ask the user, or check Cloud Logging (works-in-dev / fails-in-beta is almost always config or data drift, not code).

## 2. RED — write the failing test first

Pick the layer. The harness is already set up; use the existing one — don't introduce a new runner.

**Default to the smallest scope that can express the bug.** Vitest in `packages/shared/test/services/` runs in seconds; the emulator-backed harnesses take 30–90s to boot.

| Bug surface | Test home | Library | Command |
|---|---|---|---|
| Service / model / utils (pure logic) | `packages/shared/test/services/<name>.test.ts` or `models/<name>.test.ts` | vitest | `pnpm shared:test` (whole suite) — for a single file see existing scripts in `packages/shared/package.json` |
| Service ↔ Firestore (integration) | `packages/shared/test/integration/<name>.test.ts` | vitest + emulator harness | `pnpm test:integration` |
| Firestore rule | `packages/shared/test/e2e/<name>Rules.test.ts` | `@firebase/rules-unit-testing` | `pnpm test:rules` |
| Cloud Function (callable / trigger) | `functions/src/__tests__/<area>/<name>.test.ts` | vitest + emulator | `pnpm test:functions` |
| Web component / page / hook | _(deferred — no jest/RTL config yet)_ | — | document the manual repro in the commit body |

Naming: match the existing files in each directory. `describe` block names the bug (e.g. `'rejects organization update by non-admin (#issue)'`). Avoid generic `describe` blocks for regression tests — make them findable by symptom.

**Run the test, see it fail.** A test that passes before the fix is the wrong test.

## 3. Fix at the right layer

Match cause to layer; route to the companion skill — don't re-derive its rules:

| Cause | Companion skill |
|---|---|
| Service shape / missing filter / silent fallback | `touch-service` |
| Cross-user write or trust-sensitive state succeeds when it shouldn't | `guardrail-enforcement` (run `guardrail-audit` first if the gap looks feature-wide) |
| Firestore rule rejects valid write / accepts invalid one / missing index | `firestore-deploy` |
| `console.log` in a function fails CI / unstructured Cloud Logging | `cloud-function-logging` |

AGENTS.md non-negotiables that bug fixes commonly violate:

- **No silent fallbacks.** Don't catch-and-default the failure away — surface it.
- **Services are the only Firebase ingress in the client.** Don't reach Firestore from a page/hook/component to "skip the bug".
- **Models first.** If the shape is wrong, fix `packages/shared/src/models/` — don't widen a service signature inline.
- **No retrocompat shims** unless asked. If existing data is now invalid, call out the migration in the commit body.

## 4. GREEN — test passes, repro is gone

- New test passes (`pnpm shared:test` / `pnpm test:integration` / `pnpm test:rules` / `pnpm test:functions`).
- Re-walk the Step 1 repro in the actual app (the user runs `pnpm web:dev` — you do not — see AGENTS.md).
- For backend changes deployed to dev (rules / indexes / functions), confirm in Cloud Logging.

## 5. Web-only visual bugs (until web test config lands)

There's no jest/RTL config in `apps/web/` yet. If the bug is purely in a web component:

1. Extract any pure logic into `packages/shared/` and write a vitest there for the logic part.
2. Document the manual repro in the commit body — what to click, what's wrong, what should happen.
3. Open a follow-up flagged for "add web test config" in your suggestion (per AGENTS.md "Be proactive").

## 6. Commit

- One commit holds the regression test AND the fix. Reviewers (including future-Claude) should be able to see the test and confirm it would fail without the change.
- Use `fix(<scope>): <one-line summary>`. Body has the root-cause sentence and the repro path.
- Mention any `firestore.indexes.json` or rule change in the body so the deploy isn't missed (use `firestore-deploy`).

## Required outputs

- [ ] Failing test committed in the right harness per the table.
- [ ] Fix obeys AGENTS.md (no silent fallbacks, services-only ingress, models first).
- [ ] Original repro re-walked.
- [ ] Commit message: `fix(...)` prefix, root cause in the body.
- [ ] A user-visible fix: a QA entry in `docs/qa/pending/` (`release-qa` Part A), or one line saying the regression test proves it.

## Don't

- **Don't ship a fix without a test** (web-only visual bugs excepted — document the manual repro).
- **Don't write the test after the fix** — you'll write one that already passes. Red first.
- **Don't fix the symptom layer** when the cause lives one layer up. The contract is the bug.
- **Don't add a try/catch to silence the error** — that's a silent fallback, AGENTS.md violation.
- **Don't bundle a refactor or "while I'm here" cleanup** into the fix commit. Land it separately.

## Companion skills

- `touch-service`, `guardrail-enforcement`, `firestore-deploy`, `cloud-function-logging`.
