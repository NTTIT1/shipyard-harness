#!/usr/bin/env bash
# The automated half of the SECURITY step: run whatever scanners this machine has on the feature's
# changes and leave their raw results for the security-agent, which reviews them with the diff.
#   security-scan.sh <repo_dir> <out_dir> [base_ref]
# base_ref defaults to origin/$INTEGRATION_BRANCH (else origin/development). Writes into <out_dir>:
#   changed-files.txt, diff.patch, builtin-secrets.txt (always), gitleaks.json, semgrep.json,
#   npm-audit.json, pip-audit.json (when the tool exists and applies), and summary.json:
#   {"base": "...", "tools": {"<tool>": {"ran": true|false, "findings": <n>|null, "note": "..."}}}
# Nothing is installed: a missing tool is reported as not run, never as clean. Exit 0 unless usage is wrong.
# Put <out_dir> OUTSIDE the repo (run/lane<N>/security): diff.patch and scanner output can hold the very
# secrets they found and must never be committed; builtin-secrets.txt masks them.
set -uo pipefail
usage() { echo "usage: security-scan.sh <repo_dir> <out_dir> [base_ref]" >&2; exit 64; }
REPO="${1:-}"; OUT="${2:-}"; BASE="${3:-}"
[ -n "$REPO" ] && [ -n "$OUT" ] && [ -d "$REPO/.git" -o -f "$REPO/.git" ] || usage
mkdir -p "$OUT"
cd "$REPO" || usage
[ -n "$BASE" ] || BASE="origin/${INTEGRATION_BRANCH:-development}"
git rev-parse --verify --quiet "$BASE" >/dev/null || BASE="$(git rev-list --max-parents=0 HEAD | tail -1)"
MB="$(git merge-base "$BASE" HEAD 2>/dev/null || echo "$BASE")"

git diff --name-only --diff-filter=ACMR "$MB"...HEAD > "$OUT/changed-files.txt" 2>/dev/null || : > "$OUT/changed-files.txt"
git diff "$MB"...HEAD > "$OUT/diff.patch" 2>/dev/null || : > "$OUT/diff.patch"

SUMMARY="$OUT/.tools.tsv"; : > "$SUMMARY"
note() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$SUMMARY"; }  # tool ran findings note
count_json() {  # <file> <python expr over d> → number or empty
  python3 -c 'import json,sys
try:
    d=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))
except Exception: print("")' "$1" "$2"
}

