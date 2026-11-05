#!/usr/bin/env python3
"""The TEST step's report: merges what was executed into one result per test case, the bugs found, and
a report a person can read.

    test-report.py <spec_dir> [--qc-dir DIR] [--title T] [--branch B]

Reads
  <spec_dir>/qc-plan.md                 the test cases (rows `| TC-n | title | type | priority | AC | ...`)
  <spec_dir>/.qc/automated.json         tester-agent: {"checks":[{name,command,result,detail}],
                                        "cases":[{id,result,note,evidence}], "bugs":[...]}
  <qc-dir>/RESULTS.json                 qc-local: {"cases":[{id,result,evidence:[png],note}], "bugs":[...]}
  <spec_dir>/test-results.json          (previous run) — keeps each bug's tracker link across re-runs
A bug is {title, severity: blocker|major|minor|cosmetic, tc, steps, expected, actual, evidence:[...]}.

Writes <spec_dir>/test-results.json, test-report.md and bugs.csv (importable into Jira / Google Sheets /
Excel), then prints one line: TEST-RESULT: pass|fail total= pass= fail= blocked= not_run= bugs=
The run fails when a check or a case failed, a P1 case did not pass, or a blocker/major bug is open.
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

RESULTS = ("pass", "fail", "blocked", "not_run")
RANK = {"fail": 3, "blocked": 2, "pass": 1, "not_run": 0}  # when two sources report one case, the worst wins
SEVERITIES = ("blocker", "major", "minor", "cosmetic")
LABEL = {"pass": "Đạt", "fail": "Không đạt", "blocked": "Bị chặn", "not_run": "Chưa chạy"}
SEV_LABEL = {"blocker": "Blocker", "major": "Major", "minor": "Minor", "cosmetic": "Cosmetic"}


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_plan(text):
    """Test cases from the plan's table(s): every row whose first cell is a TC id."""
    cases, header = [], None
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            header = None
            continue
        row = cells(line)
        if row and re.fullmatch(r"(?i)mã|id|tc", row[0]):
            header = [h.lower() for h in row]
            continue
        m = re.fullmatch(r"(?i)(TC-\d+)", row[0] if row else "")
        if not m:
            continue
        col = lambda names, i: next((row[header.index(n)] for n in names if header and n in header and header.index(n) < len(row)),
                                    row[i] if i < len(row) else "")
        title = col(["ca kiểm thử", "kịch bản", "title"], 1)
        cases.append({
            "id": m.group(1).upper(), "title": title,
            "type": col(["loại", "type"], 2), "priority": col(["ưu tiên", "priority"], 3).upper(),
            "ac": col(["ac/br", "ac"], 4), "removed": "(bỏ)" in title,
        })
    return [c for c in cases if not c["removed"]]


def norm_result(v):
    v = str(v or "").strip().lower().replace("-", "_").replace(" ", "_")
    return {"passed": "pass", "ok": "pass", "failed": "fail", "skip": "not_run", "skipped": "not_run",
            "na": "not_run", "n/a": "not_run"}.get(v, v if v in RESULTS else "not_run")


def as_list(v):
    if v is None or v == "":
        return []
    return [str(x) for x in v] if isinstance(v, list) else [str(v)]


def fingerprint(b):
    return hashlib.sha1(f"{b.get('tc', '')}|{b.get('title', '').strip().lower()}".encode()).hexdigest()[:12]


