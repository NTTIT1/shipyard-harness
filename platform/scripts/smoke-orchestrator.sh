#!/usr/bin/env bash
# End-to-end smoke: login → create project → harness creates run + submits PM →
# owner (fallback for PM) sees it in the inbox → approves → harness gets BA WORK.
set -euo pipefail
GW="${GW:-http://127.0.0.1:9080}"; ORCH="${ORCH:-http://127.0.0.1:9084}"
TOKEN="${SHIPYARD_SERVICE_TOKEN:-dev-service-token}"
J='Content-Type: application/json'
jqr() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }

AT=$(curl -fsS -H "$J" -d '{"email":"admin@shipyard.local","password":"'"${ADMIN_PASSWORD:-admin123}"'"}' "$GW/api/v1/auth/login" | jqr "d['data']['accessToken']")
UID_=$(curl -fsS -H "Authorization: Bearer $AT" "$GW/api/v1/auth/me" | jqr "d['data']['id']")
SLUG="smoke$RANDOM"
PID=$(curl -fsS -H "$J" -H "Authorization: Bearer $AT" -d '{"slug":"'"$SLUG"'","name":"Smoke","repoUrl":"https://example.com/r.git"}' "$GW/api/v1/projects" | jqr "d['data']['id']")
echo "project $PID"

RUN=$(curl -fsS -H "$J" -H "X-Service-Token: $TOKEN" -d '{"projectId":"'"$PID"'","laneRef":"smoke:lane1","title":"Smoke feature","description":"","createdBy":"'"$UID_"'"}' "$ORCH/internal/v1/runs" | jqr "d['data']['id']")
curl -fsS -H "$J" -H "X-Service-Token: $TOKEN" -d '{"summary":"PM v1","documents":{"spec.md":"# Smoke\nAC-1"},"images":[],"meta":{},"contextUsed":[]}' "$ORCH/internal/v1/runs/$RUN/steps/PM/submit" >/dev/null
echo "run $RUN submitted PM"

# Membership is cached for 60 s in the orchestrator (spec §3.5): a just-created project can lag.
APR=""
for _ in $(seq 1 25); do
  APR=$(curl -fsS -H "Authorization: Bearer $AT" "$GW/api/v1/approvals/inbox" | jqr "next((x['approvalId'] for x in d['data'] if x['runId']=='$RUN'), '')")
  [ -n "$APR" ] && break; sleep 3
done
[ -n "$APR" ] || { echo "SMOKE: FAIL — gate never reached the inbox"; exit 1; }
curl -fsS -H "$J" -H "Authorization: Bearer $AT" -d '{"action":"APPROVE"}' "$GW/api/v1/approvals/$APR/decision" | jqr "d['data']"
NEXT=$(curl -fsS -H "X-Service-Token: $TOKEN" "$ORCH/internal/v1/runs/$RUN/next" | jqr "d['data']['mode']+' '+d['data']['step']")
echo "next: $NEXT"
[ "$NEXT" = "WORK BA" ] && echo "SMOKE: PASS" || { echo "SMOKE: FAIL"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT" "$GW/internal/v1/runs/$RUN/next")
[ "$code" = "404" ] && echo "gateway does not expose /internal: OK" || { echo "gateway exposes /internal ($code)"; exit 1; }
