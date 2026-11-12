#!/usr/bin/env bash
# Print the port Metro should start on, for `expo start --port`.
#
#   scripts/metro-port.sh <base>
#
# METRO_PORT wins when set (agent worktree slots, a port chosen by hand).
# Otherwise: the first of <base>, <base>+10 ... <base>+90 that nothing listens
# on, so several copies of the app (and other apps on their own series) can run
# side by side without Expo stopping at "Port 8081 is being used". All ten taken
# is an error, never an empty port.
set -euo pipefail

base=${1:?usage: metro-port.sh <base port>}

if [ -n "${METRO_PORT:-}" ]; then
  echo "$METRO_PORT"
  exit 0
fi

for ((i = 0; i < 10; i++)); do
  port=$((base + i * 10))
  if ! (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "$port"
    exit 0
  fi
done

echo "metro-port: every port of $base, $((base + 10)) ... $((base + 90)) is in use; stop a Metro or set METRO_PORT." >&2
exit 1
