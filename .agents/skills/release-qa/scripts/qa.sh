#!/usr/bin/env bash
# Drive the emulator-armed Cultuvilla APK on one AVD for the QA pass.
#   QA_SERIAL=emulator-5610 QA_ROOT=<worktree> OUT=<scratch> qa.sh <cmd>
#   ports            check the default emulator ports are free before starting the backend
#   login <fixture>  sign in as a seeded user: admin | user | superadmin | joiner | throwaway | fresh
#   link <route>     open cultuvilla://<route> (e.g. perfil, a village/event URL path)
#   shot <name>      screenshot to $OUT/<name>.png (then Read it)
#   tree             the app's labelled nodes (texts, testIDs, bounds) as Maestro sees them
#   kb               close the soft keyboard without a BACK press
#   run '<yaml>'     run Maestro commands, e.g. run '- tapOn: { id: "profile-edit-action" }'
set -euo pipefail
: "${QA_SERIAL:?set QA_SERIAL to your own AVD (adb -s <serial> emu avd name)}"
QA_ROOT="${QA_ROOT:-$PWD}"
OUT="${OUT:-$QA_ROOT/.qa-out}"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
APP_ID="${APP_ID:-com.cultuvilla.app.dev}"
ADB=(adb -s "$QA_SERIAL")
mkdir -p "$OUT"

flow() { # $1 = commands; extra args go to maestro test
  local f; f="$(mktemp "$OUT/flow-XXXX.yaml")"
  printf 'appId: %s\n---\n%s\n' "$APP_ID" "$1" > "$f"; shift
  maestro_test "$@" "$f"
}
# Maestro prints only a debug path on failure; give each run its own debug dir
# (parallel agents share ~/.local/state/maestro), surface the failing step, exit non-zero.
maestro_test() {
  local dir; dir="$(mktemp -d "$OUT/maestro-XXXX")"
  "$MAESTRO" --device "$QA_SERIAL" test --debug-output "$dir" "$@" >"$dir/stdout.log" 2>&1 || true
  local log; log="$(find "$dir" -name maestro.log | head -n1 || true)"
  if [[ -z $log ]] || grep -q ' FAILED' "$log"; then
    [[ -n $log ]] && grep -E 'FAILED|CommandFailed' "$log" | tail -n3
    echo "FAILED ($dir)"; return 1
  fi
  echo OK
}

case "${1:-}" in
  ports)
    # The app talks to 10.0.2.2:8080/9099/5001/9199 — @react-native-firebase rewrites
    # 127.0.0.1 to 10.0.2.2 on an emulator, so `adb reverse` onto slot ports cannot work.
    # The pass therefore needs the repo's DEFAULT emulator ports, free, on the host.
    ss -ltn | grep -E ':(8080|9099|5001|9199) ' && { echo "default emulator ports are taken: someone else's emulators are up"; exit 1; }
    echo "default ports free" ;;
  login)
    # `fresh` has no profile yet, so it never reaches the profile tab login.yaml waits for.
    sub=login.yaml; [[ $2 == fresh ]] && sub=login-fresh.yaml
    maestro_test -e EMAIL="e2e-${2:?fixture}@cultuvilla.test" \
      -e PASSWORD=e2e-cultuvilla-pw "$QA_ROOT/apps/mobile/e2e/native/subflows/$sub" ;;
  link)  "${ADB[@]}" shell am start -a android.intent.action.VIEW -d "cultuvilla://${2:?route}" "$APP_ID" 2>&1 \
           | grep -v 'Activity not started\|Starting: Intent' || true ;;
  shot)  # Half size: a full-resolution frame costs ~4x the context and reads no better.
    "${ADB[@]}" exec-out screencap -p > "$OUT/${2:?name}.png"
    # ImageMagick 7 ships `magick`; Ubuntu 24.04's ImageMagick 6 (powerserver) only `convert`.
    if command -v magick >/dev/null; then magick "$OUT/$2.png" -resize 50% "$OUT/$2.png"
    elif command -v convert >/dev/null; then convert "$OUT/$2.png" -resize 50% "$OUT/$2.png"; fi
    echo "$OUT/$2.png" ;;
  tree)  # app nodes with a text, testID or a11y label only — the raw tree is mostly ViewGroups and systemui
    "$MAESTRO" --device "$QA_SERIAL" hierarchy --compact 2>/dev/null \
      | grep -v 'com.android.systemui' | grep -E 'text=[^,]|resource-id=[^,]|accessibilityText=[^,]' || true ;;
  kb)    "${ADB[@]}" shell input keyevent 111 ;;   # close the soft keyboard (ESC); BACK would leave the screen
  run)   flow "${2:?yaml}" ;;
  *) sed -n 2,10p "$0"; exit 2 ;;
esac
