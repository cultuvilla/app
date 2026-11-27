#!/usr/bin/env bash
#
# Remove agent worktrees under <worktreesDir> whose branch has already landed on
# origin/<base> and that have nothing uncommitted. <worktreesDir> comes from
# .agents/orchestrate.config.json (default .claude/worktrees), <base> from
# .agents/land.config.json's baseBranch (default develop). A tool, not a gate:
# agent-reap.sh reaps one worker; this sweeps what earlier batches left behind.
#
# Both conditions are required. "Merged" alone is not enough: an agent can be
# mid-task on a branch whose earlier commits already landed, and its unstaged
# edits would go with the worktree. Anything dirty is reported and kept.
#
# Removing a worktree deletes no commits and no branch — re-create it with
# `git worktree add`. Dry run by default; pass --apply to actually remove.
#
# Usage: scripts/prune-merged-worktrees.sh [--apply]

set -euo pipefail

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

# The main checkout, even when run from inside a worktree.
cd "$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
config_value() {
  local file=".agents/$1" query="$2" fallback="$3" v=""
  if [[ -f "$file" ]] && command -v jq >/dev/null; then v="$(jq -r "$query // empty" "$file")"; fi
  echo "${v:-$fallback}"
}
BASE="$(config_value land.config.json .baseBranch develop)"
WORKTREES_DIR="$(config_value orchestrate.config.json .worktreesDir .claude/worktrees)"
WORKTREES_DIR="${WORKTREES_DIR%/}"
git fetch origin "$BASE" --quiet

removed=0 dirty=0 unmerged=0

while read -r wt br; do
  # Only ever touch the agent worktree directory — never the main checkout or
  # sibling clones.
  case "$wt" in "$PWD/$WORKTREES_DIR/"*) ;; *) continue ;; esac

  name=$(basename "$wt")
  short=${br#refs/heads/}

  if ! git merge-base --is-ancestor "$br" "origin/$BASE" 2>/dev/null; then
    printf 'KEEP     %-46s %s (not on %s)\n' "$name" "$short" "$BASE"
    unmerged=$((unmerged + 1))
    continue
  fi

  # Fail CLOSED: `2>/dev/null` used to turn an unreadable status into an empty
  # one, which reads as "clean" and removes the worktree. A worktree busy with a
  # concurrent git operation is exactly when that misfires, and exactly when it
  # has work to lose.
  if ! status=$(git -C "$wt" status --porcelain 2>/dev/null); then
    printf 'KEEP     %-46s %s (status unreadable — refusing to guess)\n' "$name" "$short"
    dirty=$((dirty + 1))
    continue
  fi

  if [[ -n "$status" ]]; then
    n=$(printf '%s\n' "$status" | wc -l | tr -d ' ')
    printf 'KEEP     %-46s %s (merged, but %s uncommitted)\n' "$name" "$short" "$n"
    dirty=$((dirty + 1))
    continue
  fi

  if $APPLY; then
    # `git worktree remove` refuses outright on a worktree holding an
    # INITIALIZED submodule — and scripts/agent-env.sh initializes submodules in
    # every worktree, so it could never remove a bootstrapped one. Under `set -e`
    # that aborted the whole run on the first such worktree.
    #
    # Falling back to `rm -rf` is safe only here, and only because everything
    # above has already proven it: registered, branch is an ancestor of
    # origin/<base>, and status is readable and empty. `--force` stays banned —
    # it would delete a dirty worktree, which is the whole thing these checks
    # exist to prevent.
    if ! err=$(git worktree remove "$wt" 2>&1); then
      if [[ "$err" == *submodule* ]]; then
        rm -rf "$wt"
      else
        printf 'KEEP     %-46s %s (remove refused: %s)\n' "$name" "$short" "$err"
        dirty=$((dirty + 1))
        continue
      fi
    fi
    printf 'REMOVED  %-46s %s\n' "$name" "$short"
  else
    printf 'WOULD    %-46s %s\n' "$name" "$short"
  fi
  removed=$((removed + 1))
done < <(git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{print w" "$2}')

$APPLY && git worktree prune

echo
if $APPLY; then
  echo "Removed $removed; kept $dirty dirty and $unmerged unmerged."
else
  echo "$removed removable; $dirty dirty and $unmerged unmerged would be kept. Re-run with --apply."
fi
