#!/usr/bin/env bash
# Memory end-to-end: orchestrator approval → outbox → context-service → bge-m3 embeddings →
# semantic search + context pack + memory API through the gateway.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GW="${GW:-http://127.0.0.1:9080}"; ORCH="${ORCH:-http://127.0.0.1:9084}"; CTX="${CTX:-http://127.0.0.1:9085}"
TOKEN="${SHIPYARD_SERVICE_TOKEN:-$(cat "$HERE/../../run/platform/service-token" 2>/dev/null)}"
J='Content-Type: application/json'
jqr() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }

AT=$(curl -fsS -H "$J" -d '{"email":"admin@shipyard.local","password":"'"${ADMIN_PASSWORD:-admin123}"'"}' "$GW/api/v1/auth/login" | jqr "d['data']['accessToken']")
UID_=$(curl -fsS -H "Authorization: Bearer $AT" "$GW/api/v1/auth/me" | jqr "d['data']['id']")
PID=$(curl -fsS -H "$J" -H "Authorization: Bearer $AT" -d '{"slug":"mem'"$RANDOM"'","name":"Mem","repoUrl":"https://example.com/r.git"}' "$GW/api/v1/projects" | jqr "d['data']['id']")
# Every gate AUTO so one submit flows straight into memory.
curl -fsS -X PUT -H "$J" -H "Authorization: Bearer $AT" -d '{"PM":"AUTO"}' "$GW/api/v1/projects/$PID/gate-policy" >/dev/null
RUN=$(curl -fsS -H "$J" -H "X-Service-Token: $TOKEN" -d '{"projectId":"'"$PID"'","laneRef":"smoke:lane1","title":"Đăng xuất","description":"","createdBy":"'"$UID_"'"}' "$ORCH/internal/v1/runs" | jqr "d['data']['id']")
curl -fsS -H "$J" -H "X-Service-Token: $TOKEN" -d '{"summary":"PM v1","documents":{"spec.md":"# Đăng xuất\nAC-1 Người dùng bấm nút đăng xuất thì phiên kết thúc và quay về trang đăng nhập"},"images":[],"meta":{},"contextUsed":[]}' "$ORCH/internal/v1/runs/$RUN/steps/PM/submit" >/dev/null
echo "run $RUN: PM auto-approved"

# Outbox (5 s) → ingest → worker (2 s) → bge-m3. Ask in different words than the document.
HIT=""
for _ in $(seq 1 30); do
  R=$(curl -fsS -H "$J" -H "X-Service-Token: $TOKEN" -d '{"projectId":"'"$PID"'","query":"kết thúc phiên làm việc của người dùng","k":3}' "$CTX/internal/v1/memory/search")
  HIT=$(echo "$R" | jqr "next((h['via'] for h in d['data']['hits'] if 'spec.md' in h['title']), '') + ('|degraded' if d['data']['degraded'] else '')")
  [[ "$HIT" == vector* || "$HIT" == hybrid* ]] && break; sleep 2
done
echo "semantic hit: $HIT"
[[ "$HIT" == vector || "$HIT" == hybrid ]] || { echo "SMOKE-CONTEXT: FAIL (no semantic hit)"; exit 1; }

PACK=$(curl -fsS -H "$J" -H "X-Service-Token: $TOKEN" -d '{"projectId":"'"$PID"'","runId":"'"$RUN"'","runTitle":"Đăng xuất","step":"BA","priorApproved":{"PM":{"spec.md":"# Đăng xuất\nAC-1"}}}' "$CTX/internal/v1/context-pack" | jqr "d['data']['markdown']")
echo "$PACK" | grep -q "### PM — spec.md" || { echo "SMOKE-CONTEXT: FAIL (pack)"; exit 1; }
N=$(curl -fsS -H "Authorization: Bearer $AT" "$GW/api/v1/projects/$PID/memory" | jqr "len(d['data'])")
[ "$N" -ge 1 ] || { echo "SMOKE-CONTEXT: FAIL (memory API)"; exit 1; }
echo "memory items via gateway: $N"
echo "SMOKE-CONTEXT: PASS"
