# Existing signup emails — retroactive send rollout

**Priority:** low
**Landed:** prod
**Gate:** decision:run the retroactive signup emails on prod (and on beta, still undecided)?
**Next:** grant the prod runner access to `RESEND_API_KEY`, dry-run prod, review the recipient list, apply

## Done

Shipped and run on dev. Merged: PR #217 (`existing-signup-emails` backfill + template move to
`@cultuvilla/shared/email`)

## Handoff

No technical blocker — the prod run is a deliberate product decision, not a pending task someone forgot to code.

## Rollout status

| Step | Dev | Beta | Prod |
|---|---|---|---|
| `roles/secretmanager.secretAccessor` on `RESEND_API_KEY` | ✅ | ⬜ | ⬜ |
| Dry run (recipient list reviewed) | ✅ | ⬜ | ⬜ |
| `existing-signup-emails` applied | ✅ | ⬜ | ⬜ |

Legend: ⬜ pending · ⏳ in progress · ✅ done · ⚠️ blocked (note inline)

Dev, 2026-08-18: 2 open events, 4 recipients, 4 sent (all to
`xxpowervaroxx@gmail.com` / `cultuvilla.app@gmail.com`). A re-run reports
`would send 0 · already sent 4`.

---

## Why this doc exists

**Nothing enforces this one.** The backfill is `phase: 'none'`, so
`pnpm backfills:verify --env=prod` ignores it and no deploy is ever blocked by
its absence. That is the correct phase — `pre-deploy` means "the shipped
converters cannot read this env's data", and gating a prod deploy on a mail
blast would be wrong — but it means the only automatic reminder is the
`**Migration:**` marker in the CHANGELOG, which `prepare-release` lifts into the
promotion PRs. This doc is the second reminder.

**It also expires.** The job only mails events that have not finished
(`endBoundary > now`). Every event that ends between now and the prod run drops
off the list silently — the audience shrinks with every day it waits. There is
no ordering constraint against a deploy (the script renders from repo source,
not from deployed code), so it can run whenever.

## What it does

Walks every published event with `endBoundary > now`, groups its existing
registrations per user, and sends each of them the registration email with
`kind: 'existing_registration'` — subject *"Recordatorio de inscripción: …"*,
lead *"Te recordamos que estás apuntado a este evento."* One mail per user per
event, listing all their personas with waitlist positions intact. Skips
finished events, walk-ins (no account), and users with no address on file.

Safety, because emails cannot be unsent:

- dry run is the default and prints every recipient it would mail;
- each send writes `_admin/emailSends/existing-signup-emails/{eventId}__{userId}`,
  checked first — a crashed run resumes without mailing anyone twice;
- `autoApply: []`, so no deploy can ever trigger it;
- one send per 600 ms, under Resend's 2 req/s default limit.

## Running it

Per env, once:

```bash
gcloud secrets add-iam-policy-binding RESEND_API_KEY \
  --project=<villa-events|cultuvilla-beta|cultuvilla-prod> \
  --member=serviceAccount:<runner SA> \
  --role=roles/secretmanager.secretAccessor
```

The runner is `firebase-adminsdk-fbsvc@villa-events` locally; for beta/prod it
is the WIF deploy SA (`vars.GCP_SERVICE_ACCOUNT` in that GitHub Environment),
since Actions → **"Run Backfill"** is the only credentialed front door there.

Then dry-run, read the recipient list in the log, and only then apply:

```bash
node scripts/backfills-cli.mjs run --id=existing-signup-emails --env=prod --confirm
node scripts/backfills-cli.mjs run --id=existing-signup-emails --env=prod --confirm --apply
```

## Open question — beta

Beta holds real registrations from real testers, so a send there is not
automatically harmless. Dry-run it first and look at the addresses; skipping
beta entirely is a defensible answer, since beta's purpose is exercising the
code path and dev already did that.

## Retiring this plan

When prod has been applied (or the decision is explicitly "we are not sending
on prod"), delete this file. There is durable rationale worth keeping only if
the answer is "no" — in that case record why in `docs/decisions/`. Otherwise the
code, the registry, and the marker docs are the record.
