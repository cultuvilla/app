# Ralph — Cultuvilla AFK development loop

A small loop that picks the next AFK slice from `implementation-queue/`, implements it with `superpowers:test-driven-development` (or `fix-bug` for bug slices), runs the tests, commits, and moves on.

Inspired by Matt Pocock's *ralph loop* (`ai-engineer-workshop-2026-project`) and ported from [ordago-apps/ralph/](../../../ordago-apps/ralph/), adapted to this repo's stack (pnpm monorepo, vitest, Firebase emulators, single-`main` flow).

## End-to-end flow

```
brief / GitHub issue body
        │
        ▼
managing-plans-lifecycle      →  docs/plans/ideas/<slug>.md                   (proposal)
        │
        ▼
break-down-into-slices        →  implementation-queue/<plan-slug>/000-prd-link.md
                                                                 /001-foo.md  [AFK]
                                                                 /002-bar.md  [HITL]
                                                                 /003-baz.md  [AFK]
        │
        ▼
./ralph/afk.sh N [--plan <slug>]  →  for each AFK slice:
                                     - switch to (or create) branch feat/<plan-slug>
                                     - TDD, commit
                                     - move slice to done/
                                     - push branch
                                     - open PR to main (or update existing)
        │
        ▼
You review the PR, optionally implement HITL slices on the same branch,
then merge to main.
```

## One plan = one branch = one PR (the integration model)

All slices belonging to the same plan share **one branch** named `feat/<plan-slug>` and **one PR** to `main`. Each slice becomes a separate commit inside that PR. Slice 2 does NOT branch off slice 1 — it commits on top of the same branch.

This is intentional. A "plan" is a feature; the slices are facets of that feature. They belong together at integration time.

- **Iteration 1** of Ralph on a plan: creates `feat/<plan-slug>` off `main`, implements slice 001, pushes, opens the PR.
- **Iteration 2**: reuses the existing branch (pulls latest, just in case you pushed something manually), implements slice 003 (if 002 is HITL or blocked), pushes, updates the PR body.
- **Iteration N**: same branch, more commits, PR body keeps updating to show progress.
- **HITL slices in the plan**: you implement them yourself on the same branch (`git switch feat/<plan-slug>`, work, commit, push). Next Ralph iteration sees your commits via `git pull --ff-only` and continues with whatever AFK slices are still pending.
- **All slices done**: PR body grows a `## Ready — All slices completed` note. The merge is your call. Ralph never merges.

`docs/plans/ideas/` is for proposals (per `managing-plans-lifecycle`). `implementation-queue/` is operational — the cola Ralph eats from. They live separately on purpose.

**Note on cultuvilla's direct-to-main policy:** the user is allowed to push directly to `main`. Ralph is not. Autonomous work always goes through a PR for human review — the PR is the safety mechanism that makes unattended iteration safe.

## How Ralph picks which slice to work on

Ralph does **not** pick a *plan*. It picks a *slice*, across whichever scope you give it.

Without `--plan`:
- Scans every `implementation-queue/<slug>/*.md` (skipping `done/`)
- Considers only `type: AFK` slices whose `blocked_by` are all completed
- Within that candidate set, prioritizes:
  1. Critical bugfixes
  2. Development infrastructure (tests, types, harness)
  3. Tracer bullets for new features
  4. Polish / quick wins
  5. Refactors
- Tie-break: slice with more downstream dependents wins (unblocking more is higher leverage)

With `--plan <slug>`:
- Same logic, but the scan is restricted to `implementation-queue/<slug>/`
- When that one plan is exhausted, the loop stops even if other plans have pending work

When no AFK slice is selectable in scope, Ralph emits `<promise>NO MORE TASKS</promise>` and `afk.sh` stops.

## Files

| Path | What |
|---|---|
| `ralph/prompt.md` | The instructions a single Ralph iteration follows |
| `ralph/once.sh [--plan <slug>]` | One interactive iteration via `claude --permission-mode acceptEdits` |
| `ralph/afk.sh <N> [--plan <slug>] [--in-worktree]` | Up to N non-interactive iterations, stops early on the sentinel |
| `implementation-queue/<slug>/` | Pending slices for plan `<slug>` |
| `implementation-queue/<slug>/done/` | Completed slices (Ralph moves them here) |

## Slice file shape

```markdown
---
type: AFK              # or HITL
plan: open-feed        # matches implementation-queue/<slug>/ directory
blocked_by: [001-trigger]   # other slice IDs; complete = in done/
allowed_paths:
  - "packages/shared/src/services/feedService.ts"
  - "packages/shared/test/services/feedService.test.ts"
forbidden_paths:
  - "functions/**"
  - "firestore.rules"
feedback_loop:
  - "pnpm test"
  - "pnpm --filter @cultuvilla/shared build"
budget_iterations: 3
---

# 002-feed-pagination

## Goal
Add cursor-based pagination to the open-feed service.

## Acceptance
- `feedService.listOpenItems({ cursor, limit })` returns `{ items, nextCursor }`
- Vitest covers: empty result, single page, multi-page, end-of-feed
- No breaking change to existing callers (default limit preserves current behavior)

## Notes
The Firestore index for `municipalityId asc, publishedAt desc` already exists.
```

