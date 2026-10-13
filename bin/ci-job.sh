#!/usr/bin/env bash
# CI API helper (CircleCI v2) — lets lane agents triage red CI themselves:
# read which tests failed, re-run a flaky workflow from failed, cancel a hung
# one — instead of empty-commit re-triggers or asking the human to paste logs.
#
#   ci-job.sh status [branch|sha]      # latest pipeline for branch (default:
#                                      #   INTEGRATION_BRANCH) or the pipeline
#                                      #   whose head sha matches; prints
#                                      #   workflows + jobs with ids/numbers
#   ci-job.sh failures <job-number>    # failed tests for that job (needs the
#                                      #   job to upload test results)
#   ci-job.sh rerun <workflow-id>      # re-run FROM FAILED (--all for full)
#   ci-job.sh cancel <workflow-id>     # cancel a hung workflow
#
# Auth: CIRCLE_CI_TOKEN (or CIRCLE_TOKEN) from config/secrets.env — a personal
# API token (project tokens cannot re-run). Project: CIRCLE_PROJECT_SLUG or
# derived as gh/$CI_REPO from the active profile's integrations.env.
# Read subcommands are safe anytime; rerun/cancel mutate CI — use them
# deliberately (one rerun per red gate, then treat the result as real).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

TOKEN="${CIRCLE_CI_TOKEN:-${CIRCLE_TOKEN:-}}"
[ -n "$TOKEN" ] || die "no CI API token — set CIRCLE_CI_TOKEN in config/secrets.env (personal API token)"
SLUG="${CIRCLE_PROJECT_SLUG:-gh/${CI_REPO:-}}"
[ "$SLUG" != "gh/" ] || die "no project slug — set CI_REPO in the profile's integrations.env (or CIRCLE_PROJECT_SLUG)"
API="https://circleci.com/api/v2"

# api <method> <path> [json-body] -> body on stdout; dies on HTTP >= 400.
api() {
  local method="$1" path="$2" body="${3:-}" out code
  out="$(mktemp)"
  if [ -n "$body" ]; then
    code="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" -H "Circle-Token: $TOKEN" \
            -H 'Content-Type: application/json' -d "$body" "$API$path")"
  else
    code="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" -H "Circle-Token: $TOKEN" "$API$path")"
  fi
  if [ "$code" -ge 400 ]; then
    echo "ci-job: HTTP $code from $path: $(cut -c1-300 "$out")" >&2
    rm -f "$out"; return 1
  fi
  cat "$out"; rm -f "$out"
}

ACTION="${1:-status}"; shift || true
case "$ACTION" in
  status)
    REF="${1:-$INTEGRATION_BRANCH}"
    if [[ "$REF" =~ ^[0-9a-f]{7,40}$ ]]; then
      PIPELINES="$(api GET "/project/$SLUG/pipeline")"
      PIPE_ID="$(printf '%s' "$PIPELINES" | python3 -c '
import json,sys
sha=sys.argv[1]
for p in json.load(sys.stdin).get("items",[]):
    if p.get("vcs",{}).get("revision","").startswith(sha):
        print(p["id"]); break' "$REF")"
      [ -n "$PIPE_ID" ] || die "no pipeline found for sha $REF (first page)"
    else
      PIPE_ID="$(api GET "/project/$SLUG/pipeline?branch=$REF" | python3 -c '
import json,sys
items=json.load(sys.stdin).get("items",[])
print(items[0]["id"] if items else "")')"
      [ -n "$PIPE_ID" ] || die "no pipelines for branch '$REF'"
    fi
    WORKFLOWS="$(api GET "/pipeline/$PIPE_ID/workflow")"
    printf '%s' "$WORKFLOWS" | python3 -c '
import json,sys
for w in json.load(sys.stdin).get("items",[]):
    print("WORKFLOW\t%s\t%s\t%s" % (w["name"], w["status"], w["id"]))'
    for WID in $(printf '%s' "$WORKFLOWS" | python3 -c '
import json,sys
for w in json.load(sys.stdin).get("items",[]): print(w["id"])'); do
      api GET "/workflow/$WID/job" | python3 -c '
import json,sys
for j in json.load(sys.stdin).get("items",[]):
    print("  JOB\t%s\t%s\t#%s" % (j["name"], j["status"], j.get("job_number","-")))'
    done
    echo "# failures <job#> for failed-test details; rerun/cancel <workflow-id> to act"
    ;;
  failures)
    JOB="${1:?usage: ci-job.sh failures <job-number>}"
    api GET "/project/$SLUG/$JOB/tests" | python3 -c '
import json,sys
items=json.load(sys.stdin).get("items",[])
fails=[t for t in items if t.get("result") not in ("success","skipped")]
if not items:
    print("no test results uploaded for this job — read the job page / artifacts instead")
elif not fails:
    print("%d tests, none failed — the job failed outside its tests (setup/infra?)" % len(items))
for t in fails:
    print("FAILED\t%s\t%s" % (t.get("classname",""), t.get("name","")))
    msg=(t.get("message") or "").strip()
    if msg: print("  " + msg[:1500].replace("\n","\n  "))'
    echo "# job page: https://app.circleci.com/pipelines/$SLUG (job #$JOB)"
    ;;
  rerun)
    WID="${1:?usage: ci-job.sh rerun <workflow-id> [--all]}"
    FROM_FAILED=true; [ "${2:-}" == "--all" ] && FROM_FAILED=false
    api POST "/workflow/$WID/rerun" "{\"from_failed\": $FROM_FAILED}" | python3 -c '
import json,sys; d=json.load(sys.stdin)
print("rerun requested:", d.get("workflow_id") or d.get("message") or d)'
    ;;
  cancel)
    WID="${1:?usage: ci-job.sh cancel <workflow-id>}"
    api POST "/workflow/$WID/cancel" | python3 -c '
import json,sys; print("cancel:", json.load(sys.stdin).get("message","requested"))'
    ;;
  *) die "unknown action '$ACTION' (status|failures|rerun|cancel)";;
esac
