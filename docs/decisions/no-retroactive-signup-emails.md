# No retroactive sign-up emails

The registration email ("Inscripción confirmada") goes only to people who sign
up after it shipped (PR #217). Nobody who signed up earlier is mailed after the
fact.

## Problem

PR #217 shipped the live email together with a one-off job,
`existing-signup-emails`. That job mailed a "Recordatorio de inscripción" to
everyone already registered for an event that had not ended yet. It ran on dev
(4 test sends, 2026-08-18) but was never run on beta or prod. It sends email, so
no deploy gate tracked it, and an open plan was the only thing reminding anyone
that it hadn't run.

## Decision

Decided 2026-10-06 (user): **live confirmations only.** The job, its plan, and
the `existing_registration` reminder variant of the email template were
deleted.

- Its audience shrank with every event that ended. By October most of the
  summer fiestas were over, and few or no upcoming events on prod still held
  registrations from before the email existed.
- A reminder about a sign-up that is weeks old is worth little to the reader,
  and email cannot be unsent if the list turns out to be wrong.

The leftover dev markers under `_admin/emailSends/existing-signup-emails/` and
`_admin/backfills/markers/existing-signup-emails.dev` are inert.

If a catch-up send is ever wanted, git history has the script (rate-limited,
dry run by default, resumable by per-send marker).
