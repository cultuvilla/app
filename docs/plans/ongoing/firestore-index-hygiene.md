# Firestore index hygiene — remove orphaned indexes

**Priority:** low
**Landed:** dev
**Gate:** none
**Next:** run the beta orphan cleanup (a `--force` index deploy from a clean `origin/main`, with explicit go for a beta deploy) and re-verify live == file

**Goal:** make each environment's live composite indexes match `firestore.indexes.json`
exactly, and stop orphans from building up again.

CI deploys indexes **without `--force`**, so removing an index from the file never
removes it anywhere. The live project keeps it indefinitely, and every write to that
collection keeps paying to maintain it. The deploy log is the only symptom: *"there
are N indexes defined in your project that are not present in your firestore indexes
file"*.

## Done

- Audited all three envs against their branch's `firestore.indexes.json`
  (dev ↔ `develop`, beta/prod ↔ `main`).
- **Dev: 11 orphans deleted** with a `--force` index deploy from `origin/develop`
  at `ab0e7d1d`. Re-verified afterwards: 51 live = 51 declared, 0 orphans, 0 missing.

## Next steps

1. After the next `develop → beta` promotion deploys green, run the beta cleanup
   below and re-verify.
2. After the `beta → main` promotion deploys green, do the same on prod.
3. Add `--force` to the CI index deploy and a drift-check script (decided 2026-10-06, see *Stop the drift*) — only once beta and prod are clean. Then retire this plan.

## Why the cleanup waits

No technical blocker. The cleanup is gated on the promotions on purpose — see *Why not now*.

## Handoff

- A `--force` deploy is a beta/prod deploy, so it needs Álvaro's explicit go (the
  `firestore-deploy` skill refuses beta/prod by default).
- Always deploy from a clean checkout of the branch that env runs. `--force` deletes
  whatever that file doesn't declare, so a stale local file deletes live indexes.
  This nearly happened on 2026-09-11: the local `develop` predated two index
  additions.
- Reading indexes needs the pinned account:
  `--account cultuvilla.app@gmail.com` (the default ADC gets a 403).

## Rollout status

| Step | Dev | Beta | Prod |
|---|---|---|---|
| Orphans audited | ✅ 11 | ✅ 9 | ✅ 9 |
| Orphans deleted (`--force`) | ✅ | ⬜ after promotion | ⬜ after promotion |
| Re-verified: live == file | ✅ 51/51 | ⬜ | ⬜ |

Legend: ⬜ pending · ⏳ in progress · ✅ done · ⚠️ blocked

## What to delete on beta and prod

Beta and prod carry the same 9 orphans. **Delete 8, keep one:**

| Collection | Fields | Why it's dead |
|---|---|---|
| `newsComments` | postId, hidden, createdAt | collection unused; replaced by `comments` |
| `newsReports` | municipalityId, status, createdAt | collection unused; replaced by `contentReports` |
| `occupationProposals` | status, proposedAt | propose-then-approve flow retired |
| `organizationJoinRequests` | orgId, status | superseded by self-service join |
| `organizationJoinRequests` | status, requestedAt | ″ |
| `organizationJoinRequests` | userId, requestedAt | ″ |
| `comments` | entityKind, entityId, createdAt | both live comment queries also filter `parentCommentId` |
| `events` | organizationId, startDate | no query filters `organizationId` |
| ~~`events`~~ | ~~status, startDate~~ | **KEEP** — needed by `functions/src/events/eventReminders.ts` |

Checked against `origin/main` — the code running on prod and in the iOS 1.0.0 build —
on 2026-09-11. None of the 8 query shapes appears there, so deleting them cannot
break a released client. **Re-check `main` before running**, in case a new query has
started relying on one of them.

## Why not now

`main`'s index file doesn't declare `events status + startDate` yet; it arrives with
the push-notifications work in the next promotion. A `--force` deploy from today's
`main` would delete it, and the promotion would then have to rebuild it, leaving
event reminders failing until the build finished. Run the cleanup **after** each
promotion, when the branch's file already declares it. The deploy then deletes exactly
the 8 above.

## Commands

From a clean checkout of the env's branch, using the repo's account wrapper:

```bash
git worktree add --detach .claude/worktrees/index-cleanup origin/<beta|main>
cp .firebase-account .claude/worktrees/index-cleanup/
cd .claude/worktrees/index-cleanup
bash scripts/firebase.sh deploy --only firestore:indexes --project <beta|prod> --force --non-interactive
# The log must say "Deleting 8 indexes". Any other number means stop and re-audit.
```

Verify (live composite indexes vs the file, ignoring the implicit `__name__` field):

```bash
npx firebase firestore:indexes --project <cultuvilla-beta|cultuvilla-prod> \
  --account cultuvilla.app@gmail.com > /tmp/live.json
python3 - <<'EOF'
import json
def key(i):
    fs = [f for f in i['fields'] if f.get('fieldPath') != '__name__']
    return (i['collectionGroup'], i.get('queryScope', 'COLLECTION'),
            tuple((f.get('fieldPath'), f.get('order') or f.get('arrayConfig')) for f in fs))
live = {key(i) for i in json.load(open('/tmp/live.json'))['indexes']}
repo = {key(i) for i in json.load(open('firestore.indexes.json'))['indexes']}
print('orphans', len(live - repo), 'missing', len(repo - live))
EOF
```

## Stop the drift — adopted 2026-10-06 (user)

Decided: CI deploys indexes with `--force`, **after** beta and prod are both clean (steps 1–2), plus a `scripts/` drift check. The proposal as it was weighed:

Proposal: add `--force` to the "Deploy Firestore indexes" step in
[deploy-firebase.yml](../../../.github/workflows/deploy-firebase.yml), which would make
the file the only source of truth for every env.

- **For:** orphans can no longer accumulate. Removing an index already needs a human
  merge, because `firestore.indexes.json` is on the hard-stop list.
- **Against:** it also deletes any index someone creates by hand in the Firebase
  console, for example a hotfix made while a query was failing. That index would
  vanish on the next deploy unless it had also been added to the file.
- **Precondition:** each env must be clean first. Otherwise the first `--force` CI run
  deletes everything this plan audits, unreviewed, on a normal merge.

If adopted, move the verify snippet into a `scripts/` check so CI can report drift
rather than relying on someone reading the deploy log.
