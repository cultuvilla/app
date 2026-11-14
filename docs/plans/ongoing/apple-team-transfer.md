# Apple team transfer — move the iOS app from Jaime's team to Álvaro's

**Priority:** high — Jaime's Apple membership renews on 2026-11-29 and the app must be out before it
**Landed:** none
**Gate:** blocked:Álvaro's go on the decisions in § Open decisions
**Next:** on the go: port Órdago's Sign in with Apple migration script, move the APNs Team ID into the `APNS_AUTH_KEY` secret, list both Team IDs in the AASA files; all three must be on `main` before Jaime presses Transfer

Decided 2026-10-03 (Álvaro, with Jaime's agreement): Cultuvilla's iOS app leaves
Jaime's Individual team for Álvaro's, in the same window as Órdago's, and later
moves on to the asociación's own Organisation account. The why, the second move
and what the asociación needs live in the private business repo
(`docs/plans/ready/ios-app-to-the-asociacion-account.md`). **This plan is the
code and the procedure for the first move.** Órdago runs the same transfer first
and its plan is the worked procedure this one follows:
`ordago-apps/docs/plans/ongoing/apple-team-transfer.md`.

| | |
|---|---|
| Sending team (Jaime) | `78RB67NT38` |
| Receiving team (Álvaro) | `8HWS4483VD` |
| App Store app id | `6804756586` |
| Bundle id = Sign in with Apple client id | `com.cultuvilla.app` |
| Apple-sign-in users on prod | **2** of 316 Auth users on 2026-11-14, both with no other provider |
| APNs key on Jaime's team | `D9ANCTTW73` (in the `APNS_AUTH_KEY` secret; also Órdago's) |

## What is team-bound here

Read from the code on 2026-11-14:

- **Sign in with Apple.** A user's `sub` is scoped to the team, so after the
  transfer both Apple users would get a new `sub` and Firebase would create an
  empty account. Apple's TN3159 migration (export → generate → exchange → relink)
  fixes it with no user action. With two users it is small, but it is the only
  fix that works before they next sign in.
- **Push.** Cultuvilla sends APNs directly from functions
  ([apnsTransport.ts](../../../functions/src/push/apnsTransport.ts)), with the
  Team ID **hardcoded** as `78RB67NT38` and the key from `APNS_AUTH_KEY`. Shortly
  after the transfer Apple stops honouring the old team's key for the app on every
  installed build, so iOS push is down until the new key **and** the new Team ID
  are live in prod. A hardcoded Team ID makes that a code release; moving it into
  the secret makes it a secret update plus a redeploy of the same commit.
- **Universal links.** `web/well-known/{dev,beta,prod}/apple-app-site-association`
  name only `78RB67NT38`. Installed builds stay signed by Jaime's team until each
  user updates, so prod must list both app IDs (same paths) through the change.
- **Store tooling.** `apps/mobile/eas.json` (`submit.production.ios.appleTeamId`),
  [appConfig.test.ts](../../../apps/mobile/__tests__/appConfig.test.ts),
  [build-ios-e2e-app.mjs](../../../scripts/build-ios-e2e-app.mjs); the ASC API key
  secrets the release workflows and the announce poller use (the Issuer ID is per
  team, so all of them change); distribution certificate and profiles in EAS.
- **Dev and beta bundle ids** (`com.cultuvilla.app.dev`, `com.cultuvilla.app.beta`) are registered on
  Jaime's team and do **not** move with the app: re-register them on Álvaro's team.
- **TestFlight.** A merge to `beta` uploads to TestFlight automatically and there
  is no iOS-only pause variable, so no release is cut between Jaime turning
  TestFlight off and the first build from Álvaro's team.

## Open decisions

1. **When.** Órdago's plan says Cultuvilla goes "about a week after Órdago's first
   build from Álvaro's team". Órdago is accepted on 2026-11-16, so that lands at or
   after the 2026-11-29 renewal — and Apple wants neither account changing around
   it. Proposed: Jaime presses Cultuvilla's Transfer as soon as Órdago's `relink`
   has succeeded (about 2026-11-18), which is the proof the scripts work.
2. **Sign in with Apple:** port Órdago's script (proposed) rather than repairing
   the two accounts by hand after they sign in.
3. **Hand-off file:** `transfer-ids.jsonl` (two lines, uids and transfer ids only)
   goes through the existing `gs://ordago-prod-apple-team-transfer` bucket under a
   `cultuvilla/` prefix, which Jaime can already write, rather than granting Jaime
   access to a Cultuvilla project.
4. **APNs Team ID into the secret** (`{ teamId, keyId, privateKey }`), shipped
   before the transfer.
5. **AASA:** prod lists both Team IDs; dev and beta switch to `8HWS4483VD` once
   their bundle ids are re-registered there.

## Before the day (repo work, must reach `main` first)

1. Port `scripts/admin-apple-signin-migration.js`, its lib and test from
   `ordago-apps` (only the client id, project ids and backup dir differ), after
   Órdago's own `exchange`/`relink` have run, carrying any fix they needed.
2. `parseApnsSecret` reads `teamId` from the secret; `apnsTransport` stops
   hardcoding it. Rewrite the prod secret with the current team first, so nothing
   changes until the day.
3. AASA prod with both app IDs.

## Jaime's part

As in Órdago's plan § Jaime's part, for `com.cultuvilla.app`: a Sign in with Apple
key with that primary App ID; `export` (Álvaro can run it and send the file);
`generate` with `--target-team-id=8HWS4483VD`; upload; then nothing in review,
TestFlight off with testers and groups written down; then **Transfer** to
`8HWS4483VD` / `alvaro.francisco.gil@gmail.com`. He revokes `D9ANCTTW73` only
after both apps push from Álvaro's key.

## On the day (Álvaro)

1. Accept in App Store Connect; wait for *Processing App Transfer*.
2. Create the Sign in with Apple key on `8HWS4483VD`; `exchange`; `relink` dry
   run; `relink --apply` (prod write: his go).
3. New `APNS_AUTH_KEY` version with the new key and `8HWS4483VD`, then redeploy
   prod functions from the same `main` commit (his go); check a real push on an
   iPhone.
4. Soon after: `eas credentials -p ios`, new ASC API key secrets, `eas.json`,
   re-register dev/beta bundle ids, first build from the new team, re-invite
   TestFlight testers.

**After the 60 days:** drop `78RB67NT38` from the AASA once no supported build is
signed by it, delete the migration script, and retire this plan.
