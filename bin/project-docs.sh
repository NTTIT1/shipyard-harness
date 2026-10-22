#!/usr/bin/env bash
# The project's approved documents for one step of lane N, as a prompt section (bin/project_docs.py),
# with the lane's own profile (multi-project lanes) resolved here.
#   project-docs.sh <N> <step>      step: pm|ba|arch|design|dev|test|qc (or a sub-step name)
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
[[ "${1:-}" =~ ^[1-9]$ ]] && [ -n "${2:-}" ] || die "usage: project-docs.sh <N> <step>"
exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/project_docs.py" "$(lane_dir "$1")" "$2" "$PROFILE_DIR"
