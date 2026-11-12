#!/usr/bin/env bash
# Starts the production compose file's proxy network with stand-in containers
# and checks that the reverse proxy holds the one address the API trusts.
#
# docker-compose.prod.yml gives Caddy a fixed address on proxy-network, and the
# API reads the client address from X-Forwarded-For only when the request comes
# from that address (SAFEOS_TRUST_PROXY). Every service on that network is
# started here from busybox, with the real file's networks and start order, so
# Docker hands out addresses as it does for the real stack. The check fails
# when a service cannot start (its fixed address was already given to a
# container that started earlier) or when the proxy's address is not the
# trusted one.
#
# Usage: scripts/check-compose-proxy-network.sh [repository root]
set -euo pipefail

root="${1:-.}"
cd "$root" || exit 1

file=docker-compose.prod.yml
proxy=caddy
network=proxy-network
project="safeos-proxy-check-$$"
work=$(mktemp -d)
stand_in="$work/compose.json"

cleanup() {
  docker compose -p "$project" -f "$stand_in" down --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

docker compose -f "$file" config --format json > "$work/full.json"

trusted=$(jq -r '.services.api.environment.SAFEOS_TRUST_PROXY // empty' "$work/full.json")
if [ -z "$trusted" ]; then
  echo "::error::$file sets no SAFEOS_TRUST_PROXY for the API" >&2
  exit 1
fi

# The services on the proxy network, as busybox, with their own networks and
# their start order among themselves (health conditions become "started").
jq --arg net "$network" '
  (.services | to_entries | map(select((.value.networks // {}) | has($net))) | map(.key)) as $names
  | {
      networks: (.networks | map_values(del(.name))),
      services: (.services
        | with_entries(select(.key as $k | $names | index($k)))
        | map_values({
            image: "busybox:1.36",
            command: ["sleep", "600"],
            networks: .networks,
            depends_on: ((.depends_on // {})
              | with_entries(select(.key as $k | $names | index($k)))
              | map_values({condition: "service_started"}))
          }))
    }' "$work/full.json" > "$stand_in"

echo "Starting $(jq -r '.services | keys | join(", ")' "$stand_in") on $network in the order $file starts them"
if ! docker compose -p "$project" -f "$stand_in" up -d --quiet-pull; then
  echo "::error::A service on $network could not start; an address it needs was already taken (see the error above)" >&2
  exit 1
fi

address_of() {
  local cid
  cid=$(docker compose -p "$project" -f "$stand_in" ps -q "$1")
  docker inspect "$cid" --format '{{json .NetworkSettings.Networks}}' \
    | jq -r --arg suffix "_$network" 'to_entries[] | select(.key | endswith($suffix)) | .value.IPAddress'
}

got=$(address_of "$proxy")
echo "$proxy has $got on $network; the API trusts $trusted"
case ",$trusted," in
  *",$got,"*) ;;
  *)
    echo "::error::$proxy has $got on $network, but the API trusts only $trusted" >&2
    exit 1
    ;;
esac

for svc in $(jq -r --arg p "$proxy" '.services | keys[] | select(. != $p)' "$stand_in"); do
  other=$(address_of "$svc")
  case ",$trusted," in
    *",$other,"*)
      echo "::error::$svc has $other on $network, an address the API trusts as its proxy" >&2
      exit 1
      ;;
  esac
done

echo "Only $proxy holds the trusted proxy address on $network"
