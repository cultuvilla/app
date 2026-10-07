---
name: prepare-release
description: Procedure for cutting a new beta/production release of the Cultuvilla mobile app with `pnpm release:cut` — writes the es-ES store notes, then one command bumps the version (develop gets the bump commit), stamps the CHANGELOG, branches `release/X.Y.Z` with main merged in, and opens the PR into beta with the migration checklist. Use whenever the user says "cut a beta", "prepare release", "bump the version for beta", "promote to beta", or wants the next version's CHANGELOG entry.
---

# Prepare a release

The version is set when develop is cut for beta (beta = release candidate) and rides unchanged into `main`. `pnpm release:cut` ([scripts/release-cut.mjs](../../../scripts/release-cut.mjs)) does the whole cut; this skill is the judgement around it.

Read the **"Versioning & releases"** section of `AGENTS.md` first; it is the source of truth for the policy.

## The flow

```
develop ──(bump commit X.Y.Z, pushed by release:cut)──┐
                                                      └─ release/X.Y.Z (+ merge origin/main) ──PR "X.Y.Z"──▶ beta
beta push → Deploy beta + beta-build-and-submit green ──▶ promote-to-main.yml opens PR "X.Y.Z" beta ──▶ main
```

- **develop carries the bump.** The cut pushes the bare-version commit straight to develop (it is generated, and the beta PR's CI runs the full gate on it), so develop's version is always the latest cut and no second PR has to land.
- **The release branch merges `main`.** beta and main are `strict`, and beta → main merge commits never reach develop, so a PR straight from develop would be behind beta.
- **CI guards it** (`version-gate.yml`): beta only takes `release/<the version it ships>`, main only takes `beta`, a release PR is titled with the bare version, and the version must exceed beta's.
- **The user merges both PRs.** Promotion PRs are a hard stop (`pr:land` exits 30 on them).

## 1. Ground yourself

- `git fetch origin && git log --oneline origin/beta..origin/develop --no-merges` — what this release carries.
- `git show origin/beta:apps/mobile/app.config.ts | grep version:` — what beta is on.
- Read the `[Unreleased]` section of `CHANGELOG.md` and every `changelog.d/*.md` fragment — together they become the release notes (`ls changelog.d/`; the README is not a fragment).

If develop is already at a version newer than beta with its CHANGELOG stamped (a bump landed earlier), `release:cut` releases that version and skips the bump — go to step 4.

## 2. Decide the version

`release:cut` proposes it from the conventional commits since beta: any breaking change (`type!:` or a `BREAKING CHANGE:` footer) → **major**, any `feat` → **minor**, otherwise **patch**. Override with `--bump=patch|minor|major` or `--version=X.Y.Z` when the user named one. A MAJOR is a redesign or a breaking migration — confirm it with the user rather than letting a stray `!` decide.

## 2b. Is the release breaking for installed clients?

A production release is **breaking** when any non-merge commit since the previous `vX.Y.Z` tag carries a `Breaking-Client:` trailer ([breaking-rollup.mjs](../../../scripts/lib/breaking-rollup.mjs)). On prod it is **released by hand**: switch Play managed publishing **on** before merging `beta → main`. Once both stores approve, an issue opens. Then press Publish in the Play Console and run `pnpm release:publish`, and switch managed publishing **off** when the issue closes. Until then its backfills, rules, functions and hosting are held, and the poller raises `minSupported` once both stores serve it (AGENTS.md → _Versioning & releases_). This is about installed binaries, not about semver: it does not by itself make the bump a MAJOR.

Check the range for anything an older installed client would hit and that no commit has declared yet:

```bash
git log --format='%h %s%n%b' "$(git describe --tags --abbrev=0 --match 'v*' origin/main)"..origin/develop --no-merges | grep -n 'Breaking-Client' || echo "nothing declared"
git diff --stat "$(git describe --tags --abbrev=0 --match 'v*' origin/main)"..origin/develop -- firestore.rules storage.rules functions/src/index.ts packages/shared/src/models
```

Declare it at the cut when the range carries a **rules change, a callable signature or removal, or a stored-shape change** that older installed clients would hit, and no commit carries the trailer already:

```bash
pnpm release:cut --breaking="drops the v1 joinVillage callable"
```

The reason must be one line, at most 83 characters (the trailer line stays within commitlint's 100). The bump commit becomes `X.Y.Z` plus that trailer. When develop already carries the version (no bump commit), the cut makes an empty `chore(release): declare X.Y.Z breaking` commit on develop to carry it instead. The release PR body says the release is declared breaking. If unsure whether a change strands old clients, ask the user: the wall is a product call.

## 3. Write the store notes

`release:cut` refuses an `[Unreleased]` without them — the App Store "What's New" is user-facing copy, not something a script invents. Add a short es-ES block (≤500 chars, no internals) at the top of `[Unreleased]`, and land it on develop like any CHANGELOG edit (Direct mode):

```markdown
## [Unreleased]

<!-- store-notes -->

- **Lo más visible:** una línea.
- Correcciones y mejoras.

<!-- /store-notes -->

```

The accumulated entries are the `changelog.d/` fragments; the cut appends them below this block and deletes them.

`extractReleaseNotes` (`scripts/lib/changelog-notes.mjs`) uses only this block; without it the whole section would ship as a wall of internal notes. If there are no fragments and `[Unreleased]` has no entries, ask the user what this release is.

## 4. Cut

From the base checkout, on an up-to-date, clean `develop`:

```bash
pnpm release:cut --dry-run      # version, branch, PR body — writes nothing
pnpm release:cut                # [--bump=… | --version=…] [--breaking="<reason>"]
```

It refuses a dirty tree, a branch other than develop, or a local develop that differs from `origin/develop`. It works in a throwaway worktree, so the checkout never leaves develop (it fast-forwards it to the bump commit at the end). If `main` conflicts with the release branch, it stops and says so — resolve on `release/X.Y.Z` by hand and push.

The PR body carries the CHANGELOG section and a checklist of every `**Migration:**` note in it. Add anything a human must verify on beta (native-only changes, manual checks) to the PR description.

## 5. Data migrations

A `**Migration:**` note names a backfill (AGENTS.md → _Backfills_). Registered `autoApply` backfills run inside the deploy before its conformance and backfill gates, so most need nothing. For each item on the checklist, check `pnpm backfills:list`: one **not** on `autoApply` must be run via **Actions → Run Backfill** (`ref: beta`, then `ref: main`) before that promotion's deploy, or its gate blocks. Note whether each is **crash-inducing** (a strict-converter / required-field change) or correctness-only.

## 6. After the merges

- **beta → main opens itself** once the beta deploy and the beta store builds for the merge are green (`promote-to-main.yml`), titled `X.Y.Z` with the same checklist and links to the runs. The user merges it — unless they have set the repo variable `AUTO_MERGE_TO_MAIN=true`, in which case `promote-to-main.yml` merges it itself once android-e2e, main's required checks and the soak are green (a `hold` label stops it). Agents never merge it.
- **The deploy and the store poller announce the version** (`config/appVersion.latest`) — never seed it by hand.
- **The `vX.Y.Z` tag is created by CI** once prod's deploy is green — never tag by hand.