## Safety rails (enforced by `prompt.md` + `afk.sh`)

- **Branch isolation** — Ralph only commits on `feat/<plan-slug>` branches off `main`. Refuses to push to or commit on `main` directly.
- **Push only the plan branch** — `git push -u origin feat/<plan-slug>` is the only push Ralph runs. No force-push, no push to protected branches.
- **PR opens automatically, never merges automatically** — Ralph runs `gh pr create` for the first slice and `gh pr edit --body` for subsequent ones. Merging is the human's call.
- **Path allow-list per slice** — every AFK slice declares `allowed_paths`. Touching anything outside escalates the slice to HITL instead of being silently widened.
- **Forbidden paths defense-in-depth** — even if a slice's own list omits them, Ralph refuses to touch `firestore.rules`, `firestore.indexes.json`, `functions/**`, `apps/mobile/app.config.ts`, `apps/mobile/eas.json`, `AGENTS.md`, `CHANGELOG.md`, `.github/workflows/**`, `scripts/deploy*.js`, `scripts/admin-*.js`, `scripts/seed*.{js,mjs,ts}`.
- **No deploys** — `pnpm deploy:*`, `firebase deploy`, `eas …` are all forbidden.
- **No dev servers or emulators** — per AGENTS.md "Never start dev servers": `pnpm web:dev`, `expo start`, `firebase emulators:start`, `pnpm test:integration|rules|functions|emulators` are forbidden.
- **No hook bypass, no amend, no rebase** — pre-commit hooks (Husky + lint-staged, commitlint) must pass. `--no-verify` is forbidden. Branch divergence escalates.
- **Two-strike rule on tests** — second consecutive red on the same slice escalates instead of looping.
- **Clean-tree precondition** — `afk.sh` refuses to start with a dirty working tree (override only with `--in-worktree` when you've created a worktree under `.claude/worktrees/<slot>/`).

## Typical session

```bash
# 1. Create a worktree under .claude/worktrees/<slot>/ (per AGENTS.md workflow rule #1)
#    The `using-git-worktrees` skill handles this — or manually:
git worktree add .claude/worktrees/ralph-feed -b ralph/feed origin/main
cd .claude/worktrees/ralph-feed

# 2. Make sure you have queued slices
ls implementation-queue/*/[0-9]*.md

# 3. Dry-run ONE iteration interactively (recommended the first time)
./ralph/once.sh --plan open-feed

# 4. Then let it run a batch
./ralph/afk.sh 5 --plan open-feed --in-worktree

# Or, multi-plan auto-mode:
./ralph/afk.sh 10 --in-worktree
```

When `afk.sh` exits, review the PR it opened (or updated):

```bash
gh pr list --base main --author '@me' --search 'in:title <plan-slug>'
gh pr view <pr-number>
gh pr diff <pr-number>
```

The PR body has a Progress table showing which slices landed and which are still pending. Implement remaining HITL slices on the same branch, then merge when ready.

If a PR looks wrong:

```bash
gh pr close <pr-number>                # close without merging
git push origin --delete feat/<slug>   # delete remote branch
git switch main && git branch -D feat/<slug>   # delete local branch
```

Then edit the relevant slice files and rerun Ralph.

## Sentinels Ralph emits

- `<promise>NO MORE TASKS</promise>` — no AFK slice with all `blocked_by` satisfied in current scope. `afk.sh` stops the loop.
- `Status: ESCALATED` in the final report — slice was bumped from AFK to HITL with iteration notes. `afk.sh` keeps going (other slices may still be AFK).
- `Status: PARTIAL` — Ralph hit `budget_iterations` mid-slice with real progress committed; next iteration continues that slice.
- `Status: COMPLETED` — slice file moved to `done/`, ready for PR review.

## When NOT to use Ralph

- Anything touching `firestore.rules`, `firestore.indexes.json`, `functions/**`, `apps/mobile/app.config.ts`, `eas.json`, native iOS/Android code, or release artifacts. Those are HITL by construction. (See the `guardrail-enforcement` and `firestore-deploy` skills for the human procedures.)
- Anything where visual judgment matters on mobile — Ralph can't drive an emulator (`parallel-agent-workflow` isolates Firebase emulators per worktree, but there is no per-slot Metro or AVD). For mobile UI work, write the slice but mark it HITL.
- Trust-sensitive state (organizer-role grants, admin actions, data migrations). See `guardrail-enforcement`.
- Anything where the PRD/slice is itself fuzzy. Garbage in → garbage commits. Sharpen the PRD first (use `superpowers:writing-plans`).

## Future work

- A `prd-to-slices` skill that converts a proposal under `docs/plans/ideas/` into a directory of slice files under `implementation-queue/<plan-slug>/` with `type`, `blocked_by`, `allowed_paths`, and `feedback_loop` filled in. Currently the user authors slice files by hand.
- Hook up cultuvilla's CI workflow (`.github/workflows/check.yml`) to the PR Ralph opens — currently `pnpm check` runs locally only.
- When per-slot Metro/AVD infrastructure exists (`parallel-agent-workflow` covers Firebase emulators only), revisit running Ralph against mobile slices.
