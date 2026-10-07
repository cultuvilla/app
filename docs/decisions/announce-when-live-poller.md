# Announce a release only once the stores serve it; hold a breaking backend until then

**Decided 2026-10-06 (user)**, as items 3 and 4 of the release-workflow work.
Ported from ordago-apps (`announce-when-live-poller`, `release-step-holds`,
`defer-functions-deploy-to-announce`) and adapted: here nothing waits for a
human, and the hold applies only to breaking releases.

## The problem

`config/appVersion` holds two values installed apps act on:

- **`<platform>.latest`** — anything older gets the "hay una actualización"
  nudge.
- **`minSupported`** — the *wall*: anything older is blocked until it updates.

Both must describe what a user can actually **download**, and neither the repo
nor a deploy knows that — only the stores do. Every earlier answer got it wrong
in a different way:

1. **The deploy announced `app.config.ts`.** Prod said 1.3.0 while the App Store
   served 1.2.2, so every iOS user on the newest build was nudged towards nothing.
2. **A hand-edited `APP_STORE_VERSIONS` constant.** Correct only when someone
   remembered to edit it on the day a build went live, and a second copy of a
   fact that lives in the stores.
3. **The wall was a manual "Set App Version" dispatch.** It is easy to forget,
   and a `Breaking-Client:` change deployed its backend on the merge, days before
   any binary that copes with it was downloadable, so installed clients broke
   with no screen telling them why.

## The decision

### One source of truth: `config/appVersion`, written when a store says so

`APP_STORE_VERSIONS` is deleted. `latest` lives only in `config/appVersion`, and
the **announce poller** is the one writer that moves it, after asking the store.
Every deploy still rewrites the doc, but only to keep it well-formed: an omitted
`--latest` and an omitted `--min` both **preserve** what is stored. "Set App
Version" stays as the out-of-band correction.

### The release is recorded by the prod deploy

`deploy-firebase.yml` on prod, after hosting is out, writes
`_admin/announce/pending/prod`: `{ version, releaseSha, backendSha, breaking,
reasons, holdBackend, androidVersionCode, iosBuildNumber, announced }`. The path
has four segments, because a Firestore document needs an even count, and it sits
under `_admin/**`, which is closed to every client.

A version counts as **in flight** while it is above the lower of the two
announced `latest` values. A version both stores already serve records nothing.
Recording happens in the deploy and not in production-release.yml for two
reasons. The hold decision is made there. And a [skip-store] or Play-frozen
release still needs watching, because it can ship by hand later.
production-release.yml adds only the Android `versionCode` after its build, in
the one job there that holds prod credentials.

### The poller: `announce-when-live.yml`, every 30 minutes

A scheduled run always executes on the default branch (`develop`), but the
`production` environment, which holds prod's WIF variables, admits only `main`.
So the scheduled leg only dispatches the same workflow on `main`, and that run
does the work:

1. **A cheap exit.** One Firestore REST read. With nothing pending (almost every
   tick), it stops before any checkout or install.
2. **Ask each store** about the pending version:
   - **Android** is live when two Play Developer API answers agree about the
     `production` release holding the recorded `versionCode`:
     1. Its **release lifecycle** (`applications.tracks.releases.list`) is
        `RELEASE_LIFECYCLE_STATE_PUBLISHED`. This is Google's review state, and
        the only API that exposes it. `DRAFT`, `NOT_SENT_FOR_REVIEW`,
        `IN_REVIEW` and `APPROVED_NOT_PUBLISHED` are simply not live yet.
        `NOT_APPROVED` is not live either, and every tick warns and puts
        "Google Play rejected vX.Y.Z" in the run summary until someone fixes
        it in the Play Console. An unknown state is not live, with a warning.
     2. Its **rollout** on the edits API's track is `completed` at full
        rollout (Play omits `userFraction` at 100%). PUBLISHED alone also
        covers a staged or halted rollout, which not every user can install.
        The edits track alone is not enough either: eas.json submits with
        `releaseStatus: completed`, so it reads `completed` while Google is
        still reviewing.

     Without a recorded code, the release name is the fallback: Play names a
     release after the bundle's `versionName`, and EAS sets no name of its
     own. The rollout is then looked up by the versionCode the lifecycle
     matched. A recorded code that matches nothing is "not on the track yet",
     never a name match, which could be another build of the same version.
     Both calls use the `androidpublisher` scope.

     Until 2026-10-06 the poller had only the edits track and stood in for
     the review with a 48-hour soak after the first `completed` sighting. That
     was a heuristic, and a review longer than the soak would have announced a
     build nobody could install. The lifecycle endpoint replaced it.
   - **iOS** is live when the App Store version with that marketing version is
     `READY_FOR_SALE` (or `READY_FOR_DISTRIBUTION`, the newer name). A phased
     release counts, because anyone can download it from the listing.
