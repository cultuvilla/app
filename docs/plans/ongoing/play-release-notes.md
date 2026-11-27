# Play "What's new" from the CHANGELOG, and a checked store listing

**Priority:** medium
**Landed:** none
**Gate:** none
**Next:** being built by worker in batch 2026-11-27-harvest (leader session orda-to-cultu)

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
