#!/usr/bin/env bash
# Install dependencies/browsers before calling this Linux-only isolation boundary.
# Usage: scripts/test-offline.sh pnpm test:coverage
set -euo pipefail

if [[ $(uname -s) != Linux || $(id -u) == 0 || $# == 0 ]]; then
  printf '%s\n' 'Offline tests require Linux, a non-root caller, sudo privileges, and a command.' >&2
  exit 1
fi
for tool in sudo unshare ip setpriv node; do
  command -v "$tool" >/dev/null || { printf 'Required offline tool missing: %s\n' "$tool" >&2; exit 1; }
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node_path=$(command -v node)
# Only loopback is configured in a fresh namespace: neither IP family has an
# external interface or route. Drop every capability and forbid privilege gains
# before executing ANY project code, including the probe and all descendants.
# There is deliberately no unrestricted fallback if sudo/unshare is unavailable.
exec sudo -n unshare --net -- /bin/bash -euc '
  ip link set lo up
  exec setpriv --reuid="$1" --regid="$2" --init-groups \
    --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
    /usr/bin/env "PATH=$3" "HOME=$4" /bin/bash -euc '\''
      node_path=$1
      probe=$2
      shift 2
      "$node_path" "$probe"
      exec "$@"
    '\'' offline-user "$5" "${@:6}"
' offline-root "$(id -u)" "$(id -g)" "$PATH" "$HOME" "$node_path" "$script_dir/offline-probe.mjs" "$@"
