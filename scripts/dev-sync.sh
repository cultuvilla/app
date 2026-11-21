#!/usr/bin/env bash
# Keep the main checkout on the latest develop, so the Metro Álvaro runs from
# it always serves what has merged. Run every minute by a systemd user timer
# (homelab: workstation/cultuvilla-dev-sync/).
#
#   scripts/dev-sync.sh
#
# Fast-forward only: it never merges, rebases, stashes or discards. It does
# nothing while the checkout is off develop, mid-merge or mid-rebase, ahead of
# origin, or holding an edit to a file the update would change; git refuses
# that fast-forward, and the next run tries again. After an update it installs
# dependencies when a lockfile or package.json moved, and sends a desktop
# notification when the native fingerprint changed: then the dev client on the
# phone needs a rebuild, which a pull cannot do.
#
# Why: on 2026-11-20 the checkout sat 23 merges behind develop, so Metro served
# a screen that had already been replaced.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
state=${XDG_STATE_HOME:-$HOME/.local/state}/cultuvilla-dev-sync
mkdir -p "$state"
exec 9>"$state/lock"
flock -n 9 || exit 0

log() { printf '%s %s\n' "$(date -Is)" "$*" >>"$state/log"; }
notify() { notify-send -a Cultuvilla "$1" "$2" 2>/dev/null || true; }
fingerprint() { (cd "$repo/apps/mobile" && ./node_modules/.bin/fingerprint fingerprint:generate . 2>/dev/null | jq -r .hash) || true; }

cd "$repo"
gitdir=$(git rev-parse --git-dir)
# A worktree's .git is a file: this only ever moves the main checkout.
[ -d .git ] || exit 0
[ "$(git symbolic-ref --quiet --short HEAD || true)" = develop ] || exit 0
for busy in MERGE_HEAD REBASE_HEAD rebase-merge rebase-apply CHERRY_PICK_HEAD index.lock; do
  [ -e "$gitdir/$busy" ] && exit 0
done

# The first run records what the dev client was built from, so the first native
# change after it is noticed rather than taken as the baseline.
[ -s "$state/fingerprint" ] || fingerprint >"$state/fingerprint"

git fetch --quiet origin develop
old=$(git rev-parse HEAD)
new=$(git rev-parse origin/develop)
[ "$old" = "$new" ] && exit 0
# Local commits not on origin yet: someone is mid-push. Leave it.
git merge-base --is-ancestor "$old" "$new" || exit 0

if ! git merge --ff-only --quiet "$new" 2>>"$state/log"; then
  log "skipped: a local edit overlaps the update"
  exit 0
fi
log "updated ${old:0:8}..${new:0:8}"

changed=$(git diff --name-only "$old" "$new")
if grep -qE '(^|/)(pnpm-lock\.yaml|package\.json)$' <<<"$changed"; then
  if pnpm install --frozen-lockfile --silent >>"$state/log" 2>&1; then
    log "installed dependencies"
  else
    log "pnpm install failed"
    notify "Cultuvilla: dependencies failed to install" "The dev app may not load. Ask a session to run pnpm install."
  fi
fi

now=$(fingerprint)
if [ -n "$now" ]; then
  previous=$(cat "$state/fingerprint" 2>/dev/null || true)
  echo "$now" >"$state/fingerprint"
  if [ -n "$previous" ] && [ "$previous" != "$now" ]; then
    log "native fingerprint changed ${previous:0:8} -> ${now:0:8}"
    notify "Cultuvilla: rebuild the dev app" \
      "A merged change adds native code. Until the dev app on the phone is rebuilt, the new code may not load."
  fi
fi
