# Play "What's new" from the CHANGELOG, and a checked store listing

**Priority:** medium
**Landed:** dev
**Gate:** release:1.14.0
**Next:** once that release reaches beta and main, check "Set the Play release notes" is green in beta-build-and-submit and production-release, then `pnpm play:notes:show --profile beta` and `--profile production` show the es-ES notes (ADC with the androidpublisher scope: the verify-play-release-notes skill)

State 2026-11-27: #768 merged — note steps for prod and Cultuvilla Beta through `scripts/lib/play.mjs`, read-back `pnpm play:notes:show`, `pnpm check:store-listing` in CI lint, manual `pnpm play:listing:push` (dry run unless `--apply`); `release:cut` refuses store notes over 500 characters. Open copy point for Álvaro: the ASC keywords «pueblo» and «agenda» repeat the subtitle (the check warns only).

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`). Split out of `ideas/store-release-pipeline.md` § 6.

**Goal:** release notes reach the App Store only (`scripts/lib/changelog-notes.mjs` →
ASC); Play ships with empty or stale notes. Push the same es-ES notes to Play and read
them back, and check `docs/store/listing-es-ES.md` against the stores' limits.

Source: `~/githubs/ordago-app/ordago-apps` `scripts/push-play-release-notes.js`, `show-play-release-notes.js`,
`push-play-listing.js`, `check-store-listing.js`, skill `verify-play-release-notes`.

## Done when

- The production release (and the Cultuvilla Beta upload) sets Play's notes from the
  version's CHANGELOG section through `scripts/lib/play.mjs`, with tests on the
  extraction and the edit calls.
- A read-back command shows what Play holds for a version.
- A CI check holds the listing to Play's and ASC's limits; pushing the listing stays a
  manual command.
