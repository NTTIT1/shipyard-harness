"""bin/orch.py against a fake platform (stdlib http.server) and a throwaway harness root."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPO = pathlib.Path(__file__).resolve().parent.parent
ORCH = REPO / 'bin' / 'orch.py'


class FakePlatform:
    """Records requests; answers from `routes[(METHOD, path-prefix)] = (status, data|callable)`."""

    def __init__(self):
        self.requests = []
        self.routes = {}
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _serve(self):
                n = int(self.headers.get('Content-Length') or 0)
                body = json.loads(self.rfile.read(n) or b'null') if n else None
                fake.requests.append({'method': self.command, 'path': self.path, 'body': body,
                                      'token': self.headers.get('X-Service-Token')})
                for (m, prefix), (status, data) in sorted(fake.routes.items(), key=lambda kv: -len(kv[0][1])):
                    if m == self.command and self.path.startswith(prefix):
                        payload = data(body) if callable(data) else data
                        out = json.dumps({'success': status < 400, 'message': payload if status >= 400 else 'ok',
                                          'data': None if status >= 400 else payload}).encode()
                        self.send_response(status)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Content-Length', str(len(out)))
                        self.end_headers()
                        self.wfile.write(out)
                        return
                self.send_response(404)
                self.end_headers()

            do_GET = do_POST = _serve

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), H)
        self.url = f'http://127.0.0.1:{self.server.server_address[1]}'
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def stop(self):
        self.server.shutdown()


class OrchTestCase(unittest.TestCase):
    PROJECT = 'proj_t'

    def setUp(self):
        self.h = pathlib.Path(tempfile.mkdtemp())
        (self.h / 'config').mkdir()
        (self.h / 'state').mkdir()
        (self.h / 'lanes' / 'lane1').mkdir(parents=True)
        (self.h / 'profiles' / 'testprof').mkdir(parents=True)
        (self.h / 'config' / 'lanes.env').write_text(
            f'HARNESS_ROOT="${{HARNESS_ROOT:-{self.h}}}"\nLANES_ROOT="${{LANES_ROOT:-{self.h}/lanes}}"\n'
            'PG_HOST=127.0.0.1\nPG_PORT=5433\nPG_USER=postgres\nPG_PASS=postgres\nREDIS_HOST=127.0.0.1\n'
            'REDIS_PORT=6379\nDB_PREFIX=harness_test_l\nAPI_BASE_PORT=8000\nFE_BASE_PORT=3000\nPROFILE=testprof\n')
        self.set_project(self.PROJECT)
        subprocess.run(['git', 'init', '-q', str(self.lane)], check=True)
        self.platform = FakePlatform()
        self.ctx = FakePlatform()
        self.env = dict(os.environ, HARNESS_ROOT=str(self.h), LANES_ROOT=str(self.h / 'lanes'),
                        ORCHESTRATOR_URL=self.platform.url, CONTEXT_URL=self.ctx.url,
                        SHIPYARD_SERVICE_TOKEN='tok', SPEC_DATE='2026-10-15')
        self.st('init')
        self.st('set', 'feature_title=Đăng xuất')

    def tearDown(self):
        self.platform.stop()
        self.ctx.stop()
        shutil.rmtree(self.h, ignore_errors=True)

    @property
    def lane(self):
        return self.h / 'lanes' / 'lane1'

    def set_project(self, pid):
        (self.h / 'profiles' / 'testprof' / 'integrations.env').write_text(f'PLATFORM_PROJECT_ID="{pid}"\n')

    def st(self, *args):
        return subprocess.run(['bash', str(REPO / 'bin' / 'state.sh'), '1', *args], env=getattr(self, 'env', None) or
                              dict(os.environ, HARNESS_ROOT=str(self.h), LANES_ROOT=str(self.h / 'lanes')),
                              capture_output=True, text=True, check=True).stdout.strip()

    def orch(self, *args):
        return subprocess.run(['python3', str(ORCH), '1', *args], env=self.env, capture_output=True, text=True)

    def next_data(self, **over):
        d = {'mode': 'WORK', 'step': 'PM', 'revision': 1, 'feedback': None, 'editedDocuments': None, 'priorApproved': {}}
        d.update(over)
        return d


class CoreTest(OrchTestCase):
    def test_create_posts_project_and_lane_and_records_run(self):
        self.platform.routes[('POST', '/internal/v1/runs')] = (200, {'id': 'run_1', 'status': 'RUNNING'})
        r = self.orch('create', '--title', 'Đăng xuất', '--description', 'nút đăng xuất', '--created-by', 'usr_9')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), 'run_1')
        req = self.platform.requests[-1]
        self.assertEqual(req['token'], 'tok')
        self.assertEqual(req['body']['projectId'], 'proj_t')
        self.assertTrue(req['body']['laneRef'].endswith(':lane1'))
        self.assertEqual(req['body']['createdBy'], 'usr_9')
        self.assertEqual(self.st('get', 'run_id'), 'run_1')
        self.assertEqual(self.st('get', 'run_project_id'), 'proj_t')

    def test_create_reuses_an_open_run(self):
        self.st('set', 'run_id=run_old', 'run_project_id=proj_t')
        self.platform.routes[('GET', '/internal/v1/runs/run_old/next')] = (200, self.next_data(mode='WAIT'))
        r = self.orch('create', '--title', 'x')
        self.assertEqual(r.stdout.strip(), 'run_old')
        self.assertFalse(any(q['method'] == 'POST' for q in self.platform.requests))

    def test_create_without_project_is_rejected_with_guidance(self):
        self.set_project('')
        r = self.orch('create', '--title', 'x')
        self.assertEqual(r.returncode, 3)
        self.assertIn('PLATFORM_PROJECT_ID', r.stderr)

    def test_next_prints_the_orchestrator_answer(self):
        self.st('set', 'run_id=run_1')
        self.platform.routes[('GET', '/internal/v1/runs/run_1/next')] = (200, self.next_data(step='BA'))
        r = self.orch('next')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(r.stdout)['step'], 'BA')

    def test_unreachable_platform_exits_2(self):
        self.st('set', 'run_id=run_1')
        self.env['ORCHESTRATOR_URL'] = 'http://127.0.0.1:9'
        r = self.orch('next')
        self.assertEqual(r.returncode, 2)
        self.assertIn('unreachable', r.stderr)
        self.assertNotIn('Traceback', r.stderr)

    def test_rejection_exits_3_with_the_platform_message(self):
        self.st('set', 'run_id=run_1')
        self.platform.routes[('POST', '/internal/v1/runs/run_1/release')] = (409, 'Run is RUNNING, not RELEASING')
        r = self.orch('release', '--summary', 's')
        self.assertEqual(r.returncode, 3)
        self.assertIn('not RELEASING', r.stderr)

    def test_reopen_and_release(self):
        self.st('set', 'run_id=run_1')
        self.platform.routes[('POST', '/internal/v1/runs/run_1/reopen')] = (200, self.next_data(mode='REVISE', step='DEV', revision=2))
        self.platform.routes[('POST', '/internal/v1/runs/run_1/release')] = (200, {'id': 'run_1', 'status': 'DONE'})
        self.assertEqual(json.loads(self.orch('reopen', '--reason', 'dev-QC lỗi').stdout)['step'], 'DEV')
        self.assertEqual(self.platform.requests[-1]['body'], {'reason': 'dev-QC lỗi'})
        self.assertEqual(self.orch('release', '--summary', 'PR #3').returncode, 0)
        self.assertEqual(self.platform.requests[-1]['body'], {'summary': 'PR #3'})

    def test_usage_error_exits_64(self):
        self.assertEqual(self.orch('frobnicate').returncode, 64)


if __name__ == '__main__':
    unittest.main()
