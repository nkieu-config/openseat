#!/usr/bin/env bash
set -euo pipefail

API="${API:-http://localhost:4000}"

wait_for_health() {
  for _ in $(seq 1 60); do
    if curl -fsS -m 5 "$API/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "the API never became reachable at $API" >&2
  return 1
}

expect_ok() {
  local label="$1" path="$2"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$API$path")
  if [ "$code" != "200" ]; then
    echo "FAIL  $label ($path) returned $code, expected 200" >&2
    return 1
  fi
  echo "ok    $label"
}

expect_body() {
  local label="$1" path="$2" needle="$3" body
  body=$(curl -s -m 15 "$API$path")
  case "$body" in
    *"$needle"*) echo "ok    $label" ;;
    *)
      echo "FAIL  $label ($path) did not contain '$needle'" >&2
      echo "      got: ${body:0:300}" >&2
      return 1
      ;;
  esac
}

wait_for_health

expect_ok    "health"                 /api/health
expect_ok    "swagger ui"             /api/docs
expect_body  "prisma read"            /api/events/bangkok-indie-fest '"slug":"bangkok-indie-fest"'

event_id=$(curl -s -m 15 "$API/api/events/bangkok-indie-fest" \
  | sed -n 's/^{"id":"\([^"]*\)".*/\1/p')
if [ -z "$event_id" ]; then
  echo "FAIL  could not read the demo event id" >&2
  exit 1
fi
expect_body  "seat map materialised"  "/api/events/$event_id/seat-map" '"sections"'

graphql=$(curl -s -m 15 -X POST "$API/api/graphql" \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}')
case "$graphql" in
  *'"__typename":"Query"'*) echo "ok    graphql schema built in memory" ;;
  *)
    echo "FAIL  graphql did not answer: ${graphql:0:300}" >&2
    exit 1
    ;;
esac

echo "the pruned image serves every surface"
