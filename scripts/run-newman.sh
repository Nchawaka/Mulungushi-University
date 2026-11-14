#!/usr/bin/env bash
# Runs the Newman contract suite against a fresh server, then the rate-limit suite against a server limited to 5 requests/min.
set -u
cd "$(dirname "$0")/.."
OUT=docs/evidence
mkdir -p "$OUT"
SESSION="newman-dev-session-$(date +%s)"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

PORT=3100 DEV_STAFF_SESSION="$SESSION" node src/server.js >"$OUT/server-contract.log" 2>&1 &
PIDS+=($!)
PORT=3101 RATE_LIMIT_MAX=5 RATE_LIMIT_WINDOW_MS=60000 node src/server.js >"$OUT/server-ratelimit.log" 2>&1 &
PIDS+=($!)
sleep 1.5

echo "=== Newman: contract collection (port 3100) ==="
npx newman run postman/cprs-contract.postman_collection.json \
  --env-var "baseUrl=http://localhost:3100" --env-var "staffSession=$SESSION" \
  --reporters cli,json --reporter-json-export "$OUT/newman-contract.json" --color off
C=$?

echo
echo "=== Newman: rate limit collection, 8 iterations (port 3101, limit 5/min) ==="
npx newman run postman/cprs-ratelimit.postman_collection.json \
  --env-var "baseUrl=http://localhost:3101" --env-var "rateLimitMax=5" -n 8 \
  --reporters cli,json --reporter-json-export "$OUT/newman-ratelimit.json" --color off
R=$?
exit $((C || R))
