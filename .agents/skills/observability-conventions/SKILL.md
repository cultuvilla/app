---
name: observability-conventions
description: Use whenever adding or changing an analytics event, a `captureError`/`logger.*` call site, or anything that touches `packages/shared/src/services/observability/` or `functions/src/observability/`. Encodes the event-naming taxonomy review gate, the PII allowlist, the consent split, and the gcloud/Error-Reporting recipes for debugging client errors in Cloud Logging.
---

# Observability conventions

Cultuvilla's observability is a ports-and-adapters port
(`packages/shared/src/services/observability/observabilityService.ts`) consumed
by screens/hooks directly, wired to Firebase Analytics + a `logClientError`
Cloud Function callable by an app-level adapter
(`apps/mobile/lib/observability/configure.ts`). This skill is the reviewer
checklist for anything that touches it — not the architecture writeup (see
`packages/shared/src/services/_services-map.md` for that).

## The taxonomy review gate

Every event name is `<domain>.<action>.<outcome>` — e.g.
`village.join.success`, `event.signup.error`, `onboarding.age.gate`.

- **Add the name to `OBSERVABILITY_EVENTS` in `observabilityEvents.ts`, in the
  same PR as the call site.** Never inline an event-name string
  (`observability.trackEvent('village_joined', …)`) — the whole point of the
  const object is that every event name that has ever shipped is greppable in
  one file, and TypeScript catches a typo instead of shipping a
  Firebase Analytics no-op.
- Current product events:
  `onboarding.start.begin`, `onboarding.age.gate`,
  `onboarding.complete.success`, `village.join.success`,
  `village.join.error`, `event.signup.success`, `event.signup.error`,
  `org.create.success`, `org.create.error`, `content.detail.viewed`,
  `search.query.submitted`, `search.result.selected`, `org.invite.shared`,
  `org.join.success`, `org.join.error`, `app.exception.thrown`,
  `app.link.opened`.
- Reuse `<domain>` and `<action>` segments that already exist before minting
  new ones (`village`, `event`, `org`, `onboarding` are the current domains).
  If a new domain or action is genuinely needed, that's fine — just don't
  invent a fourth spelling of "success" (`ok`, `done`, `complete` — pick the
  one already in use: `success`).
- **Native sends `_` where web sends `.`.** GA4's native SDKs reject dotted
  names, so `apps/mobile/lib/observability/analytics.ts` maps
  `event.signup.success` → `event_signup_success`. Keep one catalogue; join the
  platforms in BigQuery with `REPLACE(event_name, '.', '_')`.
- A PR that adds a `trackEvent` call without a matching new/reused
  `OBSERVABILITY_EVENTS` entry should be blocked in review.

## The PII allowlist — never hash/scrub at the call site

`ALLOWED_CONTEXT_KEYS` in `observabilityService.ts` is the **single** allowlist
for what leaves the port:

```
uid, municipalityId, villageId, role, appVersion, platform, route, operation_id
```

`filterContext` drops everything else before an adapter ever sees it. If a
call site needs to pass a new field through to analytics/error context, add
the key to `ALLOWED_CONTEXT_KEYS` (and justify it isn't PII) rather than
smuggling it in under an existing key or bypassing `filterContext`.

Engagement analytics also allow `entityKind`, `entityId`, `surface`,
`resultCount`, and `viaInvite`. These are limited to doc ids, enums, counts,
and booleans. Search events must log only shape and selection context, never raw
query text, names, or any free-text/user content.

**Never hash or scrub a value yourself before logging it.** On the server,
`functions/src/shared/observability.ts` is the *one* chokepoint:
`log.info/warn/error` runs every call through `transformAttrs`, which HMAC-hashes
`attrs['user.id']` (with the `OBSERVABILITY_USER_ID_SALT` secret — see the
`gcloud-cultuvilla` skill for how that secret is created/rotated) and redacts
emails/phone numbers/token-shaped strings out of `attrs['error.message']`.
Domain code passes the **raw** uid and raw error message as `'user.id'` /
`'error.message'` — hashing/scrubbing twice would double-encode; hashing
inconsistently (some call sites raw, some pre-hashed) would break the whole
point of a single pseudonymization scheme. If you're tempted to write
`hashUserId(uid)` at a call site instead of passing `uid` through `attrs`,
that's the signal you're bypassing the chokepoint — don't.

## The consent split

- **`observability.trackEvent` is gated on `setConsent({ analytics })`.** If
  the user hasn't opted in (default: denied, per the `ConsentBar`), calls are
  silently dropped — no Firebase Analytics event fires. This is why product
  funnels can go quiet in dev if you haven't accepted the consent bar.
- **`observability.captureError` and `observability.logger.*` are NOT
  consent-gated.** Crash/error diagnosis and structured logging are treated as
  legitimate interest (keeping the app working), not marketing analytics, so
  they flow regardless of the analytics toggle. Don't add a consent check to
  these — that would silence exactly the signal you need when a user hasn't
  opted into analytics but is hitting a bug.

## Debugging: gcloud / Error Reporting recipes

Client errors bridge through the `logClientError` callable (auth-gated,
`us-central1`) which stamps the server-authenticated uid and logs at `ERROR`
severity with `handler: 'logClientError'`:

```bash
# All client errors, most recent first
gcloud logging read 'jsonPayload.handler="logClientError"' --project=villa-events --limit=50 \
  --format='value(timestamp,jsonPayload.error.name,jsonPayload.route,jsonPayload.appVersion)'

# Narrow to one route/screen
gcloud logging read 'jsonPayload.handler="logClientError" AND jsonPayload.route="/event/[id]"' \
  --project=villa-events --limit=50

# Narrow to one (hashed) user, once you have their hash from getUserIdHash
gcloud logging read 'jsonPayload.handler="logClientError" AND jsonPayload."user.id"="<hash>"' \
  --project=villa-events --limit=50
```

Because these entries land at `ERROR` severity with a stack-shaped
`error.stack` field, they auto-group into Cloud Error Reporting issues — check
there first for "is this a new error or a spike in an existing one" before
grepping raw logs. Configure an email notification on new/spiking error groups
as a one-time setup step (see the `gcloud-cultuvilla` skill's Secret Manager
section for the setup note); once set up, a spike shows up in your inbox
before a user reports it.

For beta/prod, add `--project=cultuvilla-beta` / `--project=cultuvilla-prod`
explicitly — same dev-default-prod-explicit rule as the rest of the
`gcloud-cultuvilla` skill.

## Don't

- Don't inline an event-name string — always go through `OBSERVABILITY_EVENTS`.
- Don't add a key to a `trackEvent`/`captureError` payload that isn't in
  `ALLOWED_CONTEXT_KEYS` and expect it to survive — `filterContext` drops it
  silently by design (fail-safe, not fail-loud, since this is a telemetry
  path, not a correctness path).
- Don't hash a uid or scrub a message string in application code — that's
  `functions/src/shared/observability.ts`'s job.
- Don't gate `captureError`/`logger.*` on consent — only `trackEvent` is
  consent-gated.
