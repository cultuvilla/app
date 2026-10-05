---
name: firestore-deploy
description: Safely deploy Firestore rules, indexes, or Cloud Functions to the cultuvilla dev or beta Firebase projects. Use when the user asks to deploy any of these, or work needs a deploy. Dev and beta are agent-runnable (AGENTS.md § Approval); refuses prod deploys (CI handles those, or the user must approve that specific run) and the `deploy:all:*` umbrella scripts by default.
---

# Firestore deploy (dev and beta; prod is the user's)

Cultuvilla has three Firebase projects:

| Profile | Project ID | Script alias |
|---|---|---|
| dev | `villa-events` | `pnpm deploy:*:dev` |
| beta | `cultuvilla-beta` | `pnpm deploy:*:beta` |
| prod | `cultuvilla-prod` | `pnpm deploy:*:prod` |

Dev and beta are non-production: per AGENTS.md § Approval an agent deploys there without asking when its work needs it. Prod deploys come from CI on promotion, or need the user's explicit go for that specific run.

**Beta is the backend of the Cultuvilla Beta app real testers use**, and CI redeploys it from the `beta` branch on every promotion. So a manual beta deploy is for verifying something before it is promoted — ship from a checkout whose deployed files are `beta`'s plus your change, never a stale branch that would roll back what beta already runs — and the next promotion deploy supersedes it.

## Per-repo Firebase account (avoids `login:use` swap)

The Firebase CLI keeps the "current" account globally — it leaks across repos. To pin which Google account this repo uses on every `firebase` call:

1. **First-time setup (per operator):**
   ```bash
   echo 'your.email@example.com' > .firebase-account   # gitignored
   firebase login:add                                  # sign in with that same email
   ```
2. All `pnpm deploy:*` scripts route through `scripts/firebase.sh`, which injects `--account=$(cat .firebase-account)` on every call. The global `firebase login:use` setting is ignored.
3. Override for one command: `FIREBASE_ACCOUNT=other.email@example.com bash scripts/firebase.sh deploy --only ...`.

If a deploy fails with `Error: ... HTTP Error: 403, The caller does not have permission`, check `.firebase-account` is set to an account with the right IAM role on `villa-events` (or whichever project), and that `firebase login:list` shows that account as available (run `firebase login:add` if not).

## Hard refusals

Refuse and explain unless the user explicitly approves that specific run in this conversation:

- Any deploy to prod: `pnpm deploy:firestore:prod`, `pnpm deploy:functions:prod`, etc.
- Any `deploy:all:*` script (`deploy:all:dev`, `deploy:all:beta`, `deploy:all:prod`) — they deploy rules + indexes + functions + storage simultaneously; one bad commit lands everywhere at once. Prefer the narrowest script.
- Raw `firebase deploy --project <id>` bypassing the alias system.

If the user insists, repeat back what will be deployed and to which env, then require an explicit yes before running.

## Procedure

1. **Confirm active alias** — run `firebase use` (no args).

   ```bash
   firebase use
   ```

   If it prints `prod`, stop: switch to the env you meant (`firebase use dev` / `firebase use beta`) before going on.

2. **Show the diff** of the file(s) being deployed so unrelated changes don't ship silently:

   | Intent | Diff command |
   |---|---|
   | Rules | `git diff -- firestore.rules` |
   | Indexes | `git diff -- firestore.indexes.json` |
   | Storage rules | `git diff -- storage.rules` |
   | Functions | `git status functions/ && git diff -- functions/` |

   If unrelated changes are staged in those files, surface them — don't deploy silently.

3. **Run the narrowest pnpm script:**

   | Intent | Command |
   |---|---|
   | Firestore rules only | `pnpm deploy:rules:dev` |
   | Firestore indexes only | `pnpm deploy:indexes:dev` |
   | Both rules + indexes | `pnpm deploy:firestore:dev` |
   | Cloud Functions | `pnpm deploy:functions:dev` |

   Prefer rules-only or indexes-only over the combined `deploy:firestore:dev` when only one file changed.

4. **Post-deploy notes** to surface to the user:

   - **Indexes build asynchronously.** Readiness shows in the Firebase Console under Firestore → Indexes. Queries depending on a building index fail until ready.
   - **Rules propagate within ~60s.**
   - **Functions cold-start on the first invocation after deploy** — expect a slower-than-usual first call.

## Out of scope

- Rolling back a deploy. Direct the user to Firebase Console history; don't attempt automated rollback.
- Storage rules-only deploys via a dedicated script — `pnpm deploy:rules:*` covers rules and storage together in cultuvilla. If storage-only is needed, fall back to `firebase deploy --only storage --project dev` after the diff check, and flag it to the user.
- App/web deploys — use `pnpm deploy:hosting:<env>` (Firebase Hosting), which is outside this skill's `deploy:rules|indexes|firestore|functions` scope. Refuse a request to bundle hosting into a rules/indexes/functions deploy.

## Companion skills

- `add-firestore-collection` — when the deploy is part of landing a new collection (rules + indexes change in the same commit).
- `denormalized-read-model` — when a denorm trigger is part of the deploy.
- `guardrail-enforcement` — when a callable is part of the functions deploy.
