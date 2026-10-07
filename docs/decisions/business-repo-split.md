# The business record lives in its own private repo

**Decided 2026-09-29**, when the `cultuvilla` GitHub org was created. This repo
moved from `alvaro-francisco-gil/cultuvilla` to `cultuvilla/app`; the business
side moved out, history included, to the private `cultuvilla/business`.

## The decision

| Repo | Visibility | Holds |
|---|---|---|
| `cultuvilla/app` | public | the product: `apps/mobile`, `packages/*`, `functions/`, rules, CI |
| `cultuvilla/business` | private | the opportunity registry, the pueblo/fiestas market research, proposals, the legal-entity analysis, and the founders' panel |

The routing test is one question: **would this still be true if the codebase were
deleted and rewritten tomorrow?** Yes → business. No → here. It is the same test
the Órdago org uses between `ordago-apps` and `business`.

The app itself stays one monorepo. Mobile, shared and functions change together
(models, converters, backfills), and splitting them would turn every such change
into a cross-repo dance for no gain.

## Why

- **This repo is public, so business facts had nowhere private to live.** The
  registry, the scored collaborators and the proposals were all readable by
  anyone, and co-founder data for application forms could not be committed at
  all.
- **Business cadence was breaking product CI.** The panel's snapshot was committed
  into `functions/` and checked for staleness in `ci.yml`, so `develop` went red
  at midnight with no code change. Records change daily; code changes by PR.

## The one seam: the panel snapshot

The panel is a business tool, so it moved with the registry. What stays here is
the door, not the data:

```
cultuvilla/business  deploy.yml  →  Firestore villa-events: _admin/businessSnapshot { json }
cultuvilla/app       getBusinessSnapshot  →  checks admins/{uid}, returns the JSON
```

- The snapshot is stored as a **JSON string**, not a map: it nests arrays, which
  Firestore cannot hold.
- `_admin/**` is denied to every client by `firestore.rules`, so the callable is
  the only way a browser reads it.
- The callable owns only the access check. It decodes the JSON string and returns
  it, but never validates its shape: `BusinessSnapshotSchema` belongs to the
  business repo, which validates it on both ends (generator and panel). A shape
  change there needs no change here.

## Why the business repo has its own Workload Identity provider

This repo's `gha-deployer` service account is bound by **branch only**
(`attribute.ref/refs/heads/develop` etc.), so the `github` provider's
attribute condition is the only thing stopping another repo from deploying as it.
Adding `cultuvilla/business` to that condition would have let a `develop` branch
there deploy the whole app. Instead it has provider `github-business`, trusting
only `cultuvilla/business` on `refs/heads/main`, and a `business-publisher`
account that can write Firestore and deploy the `cultuvilla-panel` site —
nothing else. `scripts/setup-ci-deploy-wif.sh` here carries the same warning.

## Local layout

Both repos are checked out side by side, `~/githubs/cultuvilla/cultuvilla-app`
and `~/githubs/cultuvilla/cultuvilla-business`, and a session starts in the repo
the work belongs to (see *Sibling repos* in `AGENTS.md`). One session per repo is
what keeps a private fact from drifting into a public commit.
