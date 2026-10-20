#!/usr/bin/env bash
# Run ONE ship-feature sub-step (an agent, or the code-review skill) as its own
# headless `claude -p` process on the model chosen for that step. A Claude model
# runs on the machine's own Claude login; any other provider's model is reached
# through the LiteLLM gateway (bin/gateway.sh). One process per step is what lets
# a single pipeline mix providers — a Claude Code process talks to ONE endpoint.
#   run-step.sh <N> <step> <prompt-file>
# Model: state models.<step> -> config/models.json defaults.<step> -> Opus. Effort likewise (effort.<step>).
# Token usage of every run is appended to run/lane<N>/usage.jsonl (dashboard → Chi phí).
# Exit: 0 done · 2 provider/gateway/claude error · 3 no verdict line · 64 usage
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
  dev) AGENT=""; VERDICT_RE='^ROLE-STEP: ' ;;  # engine chosen below from the configured model
  test) AGENT="tester-agent"; VERDICT_RE='^ROLE-STEP: ' ;;
  *) usage ;;
esac

STATE_FILE="$(lane_state_file "$N")"
# Effort: state effort.<step> -> feature config -> lane config -> config/models.json effort.<step> -> none (Claude models only).
RESOLVED="$(python3 "$CODE_ROOT/bin/step_model.py" "$STATE_FILE" "$HARNESS_ROOT/config/models.json" "$STEP" "$N")"
MODEL="${RESOLVED%%$'\t'*}"; EFFORT="${RESOLVED#*$'\t'}"
PROVIDER="${MODEL%%:*}"; MID="${MODEL#*:}"
# DEV implementation engine: "openhands:<gateway model>" runs OpenHands in a sandbox container;
# anything else means the lane's main Claude session implements DEV itself (ship-feature Stage 1).
if [ "$STEP" = "dev" ]; then
  [ "$PROVIDER" = "openhands" ] || die "dev engine for lane $N is the main session ($MODEL) — implement in the session, not via run-step"
  exec bash "$CODE_ROOT/bin/openhands-step.sh" "$N" "$PROMPT_FILE" "$MID"
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
ERRF="$(mktemp)"; trap 'rm -f "$ERRF"' EXIT
set +e
RAW="$("${CLAUDE_BIN:-claude}" "${ARGS[@]}" "$(cat "$PROMPT_FILE")" 2>"$ERRF" </dev/null)"; RC=$?
set -e
# Token accounting (dashboard → Chi phí); also for failed runs, which still spent tokens.
printf '%s' "$RAW" | python3 "$CODE_ROOT/bin/usage_record.py" "$HARNESS_ROOT" "$N" "$STEP" "$MODEL" "$EFFORT" "$STATE_FILE" || true
if [ "$RC" -ne 0 ]; then
  # With --output-format json a failing claude usually reports on STDOUT, not stderr.
  ERRTXT="$(python3 - "$RAW" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
    print((d.get("result") or "").replace("\n", " ")[:400] if isinstance(d, dict) else "")
except Exception:
    print("")
PY
)"
  [ -n "$ERRTXT" ] || ERRTXT="$(tail -c 400 "$ERRF" | tr '\n' ' ')"
  [ -n "$ERRTXT" ] || ERRTXT="claude exited $RC"
  finish_step 2 "" "claude exited $RC: $ERRTXT"
fi
PARSED="$(python3 - "$RAW" <<'PY'
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
KIND="${PARSED%%$'\t'*}"; BODY="${PARSED#*$'\t'}"
[ "$KIND" = "OK" ] || finish_step 2 "" "$BODY"
RESULT="$(python3 -c 'import json,sys;print(json.loads(sys.argv[1]))' "$BODY")"
printf '%s\n' "$RESULT"

LAST="$(printf '%s\n' "$RESULT" | awk 'NF{l=$0} END{print l}')"
if [ -n "$VERDICT_RE" ]; then
  printf '%s\n' "$LAST" | grep -Eq "$VERDICT_RE" || finish_step 3 "" "model did not end with a ${VERDICT_RE#^} line"
fi
finish_step 0 "$LAST" ""
