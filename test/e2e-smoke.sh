#!/usr/bin/env bash
# End-to-end smoke test. Boots the server on a random port, walks the core flow,
# then kills the server.
set -eu

PORT=4329
PIN=9987
BASE="http://localhost:$PORT"

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -f /tmp/invite-smoke.db
}
trap cleanup EXIT

rm -f /tmp/invite-smoke.db
rm -rf /tmp/invite-smoke-uploads
DB_PATH=/tmp/invite-smoke.db UPLOAD_DIR=/tmp/invite-smoke-uploads PIN=$PIN PORT=$PORT \
  node server.js > /tmp/invite-smoke.log 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if curl -sf "$BASE/api/bootstrap" > /dev/null; then break; fi
  sleep 0.25
done

echo "== bootstrap =="
curl -sf "$BASE/api/bootstrap" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('ok:',j.ok,'features:',Object.keys(j.features||{}).length)})"

echo "== validate-pin =="
TOKEN=$(curl -sf -X POST "$BASE/api/validate-pin" -H 'Content-Type: application/json' \
  -d "{\"pin\":\"$PIN\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{process.stdout.write(JSON.parse(d).token||'')})")
[ -z "$TOKEN" ] && echo "FAIL: no token" && exit 1
echo "token ok ($(echo -n "$TOKEN" | wc -c) chars)"

echo "== add guest =="
GUEST_JSON=$(curl -sf -X POST "$BASE/api/guests" \
  -H "x-auth-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"guestName":"Smoke Test Guest","mobileNumber":"+15551234567","partySize":2}')
GUEST_ID=$(echo "$GUEST_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{process.stdout.write(String(JSON.parse(d).id))})")
GUEST_TOKEN=$(echo "$GUEST_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{process.stdout.write(JSON.parse(d).inviteToken)})")
echo "guest id=$GUEST_ID token=$GUEST_TOKEN"

echo "== public invite fetch =="
curl -sf "$BASE/api/public-invite?token=$GUEST_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('ok:',j.ok,'name:',j.guest && j.guest.guestName)})"

echo "== public RSVP submit =="
curl -sf -X POST "$BASE/api/rsvp" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$GUEST_TOKEN\",\"name\":\"Smoke Test Guest\",\"rsvp\":\"Attending\",\"partySize\":3,\"notes\":\"smoke\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('ok:',j.ok,'rsvp:',j.guest && j.guest.rsvp)})"

echo "== stats =="
curl -sf "$BASE/api/stats" -H "x-auth-token: $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('total:',j.total,'attending:',j.attending)})"

echo "== csv export =="
curl -sf "$BASE/api/export.csv" -H "x-auth-token: $TOKEN" | head -c 120
echo ""

echo "== /i/:token redirect =="
curl -sI "$BASE/i/$GUEST_TOKEN" | head -3

echo "== delete guest =="
curl -sf -X DELETE "$BASE/api/guests/$GUEST_ID" -H "x-auth-token: $TOKEN" | head -c 60
echo ""

echo "ALL OK"