3. **Announce each platform independently**: the first tick its store serves
   the version, that platform's `latest` moves to it. An iOS approval does not
   wait for Play. `latest` only ever moves up.
4. **Once both stores serve it:**
   - A **breaking** release raises `minSupported` to its version. The ceiling
     check still applies, and since `latest` is now that version on both
     platforms, the wall can never exceed what the stores serve.
   - A **held backend** still held at that point (the stores went live
     without `pnpm release:publish`) is dispatched: `deploy-prod.yml` with
     `backend_sha`, run on `main` and checking out the pinned commit.
   - The pending doc is cleared, but for a held release only by that deploy's
     own last step, once it has **succeeded**. `gh workflow run` only proves
     the dispatch was accepted. A deploy that fails a gate leaves the doc in
     place, and the poller dispatches it again after 6 hours
     (`DEPLOY_RETRY_HOURS`), with a warning.

**It fails safe.** A store it cannot ask (missing or malformed secret, API error, unknown
answer) counts as **not live**, with a warning, and the next tick asks again.
After 7 days each tick warns that the build looks stuck in review. Nothing is
ever announced on a guess, and nothing gives up silently.

### Breaking releases hold their backend

"Breaking" means a `Breaking-Client:` trailer on any non-merge commit since the
previous `vX.Y.Z` tag ([breaking-rollup.mjs](../../scripts/lib/breaking-rollup.mjs)).
`Breaking-Client-Exempt:` never counts, and neither do merge commits, which
carry PR bodies that may merely describe the trailer.

On prod, `deploy-firebase.yml`'s release plan **holds everything but the
indexes** of a breaking, in-flight release: backfills and the data gates, rules,
functions and hosting. Hosting is held with the functions it rewrites to:
shipped alone on 1.7.1, it pointed at a `readSite` prod had never run, and
cultuvilla.es answered 404 for six hours, privacy policy and account-deletion
page included. Google Play rejected the release for exactly that (2026-10-07).

**A breaking release is released by a person, in both stores at once**
(decided 2026-10-08, after 1.7.1). Play approved 1.7.1 and published it at
once, while Apple took another day, so Android users ran the new app against
the held backend. The stores must not publish on approval:

1. **Before the `beta → main` merge**, the user switches **Play managed
   publishing on**. Google has no API for that setting, so the promotion PR
   carries it as a checklist item and the auto-merge never merges a breaking
   release.
2. **The merge** ships only the store binaries and indexes. iOS is submitted
   with a **manual** App Store release (`--release-type=MANUAL`), and Play
   holds the build after approval.
3. **Once both stores approve** (Play `APPROVED_NOT_PUBLISHED`, App Store
   `PENDING_DEVELOPER_RELEASE`), the poller opens a GitHub issue,
   @-mentioning the `RELEASE_MANAGER` repo variable.
4. **The user releases it**, both at the same moment: **Publish** in the Play
   Console, and `pnpm release:publish` (`release-publish.yml`). That checks
   the approvals, runs this workflow with `held_backend` (backfills, gates,
   rules, functions, hosting), then releases iOS.
5. **The poller finishes it**: once both stores serve the version, it raises
   `minSupported` and announces, then closes the issue with a reminder to
   switch managed publishing **off**. While it stays on, an unheld release sits
   approved and unpublished, and the poller warns every tick.

