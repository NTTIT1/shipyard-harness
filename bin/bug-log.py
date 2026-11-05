#!/usr/bin/env python3
"""Files the TEST step's bugs (test-results.json, from bin/test-report.py) in the project's bug tracker,
once per bug: a bug already filed keeps its link and is never filed twice.

    bug-log.py <spec_dir> [--tracker github|jira|sheets|none] [--dry-run]

The tracker defaults to $BUG_TRACKER (lane profile integrations.env); `none` (the default) files nothing —
bugs.csv next to the report can still be imported into Jira, Google Sheets or Excel by hand.
  github  gh issue create in $BUG_GITHUB_REPO (else the repo of the current directory); label `bug` if it exists
  jira    POST $JIRA_URL/rest/api/2/issue — project $JIRA_PROJECT, type $JIRA_ISSUE_TYPE (Bug),
          basic auth $JIRA_EMAIL + $JIRA_API_TOKEN
  sheets  POST each bug as JSON to $BUG_SHEET_WEBHOOK (a Google Apps Script web app that appends a row;
          it may answer {"url": "..."} — the row's link)
Secrets are read from the environment only and never printed. Prints one line per bug and a final
`BUG-LOG: filed=<n> kept=<n> failed=<n> tracker=<name>`; exit 0 even when a tracker is down (the bugs
stay in the report; re-run later).
"""
import argparse
import base64
import importlib.util
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("test_report", os.path.join(HERE, "test-report.py"))
test_report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(test_report)

PRIORITY = {"blocker": "Highest", "major": "High", "minor": "Medium", "cosmetic": "Low"}


def body(b, res):
    ev = "\n".join(f"- `{e}`" for e in b["evidence"]) or "- (không có)"
    return (f"**Tính năng:** {res.get('title') or '—'} · nhánh `{res.get('branch') or '—'}`\n"
            f"**Mức độ:** {test_report.SEV_LABEL[b['severity']]} · **Ca kiểm thử:** {b['tc'] or '—'}\n\n"
            f"### Các bước tái hiện\n{b['steps'] or '—'}\n\n### Mong đợi\n{b['expected'] or '—'}\n\n"
            f"### Thực tế\n{b['actual'] or '—'}\n\n### Bằng chứng\n{ev}\n\n"
            f"_Ghi bởi Shipyard (bước Kiểm thử) · {b['id']} · {b['fingerprint']}_")


def http(url, data, headers):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode() or "{}"
    try:
        return json.loads(raw)
    except ValueError:
        return {}


def file_github(b, res, env, run=subprocess.run):
    title = f"[Bug][{test_report.SEV_LABEL[b['severity']]}] {b['title']}"
    cmd = ["gh", "issue", "create", "--title", title, "--body", body(b, res)]
    if env.get("BUG_GITHUB_REPO"):
        cmd += ["--repo", env["BUG_GITHUB_REPO"]]
    p = run(cmd + ["--label", "bug"], capture_output=True, text=True)
    if p.returncode != 0 and "label" in (p.stderr or "").lower():
        p = run(cmd, capture_output=True, text=True)  # the repo has no `bug` label
    if p.returncode != 0:
        raise RuntimeError((p.stderr or "gh failed").strip().splitlines()[-1][:200])
    url = (p.stdout or "").strip().splitlines()[-1]
    return {"kind": "github", "key": "#" + url.rstrip("/").rsplit("/", 1)[-1], "url": url}


def file_jira(b, res, env, post=http):
    for k in ("JIRA_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT"):
        if not env.get(k):
            raise RuntimeError(f"thiếu {k}")
    auth = base64.b64encode(f"{env['JIRA_EMAIL']}:{env['JIRA_API_TOKEN']}".encode()).decode()
    base = env["JIRA_URL"].rstrip("/")
    fields = {"project": {"key": env["JIRA_PROJECT"]}, "issuetype": {"name": env.get("JIRA_ISSUE_TYPE") or "Bug"},
              "summary": b["title"][:250], "description": body(b, res), "labels": ["shipyard", "test-" + b["severity"]]}
    if env.get("JIRA_SET_PRIORITY", "1") != "0":
        fields["priority"] = {"name": PRIORITY[b["severity"]]}
    try:
        r = post(f"{base}/rest/api/2/issue", {"fields": fields}, {"Authorization": f"Basic {auth}"})
    except urllib.error.HTTPError as e:
        if "priority" in fields and e.code == 400:  # the project's screen has no priority field
            fields.pop("priority")
            r = post(f"{base}/rest/api/2/issue", {"fields": fields}, {"Authorization": f"Basic {auth}"})
        else:
            raise
    key = r.get("key")
    if not key:
        raise RuntimeError("Jira không trả về mã issue")
    return {"kind": "jira", "key": key, "url": f"{base}/browse/{key}"}


def file_sheets(b, res, env, post=http):
    url = env.get("BUG_SHEET_WEBHOOK")
    if not url:
        raise RuntimeError("thiếu BUG_SHEET_WEBHOOK")
    row = {"id": b["id"], "title": b["title"], "severity": b["severity"], "tc": b["tc"], "steps": b["steps"],
           "expected": b["expected"], "actual": b["actual"], "evidence": " ".join(b["evidence"]),
           "feature": res.get("title", ""), "branch": res.get("branch", ""), "fingerprint": b["fingerprint"]}
    r = post(url, row, {})
    return {"kind": "sheets", "key": r.get("row") and f"row {r['row']}" or "sheet", "url": r.get("url", "")}


TRACKERS = {"github": file_github, "jira": file_jira, "sheets": file_sheets}


def log_bugs(spec_dir, tracker, env=os.environ, dry_run=False, filers=TRACKERS):
    path = os.path.join(spec_dir, "test-results.json")
    res = test_report.load_json(path)
    if not res:
        raise SystemExit(f"bug-log: {path} chưa có — chạy test-report.py trước")
    filed = kept = failed = 0
    for b in res.get("bugs") or []:
        if b.get("tracker"):
            kept += 1
            continue
        if tracker == "none":
            continue
        if dry_run:
            print(f"{b['id']}: sẽ ghi vào {tracker} — {b['title']}")
            continue
        try:
            b["tracker"] = filers[tracker](b, res, env)
            filed += 1
            print(f"{b['id']}: {b['tracker']['key']} {b['tracker'].get('url', '')}")
        except Exception as e:  # noqa: BLE001 — one bug failing must not lose the others
            failed += 1
            print(f"{b['id']}: không ghi được vào {tracker}: {str(e)[:200]}")
    if filed and not dry_run:
        test_report.save(spec_dir, res)  # the report and bugs.csv now link each filed bug
    print(f"BUG-LOG: filed={filed} kept={kept} failed={failed} tracker={tracker}")
    return filed, kept, failed


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("spec_dir")
    ap.add_argument("--tracker", default=os.environ.get("BUG_TRACKER") or "none")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    tracker = a.tracker.strip().lower()
    if tracker not in ("none", *TRACKERS):
        print(f"bug-log: tracker không hỗ trợ: {tracker} (github | jira | sheets | none)", file=sys.stderr)
        return 64
    log_bugs(a.spec_dir, tracker, dry_run=a.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
