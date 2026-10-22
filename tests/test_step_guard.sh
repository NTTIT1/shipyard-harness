#!/usr/bin/env bash
# Workflow guardrails enforced by run-step.sh (bin/step_guard.py): required inputs, VND budget,
# minute limit, RETRY / ESCALATE_HUMAN / FAIL_RUN.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
setup_temp_harness; trap 'teardown_temp_harness; [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null' EXIT

mkdir -p "$LANES_ROOT/lane2/specs/f1" "$TMPH/fakebin"
export CLAUDE_BIN="$TMPH/fakebin/claude"
# Fake claude: counts its runs; fails the first $FAKE_FAILS runs, sleeps $FAKE_SLEEP, keeps the prompt.
cat > "$CLAUDE_BIN" <<'EOF'
#!/usr/bin/env bash
c=$(( $(cat "$HARNESS_ROOT/runs" 2>/dev/null || echo 0) + 1 )); echo "$c" > "$HARNESS_ROOT/runs"
printf '%s' "${@: -1}" > "$HARNESS_ROOT/prompt.seen"
[ -n "${FAKE_SLEEP:-}" ] && sleep "$FAKE_SLEEP"
if [ "$c" -le "${FAKE_FAILS:-0}" ]; then echo '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"API Error: 529 overloaded"}'; exit 1; fi
echo '{"type":"result","subtype":"success","is_error":false,"result":"wrote spec.md\nROLE-STEP: DONE spec.md"}'
EOF
chmod +x "$CLAUDE_BIN"
export PATH="$TMPH/fakebin:$PATH"
P="$TMPH/prompt.md"; echo "write the spec" > "$P"
rs() { rm -f "$HARNESS_ROOT/runs" "$HARNESS_ROOT/prompt.seen"; bash "$REPO/bin/run-step.sh" "$@"; }
runs() { cat "$HARNESS_ROOT/runs" 2>/dev/null || echo 0; }
cfg() { st 2 set-json step_config "$1" >/dev/null; }

st 2 init >/dev/null
st 2 set spec_dir=specs/f1 run_id=run_t1 >/dev/null

# 1. no workflow settings: unchanged behaviour (one run, success)
cfg '{}'
rs 2 pm "$P" > "$TMPH/out"; rc=$?
assert_eq "0" "$rc" "no settings: step runs as before"
assert_eq "1" "$(runs)" "one AI run"

# 2. a missing required input stops the step before any token is spent
cfg '{"PM":{"requiredInputs":["request.md","docs/architecture.md"]}}'
rs 2 pm "$P" > "$TMPH/out" 2>&1; rc=$?
assert_eq "2" "$rc" "missing input -> escalate (exit 2)"
assert_eq "0" "$(runs)" "claude never started"
assert_contains "$(cat "$TMPH/out")" "thiếu đầu vào bắt buộc: request.md,docs/architecture.md" "names the missing files"

# 3. inputs present: the prompt lists exactly them
echo "# yêu cầu" > "$LANES_ROOT/lane2/specs/f1/request.md"; mkdir -p "$LANES_ROOT/lane2/docs"; echo a > "$LANES_ROOT/lane2/docs/architecture.md"
rs 2 pm "$P" >/dev/null; rc=$?
assert_eq "0" "$rc" "inputs present -> runs"
assert_contains "$(cat "$HARNESS_ROOT/prompt.seen")" $'Đầu vào bắt buộc của bước này' "prompt names the required inputs"
assert_contains "$(cat "$HARNESS_ROOT/prompt.seen")" "- docs/architecture.md" "lists each input"

# 4. ESCALATE_HUMAN (default): no retry
cfg '{"PM":{"maxRetries":3}}'
FAKE_FAILS=1 rs 2 pm "$P" >/dev/null 2>&1; rc=$?
assert_eq "2" "$rc" "escalate: a failure waits for a human"
assert_eq "1" "$(runs)" "escalate: no retry even with maxRetries"

