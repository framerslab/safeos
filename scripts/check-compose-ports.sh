#!/usr/bin/env bash
# Fails when a compose service other than the reverse proxy publishes a port
# on any address but loopback (127.0.0.0/8 or ::1): on every interface, or on
# one of the host's own addresses, which other machines can also reach.
#
# Docker publishes a port on all interfaces unless the mapping names a host
# address, and it does so ahead of the host firewall (ufw and the like), so a
# published Ollama, Redis or API is reachable from any network the host is on.
# Only the proxy may publish beyond the machine; everything else binds
# 127.0.0.1 or is reached over the compose network.
#
# Every docker-compose*.yml and compose*.yml in the repository is resolved with
# `docker compose config`, with every profile switched on. A file that does not
# resolve alone (an override such as docker-compose.gpu.yml) is resolved on top
# of each file that does. A file that resolves neither way fails the check, so
# a new file cannot slip past it.
#
# Usage: scripts/check-compose-ports.sh [repository root]
set -euo pipefail

root="${1:-.}"
cd "$root" || exit 1

# Services allowed to publish beyond the machine.
PROXY_SERVICES="caddy"

# scripts/testdata holds the check's own fixtures, which CI runs separately.
mapfile -t files < <(find . \( -path ./node_modules -o -path ./scripts/testdata \) -prune -o -type f \
  \( -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' \
     -o -name 'compose*.yml' -o -name 'compose*.yaml' \) -print \
  | grep -v '/node_modules/' | sed 's|^\./||' | sort)

if [ "${#files[@]}" -eq 0 ]; then
  echo "No compose files found under $root" >&2
  exit 1
fi

resolve() {
  # Prints the resolved project as JSON with every profile on.
  local args=()
  for f in "$@"; do args+=(-f "$f"); done
  local profiles
  profiles=$(docker compose "${args[@]}" config --profiles 2>/dev/null) || return 1
  local pargs=()
  while IFS= read -r p; do
    [ -n "$p" ] && pargs+=(--profile "$p")
  done <<< "$profiles"
  docker compose "${args[@]}" "${pargs[@]}" config --format json 2>/dev/null
}

# One line per offending mapping: service, host address, published, target.
offenders() {
  jq -r --arg allowed "$PROXY_SERVICES" '
    ($allowed | split(" ")) as $ok
    | .services | to_entries[]
    | select(.key as $k | $ok | index($k) | not)
    | .key as $svc
    | (
        (.value.ports // [])[]
        | (.host_ip // "") as $ip
        | select(($ip | test("^127\\.") or . == "::1" or . == "[::1]") | not)
        | if $ip == "" or $ip == "0.0.0.0" or $ip == "::" or $ip == "[::]"
          then "\($svc) publishes \(.published // .target) -> \(.target) on every interface (host_ip \"\($ip)\")"
          else "\($svc) publishes \(.published // .target) -> \(.target) on \($ip), which is not a loopback address"
          end
      ),
      (
        select(.value.network_mode == "host")
        | "\($svc) uses network_mode: host, which exposes every port it listens on"
      )
  '
}

bases=()
overrides=()
for f in "${files[@]}"; do
  if resolve "$f" > /dev/null; then
    bases+=("$f")
  else
    overrides+=("$f")
  fi
done

failed=0
checked=0

check() {
  local label="$1"; shift
  local json
  if ! json=$(resolve "$@"); then
    return 1
  fi
  checked=$((checked + 1))
  local found
  found=$(printf '%s' "$json" | offenders)
  if [ -n "$found" ]; then
    failed=1
    while IFS= read -r line; do
      echo "FAIL $label: $line"
      echo "::error file=${1}::$line"
    done <<< "$found"
  else
    echo "ok   $label"
  fi
}

for b in "${bases[@]}"; do
  check "$b" "$b"
done

for o in "${overrides[@]}"; do
  applied=0
  for b in "${bases[@]}"; do
    if check "$b + $o" "$b" "$o"; then
      applied=1
    fi
  done
  if [ "$applied" -eq 0 ]; then
    failed=1
    echo "FAIL $o: resolves neither alone nor on top of another compose file"
    echo "::error file=$o::resolves neither alone nor on top of another compose file"
  fi
done

echo "Resolved $checked compose configurations from ${#files[@]} files."
exit "$failed"
