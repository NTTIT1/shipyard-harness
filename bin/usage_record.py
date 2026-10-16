#!/usr/bin/env python3
"""Append one headless step's token usage to run/lane<N>/usage.jsonl (read by the dashboard Costs screen).

usage_record.py <harness_root> <lane> <step> <model> <effort> <state_file>   (claude -p JSON on stdin)
Never fails the step: any problem is reported on stderr and exits 0.
"""
import datetime
import json
import os
import sys


def main():
    root, lane, step, model, effort, state_file = sys.argv[1:7]
    try:
        out = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return
    usage = out.get("modelUsage") if isinstance(out, dict) else None
    if not usage:
        return
    try:
        state = json.load(open(state_file))
    except Exception:
        state = {}
    gateway = not model.startswith("claude:")
    at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    run_id = state.get("run_id") or ""
    spec_dir = state.get("spec_dir") or ""
    title = state.get("feature_title") or ""
    feature = run_id or (f"lane{lane}:{spec_dir}" if spec_dir else f"lane{lane}:{title or 'unknown'}")
    rows = []
    for name, u in usage.items():
        rec = {
            "at": at, "lane": int(lane), "source": "step", "step": step, "stage": state.get("stage") or "",
            "model": model if gateway else name, "effort": "" if gateway else effort,
            "runId": run_id, "feature": feature, "featureTitle": title,
            "in": int(u.get("inputTokens") or 0), "out": int(u.get("outputTokens") or 0),
            "cacheRead": int(u.get("cacheReadInputTokens") or 0),
            "cacheWrite": int(u.get("cacheCreationInputTokens") or 0),
            # gateway models are priced by their own provider: Claude's estimate is meaningless there
            "usd": 0 if gateway else round(float(u.get("costUSD") or 0), 6),
        }
        if rec["in"] or rec["out"] or rec["cacheRead"] or rec["cacheWrite"] or rec["usd"]:
            rows.append(rec)
    if not rows:
        return
    d = os.path.join(root, "run", f"lane{lane}")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "usage.jsonl"), "a") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # accounting must never fail the step
        print(f"harness: run-step: usage not recorded: {e}", file=sys.stderr)
