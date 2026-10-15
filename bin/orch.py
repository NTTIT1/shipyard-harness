#!/usr/bin/env python3
"""Bridge between a harness lane and the Shipyard Platform role pipeline (spec §6.2).

  orch.sh <N> create --title T [--description D] [--created-by U]
  orch.sh <N> next
  orch.sh <N> sync                 # approved docs (+ reviewer edits) -> $SPEC_DIR
  orch.sh <N> pack                 # context pack -> $SPEC_DIR/.context/<STEP>-r<rev>.md
  orch.sh <N> submit <STEP> --summary-file F [--has-ui true|false] [--image PATH[::caption]]...
                                   [--meta k=v]... [--doc NAME]...
  orch.sh <N> reopen --reason R
  orch.sh <N> release --summary S
  orch.sh <N> search "query" [--kinds A,B] [--k 8] | get <itemId> | related TYPE:key

Exit: 0 ok · 2 platform unreachable (park the lane blocked) · 3 rejected (fix, retry) · 64 usage
"""
import argparse
import json
import os
import pathlib
import shlex
import socket
import subprocess
import sys
import urllib.error
import urllib.request

BIN = pathlib.Path(__file__).resolve().parent
STEP_DOCS = {'PM': ['spec.md'], 'BA': ['ba.md'], 'ARCH': ['plan.md', 'tasks.md', 'entities.json'],
             'DESIGN': ['design.md'], 'DEV': [], 'TEST': ['qc-plan.md']}
OPEN_MODES = {'WORK', 'REVISE', 'WAIT', 'RELEASE'}


class Unreachable(Exception):
    pass


class Rejected(Exception):
    pass


class Usage(Exception):
    pass


def orch_url():
    return os.environ.get('ORCHESTRATOR_URL', 'http://127.0.0.1:9084').rstrip('/')


def ctx_url():
    return os.environ.get('CONTEXT_URL', 'http://127.0.0.1:9085').rstrip('/')


def _token():
    t = os.environ.get('SHIPYARD_SERVICE_TOKEN')
    if t:
        return t
    f = pathlib.Path(os.environ.get('HARNESS_ROOT') or BIN.parent, 'run', 'platform', 'service-token')
    return f.read_text().strip() if f.is_file() else 'dev-service-token'


def call(method, url, body=None, timeout=None):
    """JSON call to a platform service; returns the envelope's `data`."""
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'X-Service-Token': _token()})
    try:
        with urllib.request.urlopen(req, timeout=timeout or float(os.environ.get('ORCH_TIMEOUT', '60'))) as r:
            return (json.loads(r.read() or b'{}') or {}).get('data')
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read() or b'{}').get('message')
        except ValueError:
            msg = None
        if e.code >= 500:
            raise Unreachable(f'{url}: HTTP {e.code} {msg or ""}'.strip())
        raise Rejected(msg or f'HTTP {e.code} from {url}')
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise Unreachable(f'{url}: {e}')


class Lane:
    def __init__(self, n):
        self.n = str(n)
        r = subprocess.run(['bash', str(BIN / 'lane-env.sh'), self.n], capture_output=True, text=True)
        if r.returncode != 0:
            raise Usage(f'lane-env.sh {self.n} failed: {r.stderr.strip()}')
        self.env = {}
        for line in r.stdout.splitlines():
            if line.startswith('export ') and '=' in line:
                k, v = line[7:].split('=', 1)
                self.env[k] = (shlex.split(v) or [''])[0]
        self.dir = pathlib.Path(self.env['LANE_DIR'])

    def state(self, *args):
        r = subprocess.run(['bash', str(BIN / 'state.sh'), self.n, *args], capture_output=True, text=True)
        if r.returncode != 0:
            raise Usage(f'state.sh {self.n} {args[0]} failed: {r.stderr.strip()}')
        return r.stdout.strip()

    def get(self, key):
        return self.state('get', key)

    def set(self, **kv):
        self.state('set', *[f'{k}={v}' for k, v in kv.items()])

    def run_id(self):
        rid = self.get('run_id')
        if not rid:
            raise Rejected(f'lane {self.n} has no run — start one with: orch.sh {self.n} create --title …')
        return rid

    def project(self):
        pid = self.get('run_project_id') or self.env.get('PLATFORM_PROJECT_ID', '')
        if not pid:
            raise Rejected('PLATFORM_PROJECT_ID is not set in this profile\'s integrations.env '
                           '(set it to the platform project id to use the role pipeline)')
        return pid

    def next(self):
        return call('GET', f'{orch_url()}/internal/v1/runs/{self.run_id()}/next')


def cmd_create(lane, a):
    rid = lane.get('run_id')
    if rid:
        try:
            if call('GET', f'{orch_url()}/internal/v1/runs/{rid}/next').get('mode') in OPEN_MODES:
                return rid
        except Rejected:
            pass  # unknown run (e.g. platform DB reset) → start a new one
    project = lane.env.get('PLATFORM_PROJECT_ID', '')
    if not project:
        raise Rejected('PLATFORM_PROJECT_ID is not set in this profile\'s integrations.env '
                       '(set it to the platform project id to use the role pipeline)')
    run = call('POST', f'{orch_url()}/internal/v1/runs', {
        'projectId': project, 'laneRef': f'{socket.gethostname()}:lane{lane.n}', 'title': a.title,
        'description': a.description or '', 'createdBy': a.created_by or lane.get('assigned_by') or 'harness'})
    lane.set(run_id=run['id'], run_project_id=project, stage='role-pm', status='running')
    return run['id']


def cmd_next(lane, a):
    return json.dumps(lane.next(), ensure_ascii=False)


def cmd_reopen(lane, a):
    nx = call('POST', f'{orch_url()}/internal/v1/runs/{lane.run_id()}/reopen', {'reason': a.reason})
    lane.set(stage='role-dev', status='running', needs_action='')
    return json.dumps(nx, ensure_ascii=False)


def cmd_release(lane, a):
    call('POST', f'{orch_url()}/internal/v1/runs/{lane.run_id()}/release', {'summary': a.summary})
    lane.set(needs_action='')
    return 'released'


COMMANDS = {'create': cmd_create, 'next': cmd_next, 'reopen': cmd_reopen, 'release': cmd_release}


def parser():
    p = argparse.ArgumentParser(prog='orch.sh', add_help=True)
    p.add_argument('lane')
    sub = p.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('create')
    c.add_argument('--title', required=True)
    c.add_argument('--description', default='')
    c.add_argument('--created-by', default='')
    sub.add_parser('next')
    r = sub.add_parser('reopen')
    r.add_argument('--reason', required=True)
    r = sub.add_parser('release')
    r.add_argument('--summary', required=True)
    return p, sub


def main(argv=None):
    p, sub = parser()
    extend_parser(sub)
    try:
        a = p.parse_args(argv)
    except SystemExit as e:
        return 0 if e.code == 0 else 64
    try:
        out = COMMANDS[a.cmd](Lane(a.lane), a)
        if out is not None:
            print(out)
        return 0
    except Unreachable as e:
        print(f'orch: platform unreachable: {e}', file=sys.stderr)
        return 2
    except Rejected as e:
        print(f'orch: rejected: {e}', file=sys.stderr)
        return 3
    except Usage as e:
        print(f'orch: {e}', file=sys.stderr)
        return 64


def extend_parser(sub):
    """Hook for the document/memory commands (Task 3)."""


if __name__ == '__main__':
    sys.exit(main())
