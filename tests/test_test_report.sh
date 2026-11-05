#!/usr/bin/env bash
# TEST step report (bin/test-report.py) and bug filing (bin/bug-log.py): one result per test case from
# both executors (worst wins), P1 not run fails the run, bugs keep their tracker link across re-runs and
# are filed once.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
S="$T/spec"; Q="$T/qc"; mkdir -p "$S/.qc" "$Q"
cat > "$S/qc-plan.md" <<'MD'
# QC Plan — Ca kiểm thử — Nghỉ phép
| Mã | Ca kiểm thử | Loại | Ưu tiên | AC/BR | Điều kiện trước | Các bước | Kết quả mong đợi |
|---|---|---|---|---|---|---|---|
| TC-1 | Gửi đơn nghỉ hợp lệ | UI | P1 | AC-1 | | 1. mở | đơn ở trạng thái Chờ duyệt |
| TC-2 | Ngày kết thúc trước ngày bắt đầu | API | P1 | AC-2, BR-1 | | | 400 |
| TC-3 | Nhân viên không thấy đơn người khác | API | P2 | AC-3 | | | 403 |
| TC-4 | (bỏ) ca cũ | UI | P3 | AC-1 | | | |
MD
cat > "$S/.qc/automated.json" <<'JS'
{"checks":[{"name":"Unit","command":"mvn -q test","result":"pass","detail":"40 test"}],
 "cases":[{"id":"TC-2","result":"fail","evidence":[".qc/logs/tc2.log"]},{"id":"tc-3","result":"passed"}],
 "bugs":[{"title":"Lưu được đơn có ngày kết thúc trước ngày bắt đầu","severity":"major","tc":"TC-2","expected":"400","actual":"201"}]}
JS
cat > "$Q/RESULTS.json" <<'JS'
{"cases":[{"id":"TC-1","result":"pass","evidence":["01-TC-1-gui-don.png"]},{"id":"TC-2","result":"pass"},
          {"id":"TC-5","result":"fail","evidence":["05-TC-5-reload.png"],"title":"Tải lại trang mất bộ lọc"}],
 "bugs":[{"title":"Tải lại trang mất bộ lọc","severity":"minor","tc":"TC-5","evidence":["05-TC-5-reload.png"]}]}
JS
out="$(python3 "$REPO/bin/test-report.py" "$S" --qc-dir "$Q" --title "Nghỉ phép" --branch feat/nghi-phep)"
assert_eq "TEST-RESULT: fail total=4 pass=2 fail=2 blocked=0 not_run=0 bugs=2" "$out" "worst result per case wins; removed case dropped; discovered case kept"
j() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))' "$S/test-results.json" "$1"; }
assert_eq "fail" "$(j '[c["result"] for c in d["cases"] if c["id"]=="TC-2"][0]')" "API fail beats browser pass"
assert_eq "BUG-1 major" "$(j 'd["bugs"][0]["id"]+" "+d["bugs"][0]["severity"]')" "bugs sorted by severity"
assert_eq "True" "$(j '[c for c in d["cases"] if c["id"]=="TC-5"][0].get("unplanned", False)')" "a case found during QC is marked unplanned"
r="$(cat "$S/test-report.md")"
assert_contains "$r" "CHƯA ĐẠT" "report states the verdict"
assert_contains "$r" "bug nghiêm trọng: BUG-1" "report says why it failed"
assert_contains "$r" "\`01-TC-1-gui-don.png\`" "report links the evidence"
assert_contains "$r" "| AC-2 | TC-2 | Không đạt |" "report shows AC coverage"
assert_eq "3" "$(wc -l < "$S/bugs.csv" | tr -d ' ')" "bugs.csv has a header and one row per bug"

# A P1 case that never ran fails the run even with no failures.
rm "$Q/RESULTS.json"; echo '{"cases":[{"id":"TC-2","result":"pass"},{"id":"TC-3","result":"pass"}]}' > "$S/.qc/automated.json"
out="$(python3 "$REPO/bin/test-report.py" "$S" --qc-dir "$Q")"
assert_contains "$out" "TEST-RESULT: fail" "P1 not run fails the run"
assert_contains "$(cat "$S/test-report.md")" "ca P1 chưa đạt: TC-1" "report names the P1 case not run"
echo '{"cases":[{"id":"TC-1","result":"pass"},{"id":"TC-2","result":"pass"},{"id":"TC-3","result":"pass"}]}' > "$S/.qc/automated.json"
assert_contains "$(python3 "$REPO/bin/test-report.py" "$S")" "TEST-RESULT: pass total=3 pass=3" "all cases pass → pass"

# Bug filing: once per bug, link kept by the next report run.
echo '{"cases":[{"id":"TC-1","result":"fail"}],"bugs":[{"title":"Nút Gửi không phản hồi","severity":"blocker","tc":"TC-1"}]}' > "$Q/RESULTS.json"
python3 "$REPO/bin/test-report.py" "$S" --qc-dir "$Q" >/dev/null
out="$(cd "$T" && python3 - "$REPO/bin" "$S" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("bug_log", sys.argv[1] + "/bug-log.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
calls = []
fake = lambda b, res, env: calls.append(b["title"]) or {"kind": "jira", "key": "HRM-7", "url": "https://x.atlassian.net/browse/HRM-7"}
m.log_bugs(sys.argv[2], "jira", env={}, filers={"jira": fake})
m.log_bugs(sys.argv[2], "jira", env={}, filers={"jira": fake})
print("calls", len(calls))
PY
)"
assert_contains "$out" "BUG-LOG: filed=1 kept=0 failed=0 tracker=jira" "a new bug is filed"
assert_contains "$out" "BUG-LOG: filed=0 kept=1 failed=0 tracker=jira" "a filed bug is not filed again"
assert_contains "$out" "calls 1" "the tracker is called once"
assert_contains "$(cat "$S/test-report.md")" "[HRM-7](https://x.atlassian.net/browse/HRM-7)" "report links the tracker issue"
python3 "$REPO/bin/test-report.py" "$S" --qc-dir "$Q" >/dev/null
assert_contains "$(cat "$S/test-report.md")" "HRM-7" "a re-run keeps the tracker link"
out="$(python3 "$REPO/bin/bug-log.py" "$S" --tracker jira 2>&1)"
assert_contains "$out" "kept=1" "CLI: nothing new to file"
out="$(python3 "$REPO/bin/bug-log.py" "$S" --tracker trello 2>&1)"; rc=$?
assert_eq "64" "$rc" "unknown tracker is a usage error"

# Jira without settings: reported per bug, never a crash, nothing secret printed.
echo '{"cases":[{"id":"TC-1","result":"fail"}],"bugs":[{"title":"Lỗi khác","severity":"minor","tc":"TC-1"}]}' > "$Q/RESULTS.json"
python3 "$REPO/bin/test-report.py" "$S" --qc-dir "$Q" >/dev/null
out="$(env -u JIRA_URL python3 "$REPO/bin/bug-log.py" "$S" --tracker jira 2>&1)"
assert_contains "$out" "thiếu JIRA_URL" "missing Jira settings are named"
assert_contains "$out" "failed=1" "a bug that could not be filed is counted"
finish