def merge(plan, sources, previous):
    by_id = {c["id"]: dict(c, result="not_run", evidence=[], notes=[], source=[]) for c in plan}
    bugs, checks = [], []
    for name, data in sources:
        for c in data.get("cases") or []:
            cid = str(c.get("id") or "").upper()
            if not cid:
                continue
            case = by_id.setdefault(cid, {"id": cid, "title": c.get("title", ""), "type": "", "priority": "", "ac": "",
                                          "result": "not_run", "evidence": [], "notes": [], "source": [], "unplanned": True})
            r = norm_result(c.get("result"))
            if RANK[r] > RANK[case["result"]]:
                case["result"] = r
            case["evidence"] += [e for e in as_list(c.get("evidence")) if e not in case["evidence"]]
            if c.get("note"):
                case["notes"].append(str(c["note"]))
            case["source"].append(name)
        for b in data.get("bugs") or []:
            if not b.get("title"):
                continue
            sev = str(b.get("severity") or "minor").lower()
            bugs.append({"title": str(b["title"]).strip(), "severity": sev if sev in SEVERITIES else "minor",
                         "tc": str(b.get("tc") or "").upper(), "steps": str(b.get("steps") or ""),
                         "expected": str(b.get("expected") or ""), "actual": str(b.get("actual") or ""),
                         "evidence": as_list(b.get("evidence")), "source": name})
        for c in data.get("checks") or []:
            checks.append({"name": str(c.get("name") or c.get("command") or "check"), "command": str(c.get("command") or ""),
                           "result": norm_result(c.get("result")), "detail": str(c.get("detail") or "")})
    # One bug per fingerprint; the tracker link of an earlier run is kept.
    known = {b.get("fingerprint"): b for b in previous.get("bugs") or [] if b.get("fingerprint")}
    out, seen = [], set()
    for b in bugs:
        fp = fingerprint(b)
        if fp in seen:
            continue
        seen.add(fp)
        b["fingerprint"] = fp
        if known.get(fp, {}).get("tracker"):
            b["tracker"] = known[fp]["tracker"]
        out.append(b)
    out.sort(key=lambda b: (SEVERITIES.index(b["severity"]), b["tc"], b["title"]))
    for i, b in enumerate(out, 1):
        b["id"] = f"BUG-{i}"
    cases = sorted(by_id.values(), key=lambda c: int(re.sub(r"\D", "", c["id"]) or 0))
    return cases, out, checks


def verdict(cases, bugs, checks):
    count = {r: sum(1 for c in cases if c["result"] == r) for r in RESULTS}
    reasons = []
    if any(c["result"] == "fail" for c in checks):
        reasons.append("kiểm tra tự động không đạt")
    if count["fail"]:
        reasons.append(f"{count['fail']} ca không đạt")
    p1 = [c["id"] for c in cases if c.get("priority") == "P1" and c["result"] in ("blocked", "not_run")]
    if p1:
        reasons.append("ca P1 chưa đạt: " + ", ".join(p1))
    serious = [b["id"] for b in bugs if b["severity"] in ("blocker", "major")]
    if serious:
        reasons.append("bug nghiêm trọng: " + ", ".join(serious))
    if not cases and not checks:
        reasons.append("không có ca kiểm thử nào được chạy")
    executed = count["pass"] + count["fail"]
    rate = round(100 * count["pass"] / executed) if executed else 0
    return ("fail" if reasons else "pass"), reasons, dict(count, total=len(cases), pass_rate=rate)


def link(b):
    t = b.get("tracker") or {}
    if t.get("url"):
        return f"[{t.get('key') or t.get('kind')}]({t['url']})"
    return t.get("key") or "—"


def esc(s):
    return str(s or "").replace("|", "\\|").replace("\n", " ")


