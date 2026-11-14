#!/usr/bin/env bash
# Manual contract / validation evidence with curl.
# Usage: BASE_URL=http://localhost:3000 STAFF_SESSION=<dev session> bash scripts/curl-contract.sh
BASE="${BASE_URL:-http://localhost:3000}"
SESSION="${STAFF_SESSION:-}"

show() {  # show <title> <curl args...>
  local title="$1"; shift
  echo; echo "### $title"
  local cmd="curl -i" a
  for a in "$@"; do
    case "$a" in *[!A-Za-z0-9_./:=@%+,?\&-]*) cmd+=" '$a'";; *) cmd+=" $a";; esac
  done
  echo "\$ $cmd"
  curl -s -i "$@" | python3 -c '
import sys, json
raw = sys.stdin.buffer.read().decode()
head, _, body = raw.partition("\r\n\r\n")
for line in head.split("\r\n"):
    l = line.lower()
    if line.startswith("HTTP/") or l.startswith(("content-type","location","ratelimit-","retry-after","www-authenticate")):
        print(line)
print()
try: print(json.dumps(json.loads(body), indent=2))
except Exception: print(body)
'
}
J='Content-Type: application/json'

show "1. Valid report -> 201 Created" -X POST "$BASE/api/v1/reports" -H "$J" \
  -d '{"category":"electrical","title":"Broken socket near the window","description":"The double socket has no power.","building":"Block A","location":"Room 12"}'

show "2. Missing required fields -> 422 + RFC 7807" -X POST "$BASE/api/v1/reports" -H "$J" -d '{"category":"plumbing"}'

show "3. Wrong type, bad enum value -> 422 + RFC 7807" -X POST "$BASE/api/v1/reports" -H "$J" \
  -d '{"category":"cooking","title":12345,"description":"The tap will not close.","building":"Library","location":"Washroom"}'

show "4. Regex pattern violation (script injection attempt in building) -> 422" -X POST "$BASE/api/v1/reports" -H "$J" \
  -d '{"category":"security","title":"Door lock is broken","description":"The hostel door does not lock.","building":"<script>alert(1)</script>","location":"Gate"}'

show "5. Unexpected property (additionalProperties:false) -> 422" -X POST "$BASE/api/v1/reports" -H "$J" \
  -d '{"category":"security","title":"Door lock is broken","description":"The hostel door does not lock.","building":"Hostel C","location":"Gate","isAdmin":true}'

show "6. Malformed JSON -> 400 + RFC 7807" -X POST "$BASE/api/v1/reports" -H "$J" -d '{"category": "electrical", '

show "7. Unsupported query parameter -> 400 + RFC 7807" "$BASE/api/v1/reports?sort=asc"

show "8. Malformed path parameter -> 400 + RFC 7807" "$BASE/api/v1/reports/not-a-uuid"

show "9. Unknown report -> 404 + RFC 7807" "$BASE/api/v1/reports/3f2b8c1e-7a4d-4e57-9c63-0d1f2a3b4c5d"

show "10. Status change without a session -> 401 + RFC 7807" -X PATCH \
  "$BASE/api/v1/reports/3f2b8c1e-7a4d-4e57-9c63-0d1f2a3b4c5d/status" -H "$J" -d '{"status":"in_review"}'

show "11. Priority queue (highest number of reports first) -> 200" "$BASE/api/v1/priorities"
