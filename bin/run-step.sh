#!/usr/bin/env bash
# Run ONE ship-feature sub-step (an agent, or the code-review skill) as its own
# headless `claude -p` process on the model chosen for that step. A Claude model
# runs on the machine's own Claude login; any other provider's model is reached
# through the LiteLLM gateway (bin/gateway.sh). One process per step is what lets
# a single pipeline mix providers — a Claude Code process talks to ONE endpoint.
#   run-step.sh <N> <step> <prompt-file>
# Model: state models.<step> -> config/models.json defaults.<step> -> Opus. Effort likewise (effort.<step>).
# Token usage of every run is appended to run/lane<N>/usage.jsonl (dashboard → Chi phí).
# Workflow guardrails (the project's per-step settings, frozen into the run; bin/step_guard.py): required
# inputs must exist, the step's VND budget must not be spent, each AI run is cut at the step's minute
# limit, failures are retried when the step says RETRY, and FAIL_RUN stops the platform run.
# Exit: 0 done · 2 provider/gateway/claude error (escalate to a human) · 3 no verdict line · 4 run stopped
# (FAIL_RUN) · 64 usage
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { echo "usage: run-step.sh <N> <step> <prompt-file>" >&2; exit 64; }
require_lane "${1:-}"
N="$1"; STEP="${2:-}"; PROMPT_FILE="${3:-}"
[ -f "$PROMPT_FILE" ] || usage
# The prompt travels as one argv element (stdin is /dev/null); argv caps near 128KB.
if [ "$(wc -c < "$PROMPT_FILE")" -gt 100000 ]; then
  echo "harness: run-step: prompt file too large (>100000 bytes) for argv: $PROMPT_FILE" >&2; exit 64
fi

case "$STEP" in
  plan-critic) AGENT=""; VERDICT_RE="" ;;
  impl-worker) AGENT="impl-worker"; VERDICT_RE='^IMPL: ' ;;
  code-review) AGENT=""; VERDICT_RE="" ;;
  qc-local) AGENT="qc-local"; VERDICT_RE='^LOCAL-QC: ' ;;
  senior-gate) AGENT="senior-gate-reviewer"; VERDICT_RE='^VERDICT: ' ;;
  ticketer) AGENT="ticketer"; VERDICT_RE='^TICKET: ' ;;
  dev-qc) AGENT="dev-qc"; VERDICT_RE='^DEV-QC: ' ;;
  pm) AGENT="pm-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  ba) AGENT="ba-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  arch) AGENT="architect-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  design) AGENT="designer-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  ux-design) AGENT="ux-designer-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  ui-design) AGENT="ui-designer-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  design-qa) AGENT="design-qa-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  backend-dev) AGENT="backend-dev-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  frontend-dev) AGENT="frontend-dev-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  dev) AGENT=""; VERDICT_RE='^ROLE-STEP: ' ;;  # engine chosen below from the configured model
  test) AGENT="tester-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  *) usage ;;
esac

STATE_FILE="$(lane_state_file "$N")"
# Effort: state effort.<step> -> feature config -> lane config -> config/models.json effort.<step> -> none (Claude models only).
RESOLVED="$(python3 "$CODE_ROOT/bin/step_model.py" "$STATE_FILE" "$HARNESS_ROOT/config/models.json" "$STEP" "$N")"
MODEL="${RESOLVED%%$'\t'*}"; EFFORT="${RESOLVED#*$'\t'}"
PROVIDER="${MODEL%%:*}"; MID="${MODEL#*:}"
# Workflow guardrails for this step (SG_PHASE, SG_MAX_RETRIES, SG_TIMEOUT_MIN, SG_BUDGET_VND, SG_ON_FAILURE, SG_INPUTS).
eval "$(python3 "$CODE_ROOT/bin/step_guard.py" env "$STATE_FILE" "$STEP")"
SPEC_REL="$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("spec_dir") or "")
except Exception: print("")' "$STATE_FILE")"
RUN_ID="$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("run_id") or "")
except Exception: print("")' "$STATE_FILE")"
# A step that cannot go on: FAIL_RUN stops the platform run (exit 4), anything else waits for a human (exit 2).
give_up() {  # <reason>
  local why="$1"
  if [ "$SG_ON_FAILURE" = "FAIL_RUN" ] && [ -n "$RUN_ID" ]; then
    local rf; rf="$(mktemp)"; printf 'Bước %s (%s): %s\n' "$SG_PHASE" "$STEP" "$why" > "$rf"
    if bash "$CODE_ROOT/bin/orch.sh" "$N" fail --reason-file "$rf" >/dev/null 2>&1; then
      rm -f "$rf"; echo "ROLE-STEP: BLOCKED quy trình đã dừng (FAIL_RUN): $why"
      [ "$(type -t finish_step)" = function ] && finish_step 4 "" "FAIL_RUN: $why"
      exit 4
    fi
    rm -f "$rf"
  fi
  echo "ROLE-STEP: BLOCKED $why — cần người xử lý"
  [ "$(type -t finish_step)" = function ] && finish_step 2 "" "$why"
  exit 2
}
if [ -n "$SG_INPUTS" ]; then
  # shellcheck disable=SC2086
  MISSING="$(printf '%s\n' "$SG_INPUTS" | xargs -d '\n' python3 "$CODE_ROOT/bin/step_guard.py" inputs "$(lane_dir "$N")" "$SPEC_REL" || true)"
  [ -z "$MISSING" ] || give_up "thiếu đầu vào bắt buộc: $(printf '%s' "$MISSING" | paste -sd, -)"