# 1. Built-in secret patterns on ADDED lines only — runs everywhere, catches the obvious leaks.
python3 - "$OUT/diff.patch" > "$OUT/builtin-secrets.txt" <<'PY'
import re, sys
PATTERNS = [
    ("private key", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    ("AWS access key", r"\bAKIA[0-9A-Z]{16}\b"),
    ("GitHub token", r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    ("Slack token", r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    ("Google API key", r"\bAIza[0-9A-Za-z_-]{35}\b"),
    ("JWT", r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    ("hard-coded secret", r"(?i)\b(pass(word)?|passwd|secret|api[_-]?key|token|client[_-]?secret)\b\s*[:=]\s*['\"][^'\"\s]{6,}['\"]"),
    ("connection string with password", r"(?i)\b[a-z]+://[^/\s:@]+:[^@\s]{4,}@"),
]
PLACEHOLDER = re.compile(r"(?i)(example|changeme|your[_-]|xxx|<[^>]+>|\$\{|process\.env|os\.environ|getenv|dummy|test)")
path, line_no = "", 0
for raw in open(sys.argv[1], encoding="utf-8", errors="replace"):
    if raw.startswith("+++ "):
        path = raw[6:].strip() if raw.startswith("+++ b/") else raw[4:].strip(); continue
    m = re.match(r"^@@ -\d+(?:,\d+)? \+(\d+)", raw)
    if m:
        line_no = int(m.group(1)) - 1; continue
    if raw.startswith("+") and not raw.startswith("+++"):
        line_no += 1
        text = raw[1:].rstrip("\n")
        for name, rx in PATTERNS:
            m2 = re.search(rx, text)
            if m2 and not PLACEHOLDER.search(text):
                # Never repeat the secret: keep its first 4 characters only.
                shown = text[:m2.start()] + m2.group(0)[:4] + "…[đã che]" + text[m2.end():]
                print(f"{path}:{line_no}: {name}: {shown.strip()[:160]}")
                break
    elif not raw.startswith("-"):
        line_no += 1
PY
note builtin-secrets true "$(grep -c . "$OUT/builtin-secrets.txt" || true)" "mẫu bí mật trên các dòng thêm mới"

# 2. gitleaks — secrets in the feature's commits.
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source . --log-opts="$MB..HEAD" --report-format json --report-path "$OUT/gitleaks.json" --no-banner >/dev/null 2>&1
  note gitleaks true "$(count_json "$OUT/gitleaks.json" 'len(d)')" ""
else
  note gitleaks false "" "chưa cài gitleaks"
fi

# 3. semgrep — static analysis of the changed files (rules from the registry: needs the network).
if command -v semgrep >/dev/null 2>&1; then
  if [ -s "$OUT/changed-files.txt" ]; then
    # shellcheck disable=SC2046
    timeout 600 semgrep scan --config p/owasp-top-ten --config p/secrets --json --quiet -o "$OUT/semgrep.json" \
      $(tr '\n' ' ' < "$OUT/changed-files.txt") >/dev/null 2>&1
    n="$(count_json "$OUT/semgrep.json" 'len(d.get("results",[]))')"
    note semgrep "$([ -n "$n" ] && echo true || echo false)" "$n" "$([ -n "$n" ] || echo 'semgrep không chạy được (mạng/rule)')"
  else
    note semgrep false "" "không có file nào thay đổi"
  fi
else
  note semgrep false "" "chưa cài semgrep"
fi

# 4. Dependencies — only when this feature touched a manifest or lock file.
touched() { grep -Eq "$1" "$OUT/changed-files.txt"; }
if touched '(^|/)(package\.json|package-lock\.json)$'; then
  if command -v npm >/dev/null 2>&1; then
    dir="$(grep -E '(^|/)package(-lock)?\.json$' "$OUT/changed-files.txt" | head -1 | xargs dirname)"
    (cd "$dir" && timeout 300 npm audit --json --omit=dev > "$OUT/npm-audit.json" 2>/dev/null)
    note npm-audit true "$(count_json "$OUT/npm-audit.json" 'sum(v for k,v in d.get("metadata",{}).get("vulnerabilities",{}).items() if k in ("high","critical"))')" "chỉ đếm mức high/critical"
  else
    note npm-audit false "" "không có npm"
  fi
fi
if touched '(^|/)(requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock)$'; then
  if command -v pip-audit >/dev/null 2>&1; then
    req="$(grep -E '(^|/)requirements[^/]*\.txt$' "$OUT/changed-files.txt" | head -1)"
    if [ -n "$req" ]; then timeout 300 pip-audit -r "$req" -f json > "$OUT/pip-audit.json" 2>/dev/null
    else (cd "$(grep -E 'pyproject\.toml$' "$OUT/changed-files.txt" | head -1 | xargs dirname)" && timeout 300 pip-audit -f json > "$OUT/pip-audit.json" 2>/dev/null); fi
    note pip-audit true "$(count_json "$OUT/pip-audit.json" 'sum(len(x.get("vulns",[])) for x in (d.get("dependencies",d) if isinstance(d,dict) else d))')" ""
  else
    note pip-audit false "" "chưa cài pip-audit"
  fi
fi
if touched '(^|/)(pom\.xml|build\.gradle(\.kts)?)$'; then
  note java-deps false "" "phụ thuộc Java: agent tự đối chiếu phiên bản thư viện đã đổi"
fi

python3 - "$SUMMARY" "$OUT/summary.json" "$BASE" <<'PY'
import json, sys
tools = {}
for line in open(sys.argv[1], encoding="utf-8"):
    name, ran, n, note = (line.rstrip("\n").split("\t") + ["", "", ""])[:4]
    tools[name] = {"ran": ran == "true", "findings": int(n) if n.strip().isdigit() else None, "note": note}
json.dump({"base": sys.argv[3], "tools": tools}, open(sys.argv[2], "w"), ensure_ascii=False, indent=2)
PY
rm -f "$SUMMARY"
cat "$OUT/summary.json"
