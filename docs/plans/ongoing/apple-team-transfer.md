# Apple team transfer — move the iOS app from Jaime's team to Álvaro's

**Priority:** high — Jaime's Apple membership renews on 2026-11-29 and the app must be out before it
**Landed:** dev
**Gate:** blocked:this plan's code (#663) reaches prod, then Álvaro accepts in App Store Connect — a console step no agent can take
**Next:** the next release carries #663 to prod; then Álvaro accepts Cultuvilla, before 2026-11-29, and runs § On the day. Jaime's part is done (2026-11-17); `TESTFLIGHT_SUBMIT_PAUSED=true` since 2026-11-17

Decided 2026-10-03 (Álvaro, with Jaime's agreement): Cultuvilla's iOS app leaves
Jaime's Individual team for Álvaro's, in the same window as Órdago's, and later
moves on to the asociación's own Organisation account. The why, the second move
and what the asociación needs live in the private business repo
(`docs/plans/ready/ios-app-to-the-asociacion-account.md`). **This plan is the
code and the procedure for the first move.** Órdago runs the same transfer and
its plan is the worked procedure this one follows:
`ordago-apps/docs/plans/ongoing/apple-team-transfer.md`.

Decided 2026-11-15 (Álvaro): **in parallel with Órdago**, starting 2026-11-16,
rather than a week after Órdago's first build (which would have landed on Jaime's
renewal). Hand-off files go through Órdago's transfer bucket; the APNs Team ID
moves into the secret; the AASA lists both teams.

