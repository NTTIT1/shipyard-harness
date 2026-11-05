#!/usr/bin/env bash
# Files the TEST step's bugs in the tracker the profile names (BUG_TRACKER in integrations.env;
# Jira's JIRA_EMAIL/JIRA_API_TOKEN in config/secrets.env). Run from the lane clone:
#   bug-log.sh <spec_dir> [--dry-run]
# Settings and secrets go to bin/bug-log.py through its environment only — nothing is printed.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
[ -n "${1:-}" ] || { echo "usage: bug-log.sh <spec_dir> [--dry-run]" >&2; exit 64; }
export BUG_TRACKER="${BUG_TRACKER:-none}" BUG_GITHUB_REPO="${BUG_GITHUB_REPO:-}" BUG_SHEET_WEBHOOK="${BUG_SHEET_WEBHOOK:-}" \
  JIRA_URL="${JIRA_URL:-}" JIRA_PROJECT="${JIRA_PROJECT:-}" JIRA_ISSUE_TYPE="${JIRA_ISSUE_TYPE:-Bug}" \
  JIRA_EMAIL="${JIRA_EMAIL:-}" JIRA_API_TOKEN="${JIRA_API_TOKEN:-}"
exec python3 "$HARNESS_ROOT/bin/bug-log.py" "$@"
