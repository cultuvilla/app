# Data access, portability and deletion requests (RGPD art. 15, 17, 20)

The privacy policy (`docs/legal/politica-de-privacidad.md` §8) lets anyone ask
by email, at cultuvilla.app@gmail.com, for a copy of their data or for its
deletion. Deletion has a path in the app. Access and portability have none, so
an operator answers them with `pnpm admin:export-user`.

Both read one list: the account-deletion registry, `UID_CASCADE` in
[functions/src/account/cascade/registry.ts](../../functions/src/account/cascade/registry.ts).
It records every place a uid is stored and what deletion does with it, and
`accountDeletionCoverage.test.ts` fails when a collection or a uid field is
missing from it. The export reads that registry, never a copy, and
`scripts/__tests__/admin-export-user.test.mjs` fails when an entry is neither
exported nor listed as kept.

**Production runs are Álvaro's, one request at a time** (AGENTS.md § Approval).
Dev and beta are for trying the commands.

## Before anything: who is asking

- Answer only the email address on the account. The uid is the `users/{uid}`
  document whose `email` matches, or the Auth user with that email.
- A request from any other address gets a reply asking them to write from the
  account's own address, or to use the app.
- The legal deadline is one month from receipt.

## Access and portability: the export

```bash
pnpm admin:export-user --uid=<uid> --env=prod [--out-dir=<dir>]
```

- It **reads only**. The Firestore handle throws on every bulk write, and the
  script and its library call no document write (a test checks both).
- It writes one JSON file **outside the repo**, by default
  `<tmpdir>/cultuvilla-data-exports/export-user-<env>-<uid>-<time>.json` with
  mode 600. It refuses an `--out-dir` inside the repo.
- Credentials: `scripts/lib/env-credentials.mjs`. The dev service-account key
  cannot read Auth or Firestore, so pass the stored user credential:
  `GOOGLE_APPLICATION_CREDENTIALS=~/.config/cultuvilla/adc.json pnpm admin:export-user …`.
- It prints one count per registry entry, so you see what was found before
  you open the file.

What the file holds:

| Key              | What it is                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`           | The sign-in account: email, name, phone, providers, created and last sign-in dates.                                                                                                                           |
| `entries`        | One per registry entry that deletion removes, anonymises or leaves to a trigger. Each one holds the documents found and, for each document, its `path`, its `data` and `matchedOn` (the field that found it). |
| `storageObjects` | `gs://` URLs of their uploaded photos (`users/{uid}/`). These are listed, not copied. Download any the requester asks for with `gcloud storage cp`.                                                           |
| `retained`       | The entries deletion keeps on purpose (audit logs, the group's libro de socios, other people's records that point at them), each with the registry's reason. No documents are read for these.                 |

**Review the file before you send it.** A document is exported whole, and a few
of them also carry other people's data:

- `chat-messages` with `matchedOn: …replyTo.authorUid` is someone else's reply
  that quotes the user. Leave out the other person's message, or the whole
  document.
- `events`, `news` and `municipalities` that they co-organise or hold the
  Embajador title of carry the village's content around their own part.
  That content is public, but trim it if it isn't the requester's.

Then:

1. Reply from cultuvilla.app@gmail.com with the file attached. Machine-readable
   JSON covers portability.
2. If they ask what is kept and why, quote the `retained` reasons. They are the
   policy's §7 in detail.
3. Delete the file locally, and the sent copy too once the request is closed.

## Deletion

**The user's own flow comes first.** In the app: _Ajustes → Eliminar cuenta_.
It runs the `deleteAccount` callable
([functions/src/account/deleteAccount.ts](../../functions/src/account/deleteAccount.ts)),
which:

1. asks for a recent sign-in;
2. refuses while they are the only admin of a village or a group
   (`computeDeletionBlockers`), so the reply tells them to name someone else
   first;
3. runs every effect in the registry (`runUidCascade`), then deletes the Auth
   user.

The read site's `/legal/eliminar-cuenta` page says the same for someone without the
app at hand. Reply to an emailed deletion request with those steps.

**An operator path, only when the user cannot use the app** (lost phone, no
longer able to sign in) and Álvaro says yes for that request. It is the same
three steps, run as the Admin SDK, and nothing else. Never delete documents by
hand. No script for it exists yet. Building one is its own change, and it
loads the registry the way `scripts/lib/uid-cascade.mjs` does:

1. Confirm who is asking (above), then **export first** with
   `pnpm admin:export-user`. That is the record of what was there. It is not a
   backup to restore from.
2. Check blockers with `computeDeletionBlockers(db, uid)`. If it finds any,
   ask the user who should take over and move the role with
   `changeVillageMemberRole` / `changeOrgMemberRole` before going on.
3. Run `runUidCascade(db, uid)` from `functions/src/account/cascade/runner.ts`,
   then `getAuth().deleteUser(uid)`. Every effect is idempotent. A failure
   halfway is fixed by running the cascade again.
4. Verify: `pnpm admin:export-user` again should find only the trigger-owned
   entries emptying out and the `retained` list. Then delete both export files.

## When the registry changes

Nothing to do here. A new entry is exported by the next run. A target the
export cannot read (a companion with no anchor, a field no query reaches)
makes `planExport` throw and the export test fail, so the gap shows up in CI
and never as a smaller file.