def render(res, title, branch):
    s = res["summary"]
    ok = res["result"] == "pass"
    L = [f"# Báo cáo kiểm thử — {title or 'tính năng'}", "",
         f"Kết quả: **{'ĐẠT' if ok else 'CHƯA ĐẠT'}** · {s['total']} ca · {s['pass']} đạt · {s['fail']} không đạt · "
         f"{s['blocked']} bị chặn · {s['not_run']} chưa chạy · tỉ lệ đạt {s['pass_rate']}% · {len(res['bugs'])} bug",
         f"Nhánh: `{branch or '—'}` · Thời điểm: {res['generated_at']} · Ca kiểm thử: [qc-plan.md](qc-plan.md)", ""]
    if res["reasons"]:
        L += ["**Vì sao chưa đạt:** " + "; ".join(res["reasons"]) + ".", ""]
    if res["checks"]:
        L += ["## Kiểm tra tự động", "| Kiểm tra | Lệnh | Kết quả | Chi tiết |", "|---|---|---|---|"]
        L += [f"| {esc(c['name'])} | `{esc(c['command'])}` | {LABEL[c['result']]} | {esc(c['detail'])} |" for c in res["checks"]]
        L.append("")
    L += ["## Kết quả từng ca", "| Mã | Ca kiểm thử | Loại | Ưu tiên | AC/BR | Kết quả | Bằng chứng | Ghi chú |",
          "|---|---|---|---|---|---|---|---|"]
    for c in res["cases"]:
        ev = ", ".join(f"`{e}`" for e in c["evidence"]) or "—"
        note = "; ".join(c["notes"]) + (" (phát hiện khi kiểm thử, chưa có trong kế hoạch)" if c.get("unplanned") else "")
        L.append(f"| {c['id']} | {esc(c['title'])} | {esc(c['type'])} | {esc(c['priority'])} | {esc(c['ac'])} | "
                 f"{LABEL[c['result']]} | {ev} | {esc(note)} |")
    L += ["", "## Bug"]
    if not res["bugs"]:
        L += ["Không có bug.", ""]
    else:
        L += ["| Mã | Mức | Ca | Bug | Mong đợi → Thực tế | Bằng chứng | Theo dõi |", "|---|---|---|---|---|---|---|"]
        for b in res["bugs"]:
            ev = ", ".join(f"`{e}`" for e in b["evidence"]) or "—"
            L.append(f"| {b['id']} | {SEV_LABEL[b['severity']]} | {b['tc'] or '—'} | {esc(b['title'])} | "
                     f"{esc(b['expected'])} → {esc(b['actual'])} | {ev} | {link(b)} |")
        L.append("")
    cover = {}
    for c in res["cases"]:
        for ac in re.findall(r"(?:AC|BR)-\d+", c.get("ac") or ""):
            cover.setdefault(ac, []).append(c)
    if cover:
        L += ["## Độ phủ tiêu chí nghiệm thu", "| AC/BR | Ca | Kết quả |", "|---|---|---|"]
        for ac in sorted(cover, key=lambda a: (a[:2], int(a.split("-")[1]))):
            cs = cover[ac]
            worst = max((c["result"] for c in cs), key=lambda r: RANK[r])
            L.append(f"| {ac} | {', '.join(c['id'] for c in cs)} | {LABEL[worst]} |")
        L.append("")
    return "\n".join(L)


def write_csv(path, bugs, title):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Bug ID", "Summary", "Issue Type", "Severity", "Test case", "Steps to reproduce", "Expected",
                    "Actual", "Evidence", "Feature", "Tracker"])
        for b in bugs:
            w.writerow([b["id"], b["title"], "Bug", SEV_LABEL[b["severity"]], b["tc"], b["steps"], b["expected"],
                        b["actual"], " ".join(b["evidence"]), title, (b.get("tracker") or {}).get("url", "")])


def build(spec_dir, qc_dir=None, title="", branch=""):
    plan_path = os.path.join(spec_dir, "qc-plan.md")
    plan = parse_plan(open(plan_path, encoding="utf-8").read()) if os.path.isfile(plan_path) else []
    sources = [("automated", load_json(os.path.join(spec_dir, ".qc", "automated.json")))]
    if qc_dir:
        sources.append(("qc-local", load_json(os.path.join(qc_dir, "RESULTS.json"))))
    out_json = os.path.join(spec_dir, "test-results.json")
    previous = load_json(out_json)
    cases, bugs, checks = merge(plan, sources, previous)
    result, reasons, summary = verdict(cases, bugs, checks)
    res = {"result": result, "reasons": reasons, "summary": summary, "title": title or previous.get("title", ""),
           "branch": branch or previous.get("branch", ""),
           "generated_at": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M"),
           "checks": checks, "cases": cases, "bugs": bugs}
    save(spec_dir, res)
    return res


def save(spec_dir, res):
    with open(os.path.join(spec_dir, "test-results.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    with open(os.path.join(spec_dir, "test-report.md"), "w", encoding="utf-8") as f:
        f.write(render(res, res.get("title"), res.get("branch")) + "\n")
    write_csv(os.path.join(spec_dir, "bugs.csv"), res["bugs"], res.get("title", ""))


def line(res):
    s = res["summary"]
    return (f"TEST-RESULT: {res['result']} total={s['total']} pass={s['pass']} fail={s['fail']} "
            f"blocked={s['blocked']} not_run={s['not_run']} bugs={len(res['bugs'])}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("spec_dir")
    ap.add_argument("--qc-dir", default="")
    ap.add_argument("--title", default="")
    ap.add_argument("--branch", default="")
    a = ap.parse_args(argv)
    if not os.path.isdir(a.spec_dir):
        print(f"test-report: no spec dir {a.spec_dir}", file=sys.stderr)
        return 64
    print(line(build(a.spec_dir, a.qc_dir or None, a.title, a.branch)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