# 5. RETRY: up to maxRetries more runs, then success
cfg '{"PM":{"maxRetries":2,"onFailure":"RETRY"}}'
FAKE_FAILS=2 rs 2 pm "$P" > "$TMPH/out" 2>"$TMPH/err"; rc=$?
assert_eq "0" "$rc" "retry: third run succeeds"
assert_eq "3" "$(runs)" "retry: 1 + 2 retries"
assert_contains "$(cat "$TMPH/err")" "thử lại lần 3/3" "retries are logged"
FAKE_FAILS=5 rs 2 pm "$P" > "$TMPH/out" 2>&1; rc=$?
assert_eq "2" "$rc" "retry exhausted -> escalate"
assert_eq "3" "$(runs)" "never more than 1 + maxRetries runs"
assert_contains "$(cat "$TMPH/out")" "ROLE-STEP: BLOCKED" "tells the session why"

# 6. minute limit: a run that overruns is cut (0.02 min via a stub `timeout` scale is impractical; use 1 min + fake sleep is too slow)
#    -> exercised with a stub `timeout` that behaves like GNU timeout hitting its limit.
cat > "$TMPH/fakebin/timeout" <<'EOF'
#!/usr/bin/env bash
exit 124
EOF
chmod +x "$TMPH/fakebin/timeout"
cfg '{"PM":{"timeoutMinutes":1}}'
rs 2 pm "$P" > "$TMPH/out" 2>&1; rc=$?
assert_eq "2" "$rc" "timeout -> escalate"
assert_contains "$(st 2 get steps | python3 -c "import json,sys;print(json.load(sys.stdin)[-1][\"error\"])")" "quá giới hạn 1 phút" "timeout recorded"
rm "$TMPH/fakebin/timeout"

# 7. budget: spent >= budget -> no run
mkdir -p "$HARNESS_ROOT/run/lane2"
echo '{"runId":"run_t1","step":"pm","usd":1.0}' > "$HARNESS_ROOT/run/lane2/usage.jsonl"
echo '{"runId":"other","step":"pm","usd":50}' >> "$HARNESS_ROOT/run/lane2/usage.jsonl"
echo '{"usdToVnd":25000}' > "$HARNESS_ROOT/config/costs.json"
assert_eq "25000" "$(python3 "$REPO/bin/step_guard.py" spent "$HARNESS_ROOT" 2 run_t1 PM)" "spent counts only this run and phase"
cfg '{"PM":{"budgetVnd":20000}}'
rs 2 pm "$P" > "$TMPH/out" 2>&1; rc=$?
assert_eq "2" "$rc" "over budget -> escalate"
assert_eq "0" "$(runs)" "over budget: no AI run"
assert_contains "$(cat "$TMPH/out")" "vượt ngân sách bước PM: đã dùng 25.000 ₫ / trần 20.000 ₫" "says how much"
cfg '{"PM":{"budgetVnd":30000}}'
rs 2 pm "$P" >/dev/null 2>&1; rc=$?
assert_eq "0" "$rc" "under budget -> runs"

# 8. FAIL_RUN stops the platform run (stub orchestrator) and exits 4
PORT=$((20000 + RANDOM % 20000))
python3 - "$PORT" "$TMPH/fail.log" <<'PY' &
import http.server, json, sys
port, log = int(sys.argv[1]), sys.argv[2]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode()
        open(log, 'a').write(self.path + ' ' + body + '\n')
        out = json.dumps({"success": True, "data": {"id": "run_t1", "status": "CANCELLED"}}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(out)
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', port), H).serve_forever()
PY
SRV=$!
for _ in $(seq 1 50); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.1; done
cfg '{"PM":{"onFailure":"FAIL_RUN"}}'
FAKE_FAILS=9 ORCHESTRATOR_URL="http://127.0.0.1:$PORT" rs 2 pm "$P" > "$TMPH/out" 2>&1; rc=$?
assert_eq "4" "$rc" "FAIL_RUN -> exit 4"
assert_contains "$(cat "$TMPH/fail.log")" "/internal/v1/runs/run_t1/fail" "the platform run is failed"
assert_contains "$(cat "$TMPH/fail.log")" "API Error: 529" "with the reason"
assert_eq "idle" "$(st 2 get status)" "lane freed"

# 9. sub-steps map to their workflow phase
assert_contains "$(python3 "$REPO/bin/step_guard.py" env "$(st 2 path)" qc-local)" "SG_PHASE=TEST" "qc-local is part of TEST"
assert_contains "$(python3 "$REPO/bin/step_guard.py" env "$(st 2 path)" senior-gate)" "SG_PHASE=''" "senior-gate has no workflow phase"
finish