fi
if [ -n "$SG_PHASE" ]; then
  WHY="$(python3 "$CODE_ROOT/bin/step_guard.py" check "$HARNESS_ROOT" "$N" "$STATE_FILE" "$SG_PHASE" || true)"
  # The time limit of a headless step is enforced per run below; here only the budget can stop it up front.
  case "$WHY" in vượt*) give_up "$WHY" ;; esac
fi
[ -n "$SG_TIMEOUT_MIN" ] && export OPENHANDS_TIMEOUT="$((SG_TIMEOUT_MIN * 60))"

# DEV implementation engine: "openhands:<gateway model>" runs OpenHands in a sandbox container;
# anything else means the lane's main Claude session implements DEV itself (ship-feature Stage 1).
if [ "$STEP" = "dev" ]; then
  [ "$PROVIDER" = "openhands" ] || die "dev engine for lane $N is the main session ($MODEL) — implement in the session, not via run-step"
  exec bash "$CODE_ROOT/bin/openhands-step.sh" "$N" "$PROMPT_FILE" "$MID" dev
fi
# TEST (qc-plan + automated checks) may also run in the OpenHands sandbox; browser QC (qc-local)
# always stays a Claude Code step.
if [ "$STEP" = "test" ] && [ "$PROVIDER" = "openhands" ]; then
  exec bash "$CODE_ROOT/bin/openhands-step.sh" "$N" "$PROMPT_FILE" "$MID" test
