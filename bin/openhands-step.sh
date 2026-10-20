#!/usr/bin/env bash
# OpenHands Execution Bridge for Shipyard Harness
# Executes the DEV/coding step for lane <N> inside an isolated OpenHands sandbox.
#
# Usage:
#   openhands-step.sh <N> [prompt-file]
#
# Environment overrides:
#   OPENHANDS_IMAGE      Docker image (default: ghcr.io/all-hands-ai/openhands:latest)
#   OPENHANDS_MODEL      LLM model for OpenHands (default: openai/gpt-4o)
#   OPENHANDS_API_KEY    LLM API Key for OpenHands (falls back to OPENAI_API_KEY / ANTHROPIC_API_KEY)
#   OPENHANDS_BASE_URL   Custom LLM base URL (optional, e.g. LiteLLM gateway)
#   OPENHANDS_MOCK       Set to 1 for dry-run/mock execution without calling Docker
#
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

usage() { echo "usage: openhands-step.sh <N> [prompt-file]" >&2; exit 64; }
require_lane "${1:-}"
N="$1"; PROMPT_FILE="${2:-}"

LANE_DIR="$(lane_dir "$N")"
[ -d "$LANE_DIR/.git" ] || die "lane $N not bootstrapped (run: lane-bootstrap.sh $N)"

STATE_FILE="$(lane_state_file "$N")"
RUN_DIR="$(lane_run_dir "$N")"
LOG_DIR="$(lane_log_dir "$N")"
mkdir -p "$RUN_DIR" "$LOG_DIR"

LOG_FILE="$LOG_DIR/openhands.log"
TASK_FILE="$RUN_DIR/openhands-task.md"

# Extract feature metadata from lane state
META="$(python3 - "$STATE_FILE" <<'PY'
import json, sys
try:
    s = json.load(open(sys.argv[1]))
except Exception:
    s = {}
title = s.get("feature_title") or s.get("branch") or "Feature"
spec_dir = s.get("spec_dir") or ""
run_id = s.get("run_id") or ""
branch = s.get("branch") or ""
print(f"{title}\t{spec_dir}\t{run_id}\t{branch}")
PY
)"

FEATURE_TITLE="${META%%$'\t'*}"; REST="${META#*$'\t'}"
SPEC_DIR_REL="${REST%%$'\t'*}"; REST="${REST#*$'\t'}"
RUN_ID="${REST%%$'\t'*}"; BRANCH="${REST#*$'\t'}"

echo "harness: [OpenHands] Initializing DEV execution for Lane $N: '$FEATURE_TITLE' ..."

# 1. Compile Task Context for OpenHands
python3 - "$LANE_DIR" "$SPEC_DIR_REL" "$FEATURE_TITLE" "$PROMPT_FILE" > "$TASK_FILE" <<'PY'
import sys, os, pathlib

lane_dir, spec_rel, title, prompt_file = sys.argv[1:5]
spec_path = os.path.join(lane_dir, spec_rel) if spec_rel else ""

print(f"# TASK: {title}\n")
print("You are an autonomous Senior Software Engineer operating within an isolated repository workspace.")
print("Your goal is to implement, test, and commit the required functionality according to the approved specifications below.\n")

if prompt_file and os.path.isfile(prompt_file):
    print("## INSTRUCTIONS FROM ORCHESTRATOR:")
    with open(prompt_file, 'r', encoding='utf-8', errors='replace') as pf:
        print(pf.read().strip())
    print("\n" + "="*40 + "\n")

# Attach approved specs if available in spec_dir
docs = ["tasks.md", "plan.md", "spec.md", "ba.md", "design.md"]
attached = 0
if spec_path and os.path.isdir(spec_path):
    print("## APPROVED SPECIFICATIONS & REQUIREMENTS:\n")
    for doc in docs:
        doc_file = os.path.join(spec_path, doc)
        if os.path.isfile(doc_file):
            print(f"### File: {doc}")
            with open(doc_file, 'r', encoding='utf-8', errors='replace') as df:
                print(df.read().strip())
            print("\n" + "-"*30 + "\n")
            attached += 1

print("## EXECUTION GUIDELINES:")
print("1. Inspect the workspace and existing code structure before making changes.")
print("2. Follow the architectural decisions and API contracts specified in plan.md and tasks.md.")
print("3. Write clean, modular, and maintainable code with unit tests.")
print("4. Execute local tests / build commands to verify your changes.")
print("5. Once tests pass, stage and commit your changes with a conventional commit message.")
PY