The poller alerts once, by issue, if a held release goes live on one store
before the other has approved it. That is the 1.7.1 failure, usually because
managed publishing was off. If both stores go live without
`release:publish`, the poller still raises the wall and then dispatches the
held backend, as before. The wall comes first because a wall without its
backend only tells old clients to update, while a backend without its wall
breaks them with no explanation.

| Situation | Backend |
|---|---|
| beta, dev | always deploys on the merge |
| prod, not breaking | deploys on the merge; each store publishes on approval |
| prod, breaking, version in flight | **held** until `pnpm release:publish` |
| prod, breaking, nothing in flight (no bump) | deploys, with a warning: there is no binary to wait for, so a hold would last forever. Raise the wall by hand if clients break |
| `[auto-deploy]` in the merge commit | deploys on the merge (deliberate override) |
| a later push while a held release is still pending | **held too** (sticky), since it contains those commits |

**Only code already on `main` can be deployed this way.** `actions/checkout`
will fetch any commit the remote has, and the `production` environment's
branch rule guards only the workflow ref, not the commit checked out. So
deploy-firebase.yml refuses an explicit `ref` that is not an ancestor of
`origin/main`, before anything else runs. Without that check, a dispatch would
be a way to ship unreviewed functions and rules to prod.

### No deadlock with production-release.yml

production-release.yml's store jobs wait for *Deploy prod*'s `deploy` job to be
green. A held deploy **is** green: its functions step is skipped, not failed. So
the store jobs still ship the binaries that the held backend is waiting for.
The `backend` job reads the skipped step and reports `held`, and then the
**production OTA is skipped**. That OTA would put the new bundle on installed
binaries talking to the old backend, and every one of those binaries is walled
the moment the held backend ships anyway.

## Trade-offs, stated

- **Both stores now answer from their review state.** App Store
  `READY_FOR_SALE` and Play `PUBLISHED` at full rollout both mean a user can
  download the build. What remains is propagation: Play can take a little while
  after publishing to serve the update on every device. A user who opens the
  app in that window is nudged towards an update the store shows a moment
  later. If a store ever disagrees with what was announced, correct it with
  "Set App Version".

- **New binaries talk to the old backend while held.** That includes App
  Review's reviewer. Expand → migrate → contract keeps this safe: the release
  that removes something does not depend on anything new. A breaking release
  that also ships a new callable its UI depends on would show that feature
  broken until both stores are live. Ship it with `[auto-deploy]`, or split it.
- **A Play-frozen or [skip-store] release keeps its backend held** until it
  ships by hand and the stores serve it. This is deliberate: the hold protects
  exactly the users who cannot update yet.
- **Beta's `latest` is no longer moved by anything.** Beta testers update
  through TestFlight and the Play internal track, which nudge them themselves.
  A beta poller is a follow-up if that proves insufficient.

## Where it lives

- [scripts/lib/breaking-rollup.mjs](../../scripts/lib/breaking-rollup.mjs): the
  trailer rollup.
- [scripts/lib/announce.mjs](../../scripts/lib/announce.mjs): every decision,
  pure.
- [scripts/lib/announce-store.mjs](../../scripts/lib/announce-store.mjs): the
  Firestore and store-API halves.
- [scripts/lib/play.mjs](../../scripts/lib/play.mjs): the read-only Play client.
- [scripts/lib/announce-cli.mjs](../../scripts/lib/announce-cli.mjs): the
  commands and the step outputs the workflows branch on (`hold_backend`,
  `deploy_sha`), behind an injected context.
- [scripts/release-announce.mjs](../../scripts/release-announce.mjs): the entry
  point the workflows call, which binds that context to Firestore and the
  stores.
- Unit tests in `scripts/__tests__/{breaking-rollup,announce,announce-cli}.test.mjs`. The
  workflow wiring is locked by
  [announceWhenLive.test.ts](../../packages/shared/test/ci/announceWhenLive.test.ts).
