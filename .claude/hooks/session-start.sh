#!/bin/bash
# SessionStart: make a fresh checkout usable, and cost nothing on any other.
#
# A worktree a client spawns for a session (Remote Control's `--spawn worktree`,
# Claude Code on the web) is a bare checkout: git materializes tracked files
# only, so there is no node_modules, and tests, lint and typecheck fail with a
# quiet "cannot find module" that reads like a real bug. scripts/agent-env.sh
# installs only for worktrees made through it. This hook covers the rest.
#
# Each step runs only when its output is missing — a stat, not an install — so
# a checkout with deps starts in milliseconds. It never touches git state
# (.agents/_shared is a committed copy here, not a submodule). Best effort: a
# session must start even when an install fails, so every failure exits 0 with
# its reason on stderr. stdout is injected into the session's context, so it
# carries exactly one line, and only when something was installed.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0
[ -f package.json ] || exit 0

done_steps=()
failed_steps=()

# step <label> <path that proves it is done> <command...>
step() {
  local label="$1" proof="$2"
  shift 2
  [ -e "$proof" ] && return 0
  if "$@" >&2; then
    done_steps+=("$label")
  else
    failed_steps+=("$label")
    echo "session-start: '$*' failed — run it by hand before tests, lint or typecheck." >&2
  fi
}

# The same three steps as worktreeSetup in .agents/orchestrate.config.json.
step deps node_modules pnpm install --frozen-lockfile --prefer-offline --reporter=append-only
if [ -f functions/package.json ]; then
  step functions functions/node_modules npm --prefix functions ci --prefer-offline --no-audit --no-fund
fi
# Scripts and the functions build import @cultuvilla/shared from its dist.
# Building it needs the root deps, so it is skipped when their install failed.
if [ -d packages/shared ] && [ -d node_modules ]; then
  step shared packages/shared/dist pnpm shared:build
fi

if [ ${#done_steps[@]} -gt 0 ]; then
  echo "session-start: this checkout had no dependencies — installed: ${done_steps[*]}${failed_steps[0]:+ (failed: ${failed_steps[*]})}."
fi
exit 0
