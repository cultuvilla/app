#!/usr/bin/env bash
# Drive the emulator-armed Cultuvilla APK on one AVD for the QA pass.
#   QA_SERIAL=emulator-5610 QA_ROOT=<worktree> OUT=<scratch> qa.sh <cmd>
#   ports            adb reverse device 8080/9099/5001/9199 → this worktree's emulator ports
#   login <fixture>  sign in as a seeded user: admin | user | superadmin | joiner | throwaway | fresh
#   link <route>     open cultuvilla://<route> (e.g. perfil, a village/event URL path)
#   shot <name>      screenshot to $OUT/<name>.png (then Read it)
#   tree             the UI hierarchy (texts, testIDs, bounds) as Maestro sees it
#   run '<yaml>'     run Maestro commands, e.g. run '- tapOn: { id: "profile-edit-action" }'
set -euo pipefail
: "${QA_SERIAL:?set QA_SERIAL to your own AVD (adb -s <serial> emu avd name)}"
QA_ROOT="${QA_ROOT:-$PWD}"
OUT="${OUT:-$QA_ROOT/.qa-out}"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
APP_ID="${APP_ID:-com.cultuvilla.app.dev}"
ADB=(adb -s "$QA_SERIAL")
mkdir -p "$OUT"

port() {
  local cfg="$QA_ROOT/firebase.agent.json"; [[ -f $cfg ]] || cfg="$QA_ROOT/firebase.json"
  jq -r ".emulators.$1.port" "$cfg"
}
flow() { # $1 = commands; extra args go to maestro test
  local f; f="$(mktemp "$OUT/flow-XXXX.yaml")"
  printf 'appId: %s\n---\n%s\n' "$APP_ID" "$1" > "$f"; shift
  "$MAESTRO" --device "$QA_SERIAL" test "$@" "$f"
}

case "${1:-}" in
  ports)
    # The app hardcodes 8080/9099/5001/9199 on EXPO_PUBLIC_EMULATOR_HOST; built with
    # 127.0.0.1, adb reverse lets a worktree's slot ports stand in for them.
    for pair in 8080:firestore 9099:auth 5001:functions 9199:storage; do
      "${ADB[@]}" reverse "tcp:${pair%%:*}" "tcp:$(port "${pair#*:}")"
    done
    "${ADB[@]}" reverse --list ;;
  login)
    "$MAESTRO" --device "$QA_SERIAL" test -e EMAIL="e2e-${2:?fixture}@cultuvilla.test" \
      -e PASSWORD=e2e-cultuvilla-pw "$QA_ROOT/apps/mobile/e2e/native/subflows/login.yaml" ;;
  link)  "${ADB[@]}" shell am start -a android.intent.action.VIEW -d "cultuvilla://${2:?route}" "$APP_ID" >/dev/null ;;
  shot)  "${ADB[@]}" exec-out screencap -p > "$OUT/${2:?name}.png" && echo "$OUT/$2.png" ;;
  tree)  "$MAESTRO" --device "$QA_SERIAL" hierarchy --compact 2>/dev/null || "$MAESTRO" --device "$QA_SERIAL" hierarchy ;;
  run)   flow "${2:?yaml}" ;;
  *) sed -n 2,10p "$0"; exit 2 ;;
esac
