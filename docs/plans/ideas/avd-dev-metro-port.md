# avd-dev: `reverse` and `open` find the Metro this checkout runs

**Priority:** low — only bites when a second Cultuvilla Metro runs, and `METRO_PORT=<port>` works around it

**Goal:** `scripts/avd-dev.sh reverse` and `open` point the AVD at the port this checkout's Metro actually took, not at 8081.

## Context

Since #658 every Metro script starts on `scripts/metro-port.sh 8081`, so a second copy of the
app (an agent worktree, a tailnet one) comes up on 8091, 8101 … 8171 instead of prompting
(workspace decision `_workspace/docs/decisions/dev-port-series.md`). `avd-dev.sh` was left
behind: it sets `METRO_PORT=${METRO_PORT:-8081}`, so `reverse` forwards 8081 and `open`
deep-links the dev client to `http://localhost:8081`. With another Metro holding 8081, the
device silently loads that other checkout's bundle. Found while landing the port series
(2026-11-12).

## Design

When `METRO_PORT` is unset, `reverse` and `open` look for this checkout's Metro instead of
assuming 8081: walk the series 8081, 8091 … 8171, and take the first port whose listener's
process runs from this checkout (`ss -ltnp` gives the PID, `/proc/<pid>/cwd` the folder).
None found: fail with "no Metro running from <checkout>; start one with `avd-dev.sh metro`",
never fall back to 8081. `METRO_PORT` set still wins. Update the usage text (lines 15–19),
which still names 8081.

## Open questions

- Match by process cwd, or have `metro-port.sh`'s callers write the chosen port to a
  git-ignored file the other subcommands read? The file is simpler but goes stale when Metro dies.
- Under WSL2 the AVD's adb is Windows-side; the lookup runs Linux-side, so it should hold, but
  it is untested there.
