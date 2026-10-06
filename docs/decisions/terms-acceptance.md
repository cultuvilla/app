# Terms & Privacy acceptance at onboarding

## Context

The app collects personal data (persona profiles, account email/phone, event
registrations) but shipped with no Terms of Use, no Privacy Policy, and no consent
record. Spanish law (RGPD/LOPDGDD + LSSI-CE) requires a named data controller, a
lawful basis, and — in practice — a captured acceptance. Auth is passwordless
(email-link + Google), so there is no classic register form; see
[auth-and-persona-onboarding](auth-and-persona-onboarding.md).

## Decision

- **Consent is captured at onboarding, not at the auth screen.** The
  `complete-profile` step gates account creation on a consent `Checkbox`; submit
  stays disabled until it's ticked. Placement follows the persona-first onboarding
  model — the account doc is written in that step (`createUserProfile`), so that's
  where the acceptance is stamped.
- **The acceptance is versioned, not a boolean.** `users/{uid}` carries
  `termsAcceptedAt` (timestamp) + `termsVersion` (string). `CURRENT_TERMS_VERSION`
  in `@cultuvilla/shared/models/user` is the single source of truth; both the
  onboarding write and the in-app legal screens read it. This lets a future legal
  change bump the version and re-prompt stale-version users.
- **The screen never imports `firebase/*`.** `createUserProfile` defaults
  `termsAcceptedAt` to a server timestamp, so the onboarding screen passes only
  `termsVersion` — the service-layer boundary stays intact (no `serverTimestamp`
  re-export needed).
- **Future processors are disclosed up front.** The Privacy Policy names Google
  Analytics for Firebase + Crashlytics as processors even though they aren't wired
  yet, so adding them later doesn't force a version bump + re-prompt.
- **The legal text lives in the repo as one content module** (`packages/shared/src/legal/`),
  transcribed verbatim from `docs/legal/*.md`, rendered by one `LegalDocScreen`
  consumed by `/legal/terms`, `/legal/privacy`, and the user-menu Legal entries.

## Rejected alternatives

- **Login-screen placement.** Legally the strictest (before the Firebase Auth
  account exists), but it clutters the passwordless login screen and complicates the
  Google flow; onboarding is where data is first written, which is a defensible and
  simpler capture point.
- **Boolean or timestamp-only record.** Rejected — without a version we can't tell
  who accepted which text, so we couldn't cleanly re-prompt on a legal change.
- **Hosted web legal pages / separate per-document checkboxes.** One combined
  checkbox + in-app screens was chosen for the simplest compliant UX.

## What this binds

- New required `users` fields go through the strict Zod converter, so any schema
  addition must backfill existing docs (done here via
  `scripts/backfill-terms-acceptance.mjs`, since retired) and extend the `users` firestore.rules
  create/update/onboarding-merge allowlists — all in the same change.
- Never inline the version literal; read `CURRENT_TERMS_VERSION`.
- The `docs/legal/*.md` files are the source of truth; the content module transcribes
  them — edit both together.

## Revisit when

- The terms change substantively → bump `CURRENT_TERMS_VERSION` and build the
  re-acceptance gate (out of scope for v1.0: whole-app re-prompt vs next-login).
- The data controller formalizes into a company, or analytics/Crashlytics actually
  ship → update the Privacy Policy text (and the postal address placeholder, if the
  home address is replaced).
