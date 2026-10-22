#!/usr/bin/env python3
"""Per-step guardrails a project set in its workflow (frozen into the run, copied to lane state as
`step_config` by `orch.sh next`), enforced around every headless step by run-step.sh.

    step_guard.py env    <state_file> <harness-step>                -> shell assignments (SG_*)
    step_guard.py spent  <harness_root> <lane> <run_id> <phase>     -> VND this run already spent on the phase
    step_guard.py inputs <lane_dir> <spec_dir> <file>...            -> missing required inputs, one per line
    step_guard.py check  <harness_root> <lane> <state_file> <phase> -> exit 1 + reason when the budget or the
                                                                       time limit of the phase is used up

Harness sub-steps map onto the six workflow phases (plan-critic belongs to ARCH, qc-local to TEST…).
"""
import datetime
import json
import os
import shlex
import sys

PHASE = {
    'pm': 'PM', 'ba': 'BA', 'arch': 'ARCH', 'plan-critic': 'ARCH',
    'design': 'DESIGN', 'ux-design': 'DESIGN', 'ui-design': 'DESIGN', 'design-qa': 'DESIGN',
    'dev': 'DEV', 'impl-worker': 'DEV', 'code-review': 'DEV', 'backend-dev': 'DEV', 'frontend-dev': 'DEV',
    'test': 'TEST', 'qc-local': 'TEST',
}
ON_FAILURE = ('ESCALATE_HUMAN', 'RETRY', 'FAIL_RUN')


def load(p):
    try:
        return json.load(open(p))
    except Exception:
        return {}


def phase_of(step):
    return PHASE.get(step, '')


def config(state, phase):
    cfg = (state.get('step_config') or {}).get(phase) or {}
    return cfg if isinstance(cfg, dict) else {}


def env(state_file, step):
    phase = phase_of(step)
    c = config(load(state_file), phase) if phase else {}

    def num(k, lo, hi):
        try:
            v = int(c.get(k))
            return str(v) if lo <= v <= hi else ''
        except (TypeError, ValueError):
            return ''
    on_fail = c.get('onFailure') if c.get('onFailure') in ON_FAILURE else 'ESCALATE_HUMAN'
    inputs = [i for i in (c.get('requiredInputs') or []) if isinstance(i, str) and i and '..' not in i and not i.startswith('/')]
    out = {
        'SG_PHASE': phase, 'SG_MODEL': c.get('model') or '', 'SG_MAX_RETRIES': num('maxRetries', 0, 5) or '0',
        'SG_TIMEOUT_MIN': num('timeoutMinutes', 1, 480), 'SG_BUDGET_VND': num('budgetVnd', 0, 10**9) or '0',
        'SG_ON_FAILURE': on_fail, 'SG_INPUTS': '\n'.join(inputs),
    }
    return '\n'.join(f'{k}={shlex.quote(v)}' for k, v in out.items())


def usd_to_vnd(root):
    try:
        v = float(load(os.path.join(root, 'config', 'costs.json')).get('usdToVnd') or 0)
        return v if v > 0 else 26000.0
    except (TypeError, ValueError):
        return 26000.0


def spent(root, lane, run_id, phase):
    """VND spent on this phase of this run (Claude list price × the dashboard's rate; gateway rows carry
    their own USD when the gateway reported it, else 0)."""
    if not run_id or not phase:
        return 0
    total = 0.0
    path = os.path.join(root, 'run', f'lane{lane}', 'usage.jsonl')
    try:
        with open(path) as f:
            for line in f:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if r.get('runId') == run_id and phase_of(r.get('step', '')) == phase:
                    total += float(r.get('usd') or 0)
    except OSError:
        return 0
    return int(round(total * usd_to_vnd(root)))


def missing_inputs(lane_dir, spec_dir, files):
    """A bare file name is looked up in the feature's spec dir; a path is relative to the lane clone."""
    out = []
    for f in files:
        if not f or '..' in f or f.startswith('/'):
            out.append(f)
            continue
        base = os.path.join(lane_dir, spec_dir) if ('/' not in f and spec_dir) else lane_dir
        if not os.path.exists(os.path.join(base, f)):
            out.append(f)
    return out


def check(root, lane, state_file, phase):
    s = load(state_file)
    c = config(s, phase)
    budget = int(c.get('budgetVnd') or 0)
    if budget > 0:
        used = spent(root, lane, s.get('run_id') or '', phase)
        if used >= budget:
            return f'vượt ngân sách bước {phase}: đã dùng {used:,} ₫ / trần {budget:,} ₫'.replace(',', '.')
    limit = int(c.get('timeoutMinutes') or 0)
    if limit > 0 and (s.get('stage') or '').lower() == f'role-{phase.lower()}' and s.get('stage_since'):
        try:
            since = datetime.datetime.fromisoformat(s['stage_since'].replace('Z', '+00:00'))
            mins = (datetime.datetime.now(datetime.timezone.utc) - since).total_seconds() / 60
            if mins > limit:
                return f'quá giới hạn thời gian bước {phase}: {int(mins)} phút / {limit} phút'
        except ValueError:
            pass
    return ''


def main(argv):
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 64
    cmd, args = argv[1], argv[2:]
    if cmd == 'env' and len(args) == 2:
        print(env(*args))
        return 0
    if cmd == 'spent' and len(args) == 4:
        print(spent(*args))
        return 0
    if cmd == 'inputs' and len(args) >= 2:
        miss = missing_inputs(args[0], args[1], args[2:])
        if miss:
            print('\n'.join(miss))
        return 1 if miss else 0
    if cmd == 'check' and len(args) == 4:
        why = check(*args)
        if why:
            print(why)
        return 1 if why else 0
    print(__doc__, file=sys.stderr)
    return 64


if __name__ == '__main__':
    sys.exit(main(sys.argv))
