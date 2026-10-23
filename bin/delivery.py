#!/usr/bin/env python3
"""A lane's pipeline after the code is written, resolved from three layers (later wins):

  1. the lane profile (integrations.env + profile.env) — what every lane had before;
  2. the project's default, frozen into the run (orchestrator → lane state `delivery`);
  3. this lane's own override (config/lanes/lane<N>.pipeline.json, set on the dashboard).

  delivery.py env <state_file> <lane_override_json>   prints `export` lines for bin/lane-env.sh
  delivery.py show <state_file> <lane_override_json>  prints the resolved settings as JSON

The profile's values come from the environment (lane-env.sh has sourced the profile). Every value is
re-checked here: the files are machine-written, but nothing unchecked reaches a shell.
"""
import json
import os
import re
import sys

CHECKS = ["ciGate", "e2e", "codeReview", "qcLocal", "seniorGate"]
BRANCH = re.compile(r"^[A-Za-z0-9._/-]{1,100}$")
CONTEXT = re.compile(r"^[A-Za-z0-9 ._:/()-]{1,100}$")
URL = re.compile(r"^https?://[^\s'\"`<>\\]{1,300}$")


def _read(p):
    try:
        with open(p, encoding="utf-8") as fh:
            d = json.load(fh)
    except (OSError, ValueError):
        return {}
    return d if isinstance(d, dict) else {}


def _bool(v):
    return v is True or str(v).lower() in ("1", "true")


def from_profile(env):
    """Layer 1: what the profile says (the behaviour before per-project pipelines)."""
    base = env.get("INTEGRATION_BRANCH") or env.get("BASE_BRANCH") or "development"
    return {
        **{c: True for c in CHECKS}, "openPr": True, "localMerge": False, "prBase": base, "merge": "HUMAN", "mergeMethod": "SQUASH",
        "deployWait": env.get("CI_WAIT_ENABLED") == "1", "deployContext": env.get("CI_DEPLOY_CONTEXT", ""),
        "deployTimeoutMinutes": 30,
        "testQc": env.get("DEV_QC_ENABLED") == "1", "testUrl": env.get("DEV_SITE_URL", ""), "testQcOnFail": "FIX_PR",
        "ticket": env.get("TRACKER_ENABLED") == "1",
    }


def apply(cur, layer):
    """One layer over the current settings; only valid values are taken."""
    out = dict(cur)
    for c in CHECKS + ["openPr", "localMerge", "deployWait", "testQc", "ticket"]:
        if c in layer:
            out[c] = _bool(layer[c])
    v = str(layer.get("prBase") or "").strip()
    if v and BRANCH.match(v) and not v.startswith("-") and ".." not in v:
        out["prBase"] = v
    if layer.get("merge") in ("HUMAN", "AUTO"):
        out["merge"] = layer["merge"]
    if layer.get("mergeMethod") in ("SQUASH", "MERGE", "REBASE"):
        out["mergeMethod"] = layer["mergeMethod"]
    v = str(layer.get("deployContext") or "").strip()
    if v and CONTEXT.match(v):
        out["deployContext"] = v
    try:
        if layer.get("deployTimeoutMinutes") not in (None, ""):
            out["deployTimeoutMinutes"] = max(1, min(240, int(float(layer["deployTimeoutMinutes"]))))
    except (TypeError, ValueError):
        pass
    v = str(layer.get("testUrl") or "").strip()
    if v and URL.match(v):
        out["testUrl"] = v
    if layer.get("testQcOnFail") in ("FIX_PR", "HUMAN"):
        out["testQcOnFail"] = layer["testQcOnFail"]
    # Consistency: no PR → nothing to merge or verify after a merge; a switch on without its target is off.
    if not out["openPr"]:
        out.update(merge="HUMAN", deployWait=False, testQc=False)
    else:
        out["localMerge"] = False
    if out["deployWait"] and not out["deployContext"]:
        out["deployWait"] = False
    if out["testQc"] and not out["testUrl"]:
        out["testQc"] = False
    return out


def resolve(state_file, override_file, env=os.environ):
    state = _read(state_file)
    project = state.get("delivery") if isinstance(state.get("delivery"), dict) else {}
    lane = _read(override_file) if override_file else {}
    out = from_profile(env)
    if project:
        out = apply(out, project)
    if lane:
        out = apply(out, lane)
    out["source"] = "lane" if lane else "project" if project else "profile"
    return out


def q(v):
    return "'" + str(v).replace("'", "'\\''") + "'"


def exports(d):
    on = lambda b: "1" if b else "0"
    pairs = [
        ("PIPELINE_SOURCE", d["source"]),
        ("STAGE_CI_GATE", on(d["ciGate"])), ("STAGE_E2E", on(d["e2e"])), ("STAGE_CODE_REVIEW", on(d["codeReview"])),
        ("STAGE_QC_LOCAL", on(d["qcLocal"])), ("STAGE_SENIOR_GATE", on(d["seniorGate"])),
        ("OPEN_PR", on(d["openPr"])), ("LOCAL_MERGE", on(d["localMerge"])), ("PR_BASE", d["prBase"]), ("MERGE_MODE", d["merge"]), ("MERGE_METHOD", d["mergeMethod"]),
        ("CI_WAIT_ENABLED", on(d["deployWait"])), ("CI_DEPLOY_CONTEXT", d["deployContext"]),
        ("CI_WAIT_TIMEOUT_MIN", d["deployTimeoutMinutes"]),
        ("DEV_QC_ENABLED", on(d["testQc"])), ("DEV_SITE_URL", d["testUrl"]), ("DEV_QC_ON_FAIL", d["testQcOnFail"]),
        ("TRACKER_ENABLED", on(d["ticket"])),
    ]
    return "".join(f"export {k}={q(v)}\n" for k, v in pairs)


def main(argv):
    if len(argv) != 4 or argv[1] not in ("env", "show"):
        sys.stderr.write(__doc__)
        return 64
    d = resolve(argv[2], argv[3])
    sys.stdout.write(exports(d) if argv[1] == "env" else json.dumps(d, ensure_ascii=False, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
