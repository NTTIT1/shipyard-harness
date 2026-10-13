#!/usr/bin/env bash
# Spec-driven helpers: naming for specs/<YYYY-MM-DD>-<slug>/ in the target repo
# and template lookup (profile override > harness default).
#   spec-path.sh slugify "<text>"           ascii kebab slug (<=50 chars)
#   spec-path.sh new "<title>" [repo_dir]   repo-relative path of a NEW spec dir (not created)
#   spec-path.sh dirslug <spec_dir>         slug without the date prefix
#   spec-path.sh branchslug <spec_dir>      dirslug made unique for THIS lane (run in the lane
#                                           clone): skips slugs whose branch exists locally or
#                                           on origin, or whose lane state record exists (-2, -3…)
#   spec-path.sh template <name>            effective template path (constitution|spec|plan|tasks)
# Date comes from $SPEC_DATE (tests) or today. Dates, not 001-style numbers, so
# parallel lanes can't pick the same name.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

slugify() {
  python3 - "$1" <<'PY'
import re, sys, unicodedata
s = sys.argv[1].replace("đ", "d").replace("Đ", "D")
s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50].strip("-")
if not s:
    sys.exit(1)
print(s)
PY
}

case "${1:-}" in
  slugify)
    slugify "${2:-}" || die "slug is empty after normalizing '${2:-}'"
    ;;
  new)
    slug="$(slugify "${2:-}")" || die "slug is empty after normalizing '${2:-}'"
    repo="${3:-$(pwd)}"
    base="specs/${SPEC_DATE:-$(date +%F)}-$slug"
    cand="$base"; k=2
    while [ -e "$repo/$cand" ]; do cand="$base-$k"; k=$((k + 1)); done
    printf '%s\n' "$cand"
    ;;
  dirslug)
    d="${2:-}"; d="${d%/}"; d="$(basename "$d")"
    printf '%s\n' "$d" | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//'
    ;;
  branchslug)
    base="$("$0" dirslug "${2:-}")"
    n="$(cat .harness-lane 2>/dev/null || true)"
    taken() {
      git rev-parse -q --verify "refs/heads/$BRANCH_PREFIX$1" >/dev/null 2>&1 ||
      git rev-parse -q --verify "refs/remotes/origin/$BRANCH_PREFIX$1" >/dev/null 2>&1 ||
      { [ -n "$n" ] && [ -f "$HARNESS_ROOT/state/lane$n/$1.json" ]; }
    }
    cand="$base"; k=2
    while taken "$cand"; do cand="$base-$k"; k=$((k + 1)); done
    printf '%s\n' "$cand"
    ;;
  template)
    name="${2:-}"
    case "$name" in constitution|spec|plan|tasks) ;; *) die "unknown template '$name' (constitution|spec|plan|tasks)";; esac
    if [ -f "$PROFILE_DIR/spec-templates/$name.md" ]; then
      printf '%s\n' "$PROFILE_DIR/spec-templates/$name.md"
    elif [ -f "$_HARNESS_BIN/../templates/spec/$name.md" ]; then
      printf '%s\n' "$(cd "$_HARNESS_BIN/../templates/spec" && pwd)/$name.md"
    else
      die "template '$name' not found"
    fi
    ;;
  *) die "usage: spec-path.sh slugify|new|dirslug|branchslug|template ...";;
esac
