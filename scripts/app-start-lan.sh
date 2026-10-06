#!/usr/bin/env bash
# Start Metro advertising the Windows host's LAN IP, so a phone on the same
# Wi-Fi can scan the QR. Under WSL2's NAT networking `expo start --lan` would
# advertise a Docker bridge or the WSL eth0, which the phone cannot reach; the
# Windows portproxy 0.0.0.0:8081 -> WSL:8081 carries the traffic instead.
set -euo pipefail

if [ -z "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]; then
  if ! command -v powershell.exe >/dev/null 2>&1; then
    echo "app:start:lan needs WSL (powershell.exe) to find the Windows LAN IP." >&2
    echo "Elsewhere, set REACT_NATIVE_PACKAGER_HOSTNAME=<this machine's LAN IP> yourself." >&2
    exit 1
  fi
  REACT_NATIVE_PACKAGER_HOSTNAME=$(powershell.exe -NoProfile -Command \
    "\$g=Get-NetIPConfiguration | Where-Object {\$_.IPv4DefaultGateway -ne \$null -and \$_.NetAdapter.Status -eq 'Up'} | Sort-Object {\$_.IPv4DefaultGateway.RouteMetric} | Select-Object -First 1; @(\$g.IPv4Address.IPAddress)[0]" \
    | tr -d '\r' | head -n1)
fi

if ! [[ "$REACT_NATIVE_PACKAGER_HOSTNAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not find the Windows LAN IP (got '${REACT_NATIVE_PACKAGER_HOSTNAME}')." >&2
  echo "Is Wi-Fi/Ethernet up? Or set REACT_NATIVE_PACKAGER_HOSTNAME=<LAN IP> yourself." >&2
  exit 1
fi

echo "Advertising Metro at $REACT_NATIVE_PACKAGER_HOSTNAME:8081"
export REACT_NATIVE_PACKAGER_HOSTNAME
exec pnpm --filter cultuvilla-mobile start "$@"
