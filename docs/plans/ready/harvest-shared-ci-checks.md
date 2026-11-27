# Five Órdago checks, shared through agent-skills

**Priority:** high

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`).

**Goal:** five checks Órdago already runs live once in agent-skills, are vendored into
Cultuvilla (and back into Órdago) and run in `ci.yml`, so neither repo copies them by hand.

## Source (`~/githubs/ordago-app/ordago-apps`/scripts)

| Check | What it catches here |
|---|---|
| `check-workflow-input-injection.js` | `${{ }}` an attacker could control inside a `run:` block. Live instance: `.github/workflows/run-backfill.yml` Summary step interpolates the free-text `inputs.id`; ~18 other `${{ inputs.* }}` in `run:` |
| `check-skill-symlinks.js` | a skill, script or hook symlink into `.agents/_shared` that no longer resolves (11 scripts, 5 skills, `.claude/hooks/guard-lander-kill.sh`) |
| `check-functions-loaded-memory.js` | the memory the Functions bundle takes just to load growing past a budget (Órdago lost 17 MiB to one top-level import and got OOM kills) |
| `check-maestro-scroll-then-tap.js` | a tap right after `scrollUntilVisible`, a flake source (~20 flows here use it) |
| `prune-merged-worktrees.sh` | landed or orphan worktrees left behind; `agent-reap.sh` reaps one worker at a time |

## Done when

- Each lives in agent-skills (repo-specific values in a config, not the script), with its
  tests; refreshed into both repos with `_workspace/scripts/vendor-agent-skills.py`.
  agent-skills is changed from its own checkout, one repo per commit.
- Cultuvilla's `ci.yml` runs the four checks (the prune script is a tool, not a gate).
- `run-backfill.yml` passes every input through `env:`; existing hits fixed or allowlisted
  with a reason.
- Órdago switches to the vendored copies in its own PR, or that step is filed there.
