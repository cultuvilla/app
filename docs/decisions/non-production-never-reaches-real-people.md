# Non-production never reaches real people

Outside production, mail and push reach only people with an account in that
project's own Auth. Production is unchanged: it reaches anyone.

## Problem

Dev (`villa-events`) and beta (`cultuvilla-beta`) hold data that did not start
there: seed datasets with real-looking addresses, rows copied by hand from
another environment, a future script that moves more than it should. Every write
to that data fires the same triggers production runs, and those triggers mail
(event mails, cuota reminders, group messages) and push. Until 2026-11-27 the only
guard was the functions emulator: `sendEmail` skipped there, and push did not skip
at all. So a test registration on dev, against a user doc carrying a real address
or a device token copied from elsewhere, would have mailed or pushed a real
person. Decided 2026-11-27 (Álvaro), adopted from Órdago's record of the same name.

## Decision

**One module decides,
[`functions/src/shared/deliveryAudience.ts`](../../functions/src/shared/deliveryAudience.ts),
and both channels ask it before anything leaves:**

- **Mail** — `sendEmail` and `sendEmailBatch`
  ([`functions/src/shared/email.ts`](../../functions/src/shared/email.ts)), the
  one Resend transport for transactional mail. An address with no account in Auth
  (compared case-insensitively) is not sent and returns `skipped`; a batch sends
  the rest.
- **Push** — `deliverPush`
  ([`functions/src/push/deliverPush.ts`](../../functions/src/push/deliverPush.ts)),
  the single caller of both platform transports (FCM and APNs). A user with no
  account in Auth gets no push on any device; token docs are left untouched.

Each dropped send logs one line, `Delivery withheld outside production`, with
`handler`, `channel` (`email` | `push`), `projectId`, `reason` (`no-auth-account`
| `auth-lookup-failed`) and a count or `userId` — never an address.

**Fail-closed.** Only the production project id (`cultuvilla-prod`) opens the
gate; dev, beta, the emulator and an unrecognised project all get the restricted
audience. If Auth cannot be asked, the send is withheld. The project id is the
Admin SDK's own, then `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` / `GCP_PROJECT`.

### Why "an account in this project's Auth"

It is the one thing environments never share. Auth is per project and is not
copied by any seed, mirror or export, so however data arrived, its people have no
account here. Anyone actually testing on dev or beta signed in there — beta's real
testers signed in to the Cultuvilla Beta app — so they keep getting everything.

## What it does not cover

- **Sign-in mail** (`sendAuthSignInEmail`, `sendAuthOtpCode`) calls Resend
  directly and is not gated: it goes to the address someone just typed into that
  project's app, and it is how they get the account the gate asks for.
- **The founders' Telegram alerts** (`publishNotify`) go to the founders, not to
  users, and the homelab gateway pulls them from prod only.

## Consequences

- One Auth `getUsers` lookup per mail batch or per push outside production; none
  in production.
- Functions tests run as a non-production project, so a test that expects a mail
  or a push to leave must create the recipient in the Auth emulator.
- A new channel that reaches a person (SMS, WhatsApp, a webhook) asks
  `deliveryAudience` before it sends. That is the extension point, not a new gate.