| | |
|---|---|
| Sending team (Jaime) | `78RB67NT38` |
| Receiving team (Álvaro) | `8HWS4483VD` |
| App Store app id | `6804756586` |
| Bundle id = Sign in with Apple client id | `com.cultuvilla.app` |
| Apple-sign-in users on prod | **2** of 316 Auth users on 2026-11-15, both with no other provider |
| APNs key on Jaime's team | `D9ANCTTW73` (in `APNS_AUTH_KEY`; also Órdago's) |
| Hand-off bucket | `gs://ordago-prod-apple-team-transfer/cultuvilla/` (Órdago's, private; Jaime can write it) |

## What is team-bound, and what this plan built for it

- **Sign in with Apple.** A user's `sub` is scoped to the team; after the
  transfer both Apple users would get a new `sub` and an empty account.
  [admin-apple-signin-migration.mjs](../../../scripts/admin-apple-signin-migration.mjs)
  runs Apple's TN3159 migration — `export` → `generate` → `exchange` → `relink` —
  ported from Órdago with its tests. Files live in
  `~/backups/cultuvilla/apple-team-transfer/` and identify users: never commit
  them or paste them into a chat. Every step resumes from what it wrote.
  `export` ran against prod on 2026-11-15 (2 rows) and is in the bucket.
- **Push.** Functions send APNs directly. The Team ID now travels **inside the
  `APNS_AUTH_KEY` secret** (`{ teamId, keyId, privateKey }`), written by
  [set-apns-key.mjs](../../../scripts/set-apns-key.mjs). Version 3 on dev, beta
  and prod (2026-11-15) is today's key stamped with `78RB67NT38`; old code
  ignores the field, so it changed nothing. A function binds the version that was
  latest when it was **deployed**, so the swap on the day is a new version plus a
  redeploy of the two push functions — no release.
  **The new code must be in prod before the transfer completes:** Apple stops
  honouring the old team's key for the app shortly after, on every installed
  build, and the old code cannot use a key from another team.
- **Universal links.** `web/well-known/{dev,beta,prod}/apple-app-site-association`
  list `8HWS4483VD` next to `78RB67NT38` (same paths): installed builds stay
  signed by Jaime's team until each user updates.
- **TestFlight.** Apple wants TestFlight empty for the whole transfer, and a
  merge to `beta` uploads to it. The repo variable
  **`TESTFLIGHT_SUBMIT_PAUSED=true`** now skips only the iOS job of
  beta-build-and-submit. On `main`, `STORE_RELEASE_PAUSED=true` (or `[skip-store]`)
  stops store binaries; backend and OTA still ship.
- **Left for after processing** (each needs the app on the new team): signing in
  EAS, the ASC API key secrets (`APPLE_ASC_*`, the Issuer ID is per team),
  `apps/mobile/eas.json` `submit.production.ios.appleTeamId`, and re-registering
  `com.cultuvilla.app.dev` / `com.cultuvilla.app.beta` on Álvaro's team — they do
  not move with the app.

## Where it stands (2026-11-15)

**Jaime already pressed Transfer for Cultuvilla on 2026-11-14** (Apple's request
mail reached Álvaro at 18:34 UTC; Órdago's at 17:29). Álvaro has until
**2027-01-13** to accept, so the order is now:

1. **Jaime makes the transfer ids now** (§ Jaime's part, steps 1–4), while the
   request is pending and the app is still on his team. No ids were made before
   he pressed: the export only existed from 2026-11-15. **If Apple refuses**
   (no key can be created for an app mid-transfer, or `invalid_client`): he
   cancels the transfer in App Store Connect, makes the ids, and presses Transfer
   again (step 5).
2. **The next release brings this plan's code to prod** — the APNs Team ID read
   from the secret. Accepting before it means iOS push is down until it lands.
3. **Álvaro accepts Cultuvilla** (§ On the day), only once 1 and 2 are done, and
   before 2026-11-29: Apple wants both accounts in good standing, and Jaime's
   membership renews that day.

**Accept attempted too early, 2026-11-18 ~20:00 CET** (from the Órdago session, on Álvaro's "accept now"): Apple refused it four times with `ITC.ATB.Agmnt.unableProcessRequest` ("no podemos procesar la solicitud"), so nothing changed and the offer still waits. Step 2 was not done either: the 1.12.0 release (#660) is still open, so #663 is not on prod. Do not retry until it is; if Apple still refuses then, check in App Store Connect (Jaime's side) that no Cultuvilla version or build is in review or processing.

Without the ids the 2 Apple users would lose their accounts for good: both hid
their email, and Apple gives them a new relay address under the new team, so
there is nothing to match them by.

## Jaime's part

**Done 2026-11-17**, without cancelling the transfer (Apple allowed the key mid-transfer):
Sign in with Apple key `GMXJM4XYU6` on `78RB67NT38`, `generate` → 2 transfer ids, uploaded
to the bucket (checked: 2 rows, both uids from the export). TestFlight testers: only Moisés
Rodríguez, on two addresses, was left when Jaime removed them; nothing else was noted.

Run with his own Claude Code from a clone of this public repo on `develop`
(`git clone https://github.com/cultuvilla/app.git`; only Node is needed — the two
steps he runs import nothing outside `scripts/`). Nothing he runs touches
Cultuvilla's Firebase.

1. **Sign in with Apple key on team `78RB67NT38`** — Certificates, Identifiers &
   Profiles → Keys → **+**, name `cultuvilla-user-migration`, tick **Sign in with
   Apple**, **Configure** → primary App ID `com.cultuvilla.app`. Download the
   `.p8` (once only) and note the Key ID. (Órdago's key `RM26RKYP24` is bound to
   `com.ordago.app` and cannot be reused.)
2. **Fetch the export:**
   ```bash
   mkdir -p -m 700 ~/backups/cultuvilla/apple-team-transfer
   gcloud storage cp gs://ordago-prod-apple-team-transfer/cultuvilla/apple-users.jsonl \
     ~/backups/cultuvilla/apple-team-transfer/ --project=ordago-prod
   ```
3. **Generate:**
   ```bash
   node scripts/admin-apple-signin-migration.mjs generate \
     --team-id=78RB67NT38 --key-id=<KEY_ID> --key-file=<path/AuthKey_KEY_ID.p8> \
     --target-team-id=8HWS4483VD
   ```
   It must end with `done — 2 transfer ids`.
4. **Upload:**
   ```bash
   gcloud storage cp ~/backups/cultuvilla/apple-team-transfer/transfer-ids.jsonl \
     gs://ordago-prod-apple-team-transfer/cultuvilla/transfer-ids.jsonl --project=ordago-prod
   ```
5. *(Done 2026-11-14 — only again if step 1 forced a cancel.)* **App Store Connect, Cultuvilla:** no version waiting for review, in review,
   pending release or processing; TestFlight → **export the testers to CSV**
   (internal and external groups) and send it to Álvaro; then turn TestFlight off,
   remove builds and testers, clear test information. Then **App Information →
   Transfer App** → Team ID `8HWS4483VD`, Apple Account
   `alvaro.francisco.gil@gmail.com`. Tell Álvaro.
6. Keep the `.p8` and `D9ANCTTW73` alive until Álvaro confirms the re-link and
   pushes from his key, for both apps.

TestFlight is already off for Cultuvilla (Apple refuses a transfer otherwise), so
**set `TESTFLIGHT_SUBMIT_PAUSED=true` before the next merge to `beta`** — that
release would otherwise try to upload a build to an app mid-transfer. Ask Jaime
whether he exported the testers before removing them.

## On the day (Álvaro)

1. **Accept** in App Store Connect (support URL, privacy policy URL, App Review
   contact); wait for *Processing App Transfer* (up to two business days).
2. **Re-link** — the tight stretch: a fresh Apple sign-in between completion and
   `relink --apply` gets an empty account. Create the Sign in with Apple key on
   `8HWS4483VD` (primary App ID `com.cultuvilla.app`), fetch the file (check its
   timestamp is the transfer day), then:
   ```bash
   gcloud storage cp gs://ordago-prod-apple-team-transfer/cultuvilla/transfer-ids.jsonl \
     ~/backups/cultuvilla/apple-team-transfer/ --project=ordago-prod
   node scripts/admin-apple-signin-migration.mjs exchange \
     --team-id=8HWS4483VD --key-id=<KEY_ID> --key-file=<path/AuthKey_KEY_ID.p8>
   node scripts/admin-apple-signin-migration.mjs relink --env=prod           # dry run: expect relink 2
   node scripts/admin-apple-signin-migration.mjs relink --env=prod --apply   # Álvaro's go
   ```
   Exit `3` means something is left by hand (`conflict`: delete the empty account
   after checking it owns nothing in Firestore, re-run).
3. **Push** — the APNs key `54D676WU4J` on `8HWS4483VD` already exists (Órdago's
   plan); a team key serves every app of the team:
   ```bash
   node scripts/set-apns-key.mjs --env=prod --team-id=8HWS4483VD --key-id=54D676WU4J --key-file=<AuthKey_54D676WU4J.p8>           # dry run
   node scripts/set-apns-key.mjs --env=prod --team-id=8HWS4483VD --key-id=54D676WU4J --key-file=<AuthKey_54D676WU4J.p8> --confirm
   firebase deploy --only functions:onNotificationCreated,functions:flushPushQueue --project=cultuvilla-prod   # from main, Álvaro's go
   ```
   Same on beta and dev (agent-runnable). Check a real push on an iPhone.
4. **Soon after:** `eas credentials -p ios` (production), new `APPLE_ASC_*`
   secrets from Álvaro's team, `eas.json` `appleTeamId`, register the dev/beta
   bundle ids, first build from the new team (every iOS user is signed out once:
   the keychain is team-scoped), import the testers CSV into TestFlight, unset
   `TESTFLIGHT_SUBMIT_PAUSED`.

**After the 60 days:** drop `78RB67NT38` from the AASA files once no supported
build carries it, delete `bucket/cultuvilla/`, the migration script with its lib,
test and fixtures, and retire this plan. `set-apns-key.mjs` stays for key rotation.