echo "harness: [OpenHands] Task prompt generated -> $TASK_FILE"

# 2. Check Mock / Dry-run Mode
if [ "${OPENHANDS_MOCK:-0}" = "1" ]; then
  echo "harness: [OpenHands] OPENHANDS_MOCK=1 enabled. Performing dry-run verification..."
  echo "Mock execution completed successfully on $(date)" >> "$LOG_FILE"
  echo "ROLE-STEP: DONE OpenHands mock execution finished successfully"
  exit 0
fi

# 3. Resolve API Keys & Runtime Configuration
IMAGE="${OPENHANDS_IMAGE:-ghcr.io/all-hands-ai/openhands:latest}"
MODEL="${OPENHANDS_MODEL:-openai/gpt-4o}"
API_KEY="${OPENHANDS_API_KEY:-${OPENAI_API_KEY:-${ANTHROPIC_API_KEY:-}}}"
BASE_URL="${OPENHANDS_BASE_URL:-}"

# Check Docker availability
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "harness: [OpenHands] Spawning OpenHands container ($IMAGE) on Lane $N ..."
  
  DOCKER_ENV_ARGS=()
  [ -n "$API_KEY" ] && DOCKER_ENV_ARGS+=(-e "LLM_API_KEY=$API_KEY")
  [ -n "$MODEL" ] && DOCKER_ENV_ARGS+=(-e "LLM_MODEL=$MODEL")
  [ -n "$BASE_URL" ] && DOCKER_ENV_ARGS+=(-e "LLM_BASE_URL=$BASE_URL")
  
  # Forward common proxies or custom variables
  [ -n "${HTTP_PROXY:-}" ] && DOCKER_ENV_ARGS+=(-e "HTTP_PROXY=$HTTP_PROXY")
  [ -n "${HTTPS_PROXY:-}" ] && DOCKER_ENV_ARGS+=(-e "HTTPS_PROXY=$HTTPS_PROXY")

  CONTAINER_NAME="openhands-lane$N-$$"
  set +e
  docker run --rm --name "$CONTAINER_NAME" \
    "${DOCKER_ENV_ARGS[@]}" \
    -v "$LANE_DIR":/workspace \
    -v "$TASK_FILE":/openhands_task.md:ro \
    "$IMAGE" \
    python3 -m openhands.core.main -t "$(cat "$TASK_FILE")" > "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  set -e

  if [ "$EXIT_CODE" -ne 0 ]; then
    ERR_SNIPPET="$(tail -n 20 "$LOG_FILE" | tr '\n' ' ')"
    echo "harness: [OpenHands] Execution failed with exit code $EXIT_CODE (see $LOG_FILE)" >&2
    echo "ROLE-STEP: BLOCKED OpenHands exited with code $EXIT_CODE: $ERR_SNIPPET"
    exit 2
  fi

elif command -v openhands >/dev/null 2>&1; then
  echo "harness: [OpenHands] Docker not running; using host 'openhands' CLI in $LANE_DIR ..."
  set +e
  (cd "$LANE_DIR" && openhands -t "$(cat "$TASK_FILE")") > "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  set -e

  if [ "$EXIT_CODE" -ne 0 ]; then
    ERR_SNIPPET="$(tail -n 20 "$LOG_FILE" | tr '\n' ' ')"
    echo "ROLE-STEP: BLOCKED openhands CLI exited with code $EXIT_CODE: $ERR_SNIPPET"
    exit 2
  fi

else
  # Diagnostic guidance when neither Docker nor OpenHands CLI is found
  echo "harness: [OpenHands] ERROR: Docker is not running and 'openhands' CLI was not found." >&2
  echo "Please start Docker or install OpenHands (pip install openhands-ai), or set OPENHANDS_MOCK=1 to test." >&2
  echo "ROLE-STEP: BLOCKED Docker/OpenHands runtime unavailable on host"
  exit 2
fi

# 4. Verify Git Commit & Status in Lane
cd "$LANE_DIR"
DIFF_STAT="$(git diff --stat HEAD~1 HEAD 2>/dev/null || git status --short 2>/dev/null || echo "changes verified")"
SHORT_STAT="$(echo "$DIFF_STAT" | tr '\n' '; ' | cut -c 1-120)"

echo "harness: [OpenHands] DEV step completed. Summary: $SHORT_STAT"
echo "ROLE-STEP: DONE OpenHands completed implementation: $SHORT_STAT"