fi
ID="$STEP-$(date +%s)-$$"
record() {
  bash "$CODE_ROOT/bin/state.sh" "$N" append steps "$1" >/dev/null 2>&1 \
    || echo "harness: run-step: could not record step event" >&2
}
jstr() { python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$1"; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
record "{\"id\":\"$ID\",\"step\":\"$STEP\",\"model\":$(jstr "$MODEL"),\"event\":\"start\",\"at\":\"$(now)\"}"
finish_step() {  # <exit> <verdict> <error>
  record "{\"id\":\"$ID\",\"step\":\"$STEP\",\"model\":$(jstr "$MODEL"),\"event\":\"end\",\"at\":\"$(now)\",\"exit\":$1,\"verdict\":$(jstr "$2"),\"error\":$(jstr "$3")}"
  exit "$1"
}

ARGS=(-p --output-format json --permission-mode "${STEP_PERMISSION_MODE:-auto}")
[ -n "$AGENT" ] && ARGS+=(--agent "$AGENT")
if [ "$PROVIDER" = "claude" ]; then
  # The Claude branch must run on the machine's own login, never an inherited gateway.
  unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_SMALL_FAST_MODEL \
        ANTHROPIC_DEFAULT_HAIKU_MODEL ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL
  ARGS+=(--model "$MID")
  [ -n "$EFFORT" ] && ARGS+=(--effort "$EFFORT")
else
  GW="http://127.0.0.1:${GATEWAY_PORT:-4000}"
  if ! curl -fsS -m 3 "$GW/health/liveliness" >/dev/null 2>&1; then
    bash "$CODE_ROOT/bin/gateway.sh" start >&2 || finish_step 2 "" "gateway not reachable at $GW"
  fi
  GW_KEY="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("gateway_key",""))' "$HARNESS_ROOT/config/providers.json" 2>/dev/null || true)"
  [ -n "$GW_KEY" ] || finish_step 2 "" "no gateway_key in config/providers.json"
  ALIAS="$PROVIDER/$MID"
  export ANTHROPIC_BASE_URL="$GW" ANTHROPIC_AUTH_TOKEN="$GW_KEY"
  export ANTHROPIC_SMALL_FAST_MODEL="$ALIAS" ANTHROPIC_DEFAULT_HAIKU_MODEL="$ALIAS"
  export ANTHROPIC_DEFAULT_OPUS_MODEL="$ALIAS" ANTHROPIC_DEFAULT_SONNET_MODEL="$ALIAS"
  unset ANTHROPIC_API_KEY
  ARGS+=(--model "$ALIAS")
fi

cd "$(lane_dir "$N")"
# Project AI-team rules for this step's role (.shipyard/team.json on the integration branch).
TEAM_RULES="$(python3 "$CODE_ROOT/bin/team_rules.py" "$PWD" "$STEP" "${INTEGRATION_BRANCH:-development}" 2>/dev/null || true)"
[ -n "$TEAM_RULES" ] && ARGS+=(--append-system-prompt "$TEAM_RULES")
ERRF="$(mktemp)"; PROMPT_RUN="$(mktemp)"; trap 'rm -f "$ERRF" "$PROMPT_RUN"' EXIT
cp "$PROMPT_FILE" "$PROMPT_RUN"
if [ -n "$SG_INPUTS" ]; then
  # Only what the workflow says this step needs: fewer files read, fewer tokens.
  { printf '\n\n## Đầu vào bắt buộc của bước này (quy trình dự án)\nĐọc đúng các file này (tên không có "/" nằm trong %s); không cần đọc tài liệu khác của tính năng trừ khi thiếu thông tin:\n' "${SPEC_REL:-SPEC_DIR}"
    printf '%s\n' "$SG_INPUTS" | sed 's/^/- /'; } >> "$PROMPT_RUN"
fi

# One AI run → sets RC, RESULT, LAST, FAIL ("" = done with a verdict).
run_once() {
  RESULT=""; LAST=""; FAIL=""
  local raw rc tcmd=()
  [ -n "$SG_TIMEOUT_MIN" ] && tcmd=(timeout --foreground --kill-after=30 "${SG_TIMEOUT_MIN}m")
  set +e
  raw="$("${tcmd[@]}" "${CLAUDE_BIN:-claude}" "${ARGS[@]}" "$(cat "$PROMPT_RUN")" 2>"$ERRF" </dev/null)"; rc=$?
  set -e
  # Token accounting (dashboard → Chi phí); also for failed runs, which still spent tokens.
  printf '%s' "$raw" | python3 "$CODE_ROOT/bin/usage_record.py" "$HARNESS_ROOT" "$N" "$STEP" "$MODEL" "$EFFORT" "$STATE_FILE" || true
  if [ "$rc" -eq 124 ]; then FAIL="quá giới hạn ${SG_TIMEOUT_MIN} phút"; return; fi
  if [ "$rc" -ne 0 ]; then
    # With --output-format json a failing claude usually reports on STDOUT, not stderr.
    FAIL="$(python3 - "$raw" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
    print((d.get("result") or "").replace("\n", " ")[:400] if isinstance(d, dict) else "")
except Exception:
    print("")
PY
)"
    [ -n "$FAIL" ] || FAIL="$(tail -c 400 "$ERRF" | tr '\n' ' ')"
    FAIL="claude exited $rc: ${FAIL:-no message}"; return
  fi
  local parsed kind body
  parsed="$(python3 - "$raw" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print("ERR\tunparseable claude output"); sys.exit()
res = d.get("result") or ""
if d.get("is_error") or d.get("subtype") != "success":
    print("ERR\t" + res.replace("\n", " ")[:400]); sys.exit()
print("OK\t" + json.dumps(res))
PY
)"
  kind="${parsed%%$'\t'*}"; body="${parsed#*$'\t'}"
  if [ "$kind" != "OK" ]; then FAIL="$body"; return; fi
  RESULT="$(python3 -c 'import json,sys;print(json.loads(sys.argv[1]))' "$body")"
  LAST="$(printf '%s\n' "$RESULT" | awk 'NF{l=$0} END{print l}')"
  if [ -n "$VERDICT_RE" ] && ! printf '%s\n' "$LAST" | grep -Eq "$VERDICT_RE"; then
    FAIL="model did not end with a ${VERDICT_RE#^} line"; NOVERDICT=1
  fi
}

TRIES=1
[ "$SG_ON_FAILURE" = "RETRY" ] && TRIES=$((SG_MAX_RETRIES + 1))
NOVERDICT=0
for ((TRY = 1; TRY <= TRIES; TRY++)); do
  if [ "$TRY" -gt 1 ] && [ -n "$SG_PHASE" ]; then
    WHY="$(python3 "$CODE_ROOT/bin/step_guard.py" check "$HARNESS_ROOT" "$N" "$STATE_FILE" "$SG_PHASE" || true)"
    case "$WHY" in vượt*) give_up "$WHY" ;; esac
    echo "harness: run-step: $STEP thử lại lần $TRY/$TRIES sau lỗi: $FAIL" >&2
  fi
  NOVERDICT=0
  run_once
  [ -z "$FAIL" ] && break
done
if [ -n "$FAIL" ]; then
  if [ "$SG_ON_FAILURE" = "FAIL_RUN" ] || [ "$SG_ON_FAILURE" = "RETRY" ]; then
    give_up "$FAIL${TRIES:+ (sau $TRIES lần chạy)}"
  fi
  [ -n "$RESULT" ] && printf '%s\n' "$RESULT"
  [ "$NOVERDICT" = 1 ] && finish_step 3 "" "$FAIL"
  finish_step 2 "" "$FAIL"
fi
printf '%s\n' "$RESULT"
finish_step 0 "$LAST" ""
