#!/usr/bin/env bash
# Make HEAD and origin/<base> share a merge-base in a shallow CI checkout.
#
#   scripts/ci-fetch-merge-base.sh <base-branch>
#
# A pull_request checkout is `refs/pull/N/merge` at depth 1, with no
# origin/<base> at all, so `git merge-base HEAD origin/<base>` has nothing to
# find — and the breaking-change detectors (check-callable-removal.mjs,
# check-schema-change.mjs) need it to isolate the branch's own commits and read
# their trailers. This fetches exactly two histories — HEAD's commit and the
# base branch — never every branch of the repo.
#
# The depth only ever grows: 200, then 2000, then --unshallow. Each is an
# ABSOLUTE depth from the tips, so no step discards what an earlier one fetched.
# Each fetch is bounded by FETCH_TIMEOUT_S so a hung transfer is retried at the
# next depth instead of eating the job's timeout. Exits non-zero only when every
# fetch failed to produce a merge-base, and says which fetches ran.
# Ported from ordago-apps.
set -uo pipefail

base="${1:?usage: ci-fetch-merge-base.sh <base-branch>}"
timeout_s="${FETCH_TIMEOUT_S:-300}"
head_sha="$(git rev-parse HEAD)"
base_refspec="+refs/heads/${base}:refs/remotes/origin/${base}"

has_merge_base() {
  git merge-base HEAD "origin/${base}" >/dev/null 2>&1
}

tried=()
for depth in 200 2000 unshallow; do
  if has_merge_base; then break; fi
  if [ "$depth" = unshallow ]; then
    # --unshallow is refused on a complete repository; the depth flags are not.
    if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
      flag=(--unshallow)
    else
      flag=()
    fi
  else
    flag=(--depth="$depth")
  fi
  echo "no merge-base between HEAD and origin/${base} yet — fetching ${flag[*]:-(complete repo)}"
  start=$SECONDS
  if timeout "$timeout_s" git fetch --no-tags "${flag[@]}" origin "$base_refspec" "$head_sha"; then
    outcome=ok
  else
    outcome="failed with exit $?"
  fi
  tried+=("${flag[*]:-plain} (${outcome}, $((SECONDS - start))s)")
done

if ! has_merge_base; then
  echo "::error::HEAD (${head_sha:0:8}) and origin/${base} share no merge-base after fetching both histories: ${tried[*]}. The last attempt fetches their complete history, so this is the runner failing to fetch from GitHub (see each fetch's output above), not a shallow window and not the diff."
  exit 1
fi
echo "merge-base with origin/${base}: $(git merge-base HEAD "origin/${base}")${tried:+ (after: ${tried[*]})}"
