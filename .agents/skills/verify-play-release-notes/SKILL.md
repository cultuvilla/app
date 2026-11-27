---
name: verify-play-release-notes
description: Read what Google Play actually holds on a track — each release's status, version codes and "What's new" — with `pnpm play:notes:show`. Use when asked to check or verify Play release notes, when the CI step "Set the Play release notes" failed or warned, when Play shows empty, wrong or stale notes, or to confirm a release before promoting. Read-only; never writes to Play.
---

# Verify Play release notes

Production (`production-release.yml`) and the Cultuvilla Beta upload
(`beta-build-and-submit.yml`) set Play's es-ES "What's new" right after the
submit, with `scripts/push-play-release-notes.mjs`: the version's
`<!-- store-notes -->` block from `CHANGELOG.md`, flattened to plain text — the
same text the App Store gets — on the release whose versionCode was just built.
This skill reads back what is live.

## 1. Auth

First available wins: `--key-file <sa.json>`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`,
then user ADC (`~/.config/cultuvilla/adc.json`, then the system default).

User ADC needs the androidpublisher scope and a quota project, which the usual
`gcloud-cultuvilla` login lacks (the error says *insufficient authentication
scopes*). Álvaro logs in once, then stores it as the repo's ADC:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/androidpublisher
gcloud auth application-default set-quota-project cultuvilla-prod
cp ~/.config/gcloud/application_default_credentials.json ~/.config/cultuvilla/adc.json
```

His Google account must have Play Console access to the app. Never write a
service-account key to disk in the repo; one pasted into a chat is compromised.

## 2. Read

```bash
pnpm play:notes:show --profile production              # com.cultuvilla.app, production
pnpm play:notes:show --profile beta                    # com.cultuvilla.app.beta, internal
pnpm play:notes:show --profile production --version 1.14.0
```

`--profile` is an eas.json submit profile, so package and track come from where
EAS submitted. `--track` reads another track of the same app. Each release
prints `name`, `status`, `versionCodes`, `userFraction` and `releaseNotes <lang>`.
`releaseNotes: (none)` is the failure to diagnose.

## 3. Diagnose

- **Wrong release.** Several builds can carry one version (a rebuild). The push
  matched by the versionCode the run built; compare `versionCodes` with the run's
  *Read the built versionCode* step.
- **Wrong language pane.** Only `es-ES` is written; the Console may open on
  another language.
- **The step failed** ("no release with versionCode …"): the submit did not
  create a release on the track — check the *Build and submit* step. If it did
  and the notes are missing, re-run the step's command with the service account:
  `pnpm play:notes:push --profile <p> --version-code <n> --apply` (dry run
  without `--apply`). That is a write; on production it re-submits the release's
  review with the notes, so it is Álvaro's call.
- **403 scope / quota project / permission**, **401**: §1.

## 4. Rules

- This skill reads. The pusher writes; never run it with `--apply` as a check.
- Notes come from the CHANGELOG; never edit them only in the Play Console — the
  next release repeats the drift this replaced.
