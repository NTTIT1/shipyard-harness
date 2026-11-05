#!/usr/bin/env bash
# SECURITY step scanner (bin/security-scan.sh): finds secrets on added lines only, masks them, skips
# placeholders, reports tools that are not installed as "not run" (never as clean).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
R="$T/repo"; O="$T/out"
mkdir -p "$R" && cd "$R" || exit 1
git init -q -b development && git config user.email t@t && git config user.name t
printf 'old = "AKIAOLDOLDOLDOLDOLD1"\n' > old.js && git add . && git commit -qm init
git checkout -qb feat/x
cat > app.js <<'JS'
const db = "postgres://app:S3cretPw9@db:5432/x";
const k = "AKIAABCDEFGHIJKLMNOP";
const p = process.env.DB_PASSWORD;
const api_key = "changeme-example";
JS
git add . && git commit -qm feat
cd - >/dev/null || exit 1

# Only the scanner's own tools: a PATH without gitleaks/semgrep.
PATH="/usr/bin:/bin" bash "$REPO/bin/security-scan.sh" "$R" "$O" development >/dev/null
assert_file "$O/summary.json" "summary written"
s="$(cat "$O/builtin-secrets.txt")"
assert_eq "2" "$(grep -c . "$O/builtin-secrets.txt")" "two real secrets on added lines (env var and placeholder skipped)"
assert_contains "$s" "app.js:1: connection string with password" "connection string found with file:line"
assert_contains "$s" "app.js:2: AWS access key" "AWS key found"
case "$s" in *S3cretPw9*|*ABCDEFGHIJKLMNOP*) r=leaked ;; *) r=masked ;; esac
assert_eq "masked" "$r" "the secret itself is never repeated"
case "$s" in *old.js*) r=yes ;; *) r=no ;; esac
assert_eq "no" "$r" "code already on the base branch is not this feature's finding"
ran() { python3 -c 'import json,sys;t=json.load(open(sys.argv[1]))["tools"].get(sys.argv[2]);print("absent" if t is None else str(t["ran"]).lower())' "$O/summary.json" "$1"; }
assert_eq "true" "$(ran builtin-secrets)" "built-in check always runs"
command -v gitleaks >/dev/null 2>&1 || assert_eq "false" "$(ran gitleaks)" "missing gitleaks is reported as not run"
assert_eq "absent" "$(ran npm-audit)" "no manifest touched → no dependency audit entry"
bash "$REPO/bin/security-scan.sh" 2>/dev/null; assert_eq "64" "$?" "usage error without arguments"
finish
