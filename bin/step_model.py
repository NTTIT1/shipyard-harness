#!/usr/bin/env python3
"""Resolve the model and effort configured for one pipeline step of a lane.

    step_model.py <state_file> <models.json> <step> <lane>   ->  "<model>\t<effort>"

Model: lane state models.<step> -> feature config -> lane config -> models.json defaults.<step>
-> claude:claude-opus-5-5. Effort likewise (Claude models only use it). Shared by run-step.sh and
dev-engine.sh so both agree on what a step runs on.
"""
import json
import sys

EFFORTS = ("low", "medium", "high", "xhigh", "max")


def load(p):
    try:
        return json.load(open(p))
    except Exception:
        return {}


def resolve(state_file, models_file, step, lane):
    s, c = load(state_file), load(models_file)
    feats = c.get("features") or {}
    fcfg = {}
    keys = (s.get("run_id"),
            f"lane{lane}:{s.get('spec_dir')}" if s.get("spec_dir") else None, s.get("spec_dir"),
            f"lane{lane}:{s.get('feature_title')}" if s.get("feature_title") else None, s.get("feature_title"))
    for k in keys:
        if k and isinstance(feats.get(k), dict):
            fcfg = feats[k]
            break
    lcfg = (c.get("lanes") or {}).get(str(lane)) or {}
    model = ((s.get("models") or {}).get(step) or (fcfg.get("models") or fcfg).get(step)
             or (lcfg.get("models") or lcfg).get(step) or (c.get("defaults") or {}).get(step)
             or "claude:claude-opus-5-5")
    effort = ((s.get("effort") or {}).get(step) or (fcfg.get("effort") or {}).get(step)
              or (lcfg.get("effort") or {}).get(step) or (c.get("effort") or {}).get(step) or "")
    return model, effort if effort in EFFORTS else ""


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(__doc__, file=sys.stderr)
        sys.exit(64)
    m, e = resolve(*sys.argv[1:5])
    print(f"{m}\t{e}")
