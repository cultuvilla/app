#!/usr/bin/env bash
# Start Metro so a phone on the same Wi-Fi can scan the QR.
#
# Under WSL2's NAT networking `expo start --lan` advertises a Docker bridge or
# the WSL eth0, which the phone cannot reach. There we advertise the Windows
# host's LAN IP instead, and the Windows portproxy 0.0.0.0:8081 -> WSL:8081
# carries the traffic. Off WSL, plain `expo start --lan` already does the right
# thing, so we hand straight over to it.
set -euo pipefail

MOBILE=${MOBILE_FILTER:-cultuvilla-mobile}

if [ -n "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]; then
  echo "Advertising Metro at $REACT_NATIVE_PACKAGER_HOSTNAME (from your environment)"
  export REACT_NATIVE_PACKAGER_HOSTNAME
  exec pnpm --filter "$MOBILE" start "$@"
fi

if ! command -v powershell.exe >/dev/null 2>&1; then
  exec pnpm --filter "$MOBILE" start:lan "$@"
fi

detected=$(powershell.exe -NoProfile -Command \
  "\$g=Get-NetIPConfiguration | Where-Object {\$_.IPv4DefaultGateway -ne \$null -and \$_.NetAdapter.Status -eq 'Up'} | Sort-Object {\$_.IPv4DefaultGateway.RouteMetric} | Select-Object -First 1; @(\$g.IPv4Address.IPAddress)[0]" \
  2>/dev/null || true)
detected=${detected//$'\r'/}
detected=${detected%%$'\n'*}

if ! [[ "$detected" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not detect the Windows LAN IP (got '${detected}')." >&2
  echo "Is Wi-Fi/Ethernet up? Or set REACT_NATIVE_PACKAGER_HOSTNAME=<LAN IP> yourself." >&2
  exit 1
fi

echo "Advertising Metro at $detected (Windows LAN IP)."
echo "QR not connecting? The Windows portproxy must point at this WSL's IP:"
echo "  powershell.exe netsh interface portproxy show v4tov4   vs   ip -4 addr show eth0"
export REACT_NATIVE_PACKAGER_HOSTNAME=$detected
exec pnpm --filter "$MOBILE" start "$@"
