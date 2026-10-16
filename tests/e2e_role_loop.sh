#!/usr/bin/env bash
# Role loop end-to-end on the LIVE platform with a fake claude (writes each role's files):
# PM (human requests changes with an edit) → PM revise → approve → BA … ARCH has_ui=false
# (DESIGN skipped) → DEV next. Proves orch.sh + run-step.sh + orchestrator + context-service together.
#   bin/platform.sh start && tests/e2e_role_loop.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap teardown_temp_harness EXIT
GW="${GW:-http://127.0.0.1:9080}"
export SHIPYARD_SERVICE_TOKEN="${SHIPYARD_SERVICE_TOKEN:-$(cat "$REPO/run/platform/service-token")}"
J='Content-Type: application/json'
jqr() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }

AT=$(curl -fsS -H "$J" -d '{"email":"admin@shipyard.local","password":"'"${ADMIN_PASSWORD:-admin123}"'"}' "$GW/api/v1/auth/login" | jqr "d['data']['accessToken']")
PID=$(curl -fsS -H "$J" -H "Authorization: Bearer $AT" -d '{"slug":"e2e'"$RANDOM"'","name":"E2E","repoUrl":"https://example.com/r.git"}' "$GW/api/v1/projects" | jqr "d['data']['id']")
mkdir -p "$TMPH/profiles/testprof" "$LANES_ROOT/lane1" "$TMPH/fakebin" "$TMPH/run"
echo "PLATFORM_PROJECT_ID=\"$PID\"" > "$TMPH/profiles/testprof/integrations.env"
git init -q "$LANES_ROOT/lane1"
st 1 init >/dev/null; st 1 set feature_title="Đăng xuất" >/dev/null
export SPEC_DATE=2026-10-15

# Fake claude: writes the role's document into $SPEC_DIR and ends with the verdict.
cat > "$TMPH/fakebin/claude" <<'EOF'
#!/usr/bin/env bash
agent=""; prev=""
for a in "$@"; do [ "$prev" = "--agent" ] && agent="$a"; prev="$a"; done
SD="$LANES_ROOT/lane1/$(bash "$REPO_BIN/state.sh" 1 get spec_dir)"
case "$agent" in
  pm-agent) printf -- '---\ntitle: Đăng xuất\n---\n# Spec\nAC-1 bấm đăng xuất thì về trang đăng nhập\n' > "$SD/spec.md"; v="ROLE-STEP: DONE spec.md";;
  ba-agent) printf '# BA\nBR-1 xoá phiên\n' > "$SD/ba.md"; v="ROLE-STEP: DONE ba.md";;
  architect-agent) printf '# Plan\n## Quyết định\n- Xoá cookie phiên\n' > "$SD/plan.md"; printf -- '- [ ] T1 test (AC-1)\n' > "$SD/tasks.md"
    printf '{"relations":[{"from":"FEATURE:this","to":"API:POST /logout","type":"CALLS"}]}' > "$SD/entities.json"; v=$'has_ui: false\nROLE-STEP: DONE plan.md tasks.md entities.json';;
  *) v="ROLE-STEP: BLOCKED unexpected agent $agent";;
esac
python3 -c 'import json,sys;print(json.dumps({"type":"result","subtype":"success","is_error":False,"result":sys.argv[1]}))' "$v"
EOF
chmod +x "$TMPH/fakebin/claude"
export CLAUDE_BIN="$TMPH/fakebin/claude" REPO_BIN="$REPO/bin"
O() { bash "$REPO/bin/orch.sh" 1 "$@"; }
mode() { O next | jqr "d['mode']+' '+str(d['step'])"; }
step() {  # <id> <STEP> [submit args…]
  local id="$1" S="$2"; shift 2
  O sync >/dev/null && O pack >/dev/null || return 1
  echo "do $S" > "$TMPH/prompt.md"
  bash "$REPO/bin/run-step.sh" 1 "$id" "$TMPH/prompt.md" >/dev/null || return 1
  echo "$S xong" > "$TMPH/run/sum.md"
  O submit "$S" --summary-file "$TMPH/run/sum.md" "$@" >/dev/null
}
approve() {  # <body-json>
  local apr
  for _ in $(seq 1 10); do
    apr=$(curl -fsS -H "Authorization: Bearer $AT" "$GW/api/v1/approvals/inbox" | jqr "next((x['approvalId'] for x in d['data'] if x['projectId']=='$PID'), '')")
    [ -n "$apr" ] && break; sleep 1
  done
  curl -fsS -H "$J" -H "Authorization: Bearer $AT" -d "$1" "$GW/api/v1/approvals/$apr/decision" >/dev/null
}

O create --title "Đăng xuất" --description "Thêm nút đăng xuất" >/dev/null
assert_eq "WORK PM" "$(mode)" "new run starts at PM"
step pm PM; assert_eq "WAIT PM" "$(mode)" "PM waits for the human PM"
assert_eq "waiting" "$(st 1 get status)" "lane is parked waiting"

approve '{"action":"REQUEST_CHANGES","feedback":"Thêm AC hết hạn phiên","editedDocuments":{"spec.md":"---\ntitle: Đăng xuất\n---\n# Spec\nAC-1 bấm đăng xuất\nAC-2 phiên hết hạn thì tự đăng xuất\n"}}'
assert_eq "REVISE PM" "$(mode)" "request changes → PM revise"
O sync >/dev/null
SD="$LANES_ROOT/lane1/$(st 1 get spec_dir)"
assert_contains "$(cat "$SD/spec.md")" "AC-2 phiên hết hạn" "sync applied the reviewer's edit"
step pm PM && approve '{"action":"APPROVE"}'
assert_eq "WORK BA" "$(mode)" "approved PM → BA"

# Lesson reaches the BA context pack (outbox ≤5 s + embedding).
found=""
for _ in $(seq 1 20); do
  P="$(O pack)"; grep -q "Thêm AC hết hạn phiên" "$P" && { found=yes; break; }; sleep 2
done
assert_eq "yes" "$found" "the PM reviewer's feedback is in the BA context pack"

step ba BA && approve '{"action":"APPROVE"}'
step arch ARCH --has-ui false && approve '{"action":"APPROVE"}'
assert_eq "WORK DEV" "$(mode)" "has_ui=false skips DESIGN → DEV"
finish
