# The emulator CI job hangs to its 25-minute limit

**Priority:** high — every hang costs a 25-minute slot in the merge queue path and a manual re-run, and it hit two unrelated PRs in one morning

**Landed:** none
**Gate:** none
**Next:** read the cancelled runs' logs to find which suite was still running at the cutoff, reproduce it locally under `pnpm test`, and make the hung step fail fast with its name instead of hanging

## Context

As of 2026-11-28 on develop.

- `Emulator tests (integration + rules + functions)` in `.github/workflows/ci.yml` has `timeout-minutes: 25` and normally finishes in 8–12 minutes.
- Cancelled at the limit on 2026-11-28: run 46132686880 (PR #792, which only deletes two files; both attempts) and the first run of PR #800, whose worker saw `scripts:test` hanging after `import-socios`.
- Related flakes the same morning, possibly the same root (a trigger still running when a suite ends or the next starts): `organizationUpdateRules` "org admin edits imageURL" read `status` undefined (PR #804, run 46135328089), and the Functions emulator logs many `ZodError` + `socket hang up` lines in every run.

## Approval

Pre-approved: "test and CI health — flakes, missing coverage, a broken lane". Adds no CI job; a per-step timeout inside the existing job is fine.
