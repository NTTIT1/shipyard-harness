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



class DocumentsTest(OrchTestCase):
    def setUp(self):
        super().setUp()
        self.st('set', 'run_id=run_1', 'run_project_id=proj_t')

    def spec_dir(self):
        rel = self.st('get', 'spec_dir')
        return self.lane / rel

    def test_sync_creates_spec_dir_and_writes_approved_and_edited_docs(self):
        self.platform.routes[('GET', '/internal/v1/runs/run_1/next')] = (200, self.next_data(
            mode='REVISE', step='BA', revision=2, feedback='thêm luồng lỗi',
            editedDocuments={'ba.md': '# BA người sửa'},
            priorApproved={'PM': {'spec.md': '# Spec đã duyệt'}}))
        r = self.orch('sync')
        self.assertEqual(r.returncode, 0, r.stderr)
        sd = self.spec_dir()
        self.assertTrue(str(sd.relative_to(self.lane)).startswith('specs/2026-10-15-'))
        self.assertEqual((sd / 'spec.md').read_text(), '# Spec đã duyệt')
        self.assertEqual((sd / 'ba.md').read_text(), '# BA người sửa')

    def test_sync_refuses_paths_outside_spec_dir(self):
        self.platform.routes[('GET', '/internal/v1/runs/run_1/next')] = (200, self.next_data(
            mode='REVISE', step='PM', revision=2, editedDocuments={'../../evil.md': 'x'}))
        r = self.orch('sync')
        self.assertEqual(r.returncode, 3)
        self.assertFalse((self.lane / 'evil.md').exists())
        self.assertFalse((self.h / 'lanes' / 'evil.md').exists())

    def test_pack_writes_markdown_and_items(self):
        self.platform.routes[('GET', '/internal/v1/runs/run_1/next')] = (200, self.next_data(
            step='BA', priorApproved={'PM': {'spec.md': '# Spec'}}))
        self.ctx.routes[('POST', '/internal/v1/context-pack')] = (200, {
            'markdown': '# Context pack — BA\nbài học', 'items': [{'itemId': 'mem_1', 'kind': 'FEEDBACK', 'title': 't',
                                                                   'score': 0.5, 'via': 'hybrid'}], 'degraded': False})
        r = self.orch('pack')
        self.assertEqual(r.returncode, 0, r.stderr)
        md = pathlib.Path(r.stdout.strip())
        self.assertEqual(md.name, 'BA-r1.md')
        self.assertIn('bài học', md.read_text())
        self.assertEqual(json.loads(md.with_suffix('.json').read_text())[0]['itemId'], 'mem_1')
        body = self.ctx.requests[-1]['body']
        self.assertEqual((body['projectId'], body['runId'], body['step'], body['runTitle']), ('proj_t', 'run_1', 'BA', 'Đăng xuất'))
        self.assertEqual(body['priorApproved'], {'PM': {'spec.md': '# Spec'}})

    def test_pack_falls_back_when_context_service_is_down(self):
        self.platform.routes[('GET', '/internal/v1/runs/run_1/next')] = (200, self.next_data(
            step='ARCH', priorApproved={'PM': {'spec.md': '# Spec PM'}, 'BA': {'ba.md': '# BA'}}))
        self.env['CONTEXT_URL'] = 'http://127.0.0.1:9'
        r = self.orch('pack')
        self.assertEqual(r.returncode, 0, r.stderr)
        text = pathlib.Path(r.stdout.strip()).read_text()
        self.assertIn('# Spec PM', text)
        self.assertIn('degraded', text)

    def test_pack_refuses_when_nothing_to_work_on(self):
        self.platform.routes[('GET', '/internal/v1/runs/run_1/next')] = (200, self.next_data(mode='WAIT'))
        self.assertEqual(self.orch('pack').returncode, 3)

    def prepare_submit(self, step, docs, revision=1):
        self.platform.routes[('GET', '/internal/v1/runs/run_1/next')] = (200, self.next_data(step=step, revision=revision))
        self.orch('sync')
        sd = self.spec_dir()
        for name, text in docs.items():
            (sd / name).parent.mkdir(parents=True, exist_ok=True)
            (sd / name).write_text(text)
        (sd / '.context').mkdir(exist_ok=True)
        (sd / '.context' / f'{step}-r{revision}.json').write_text(json.dumps([{'itemId': 'mem_1', 'kind': 'FEEDBACK',
                                                                              'title': 't', 'score': 0.4, 'via': 'vector'}]))
        (self.h / 'summary.txt').write_text('Đã viết thiết kế')
        self.platform.routes[('POST', f'/internal/v1/runs/run_1/steps/{step}/submit')] = (200, {
            'revisionId': 'rev_1', 'revisionNo': revision, 'approvalId': 'apr_1', 'autoApproved': False})
        return sd

    def test_submit_collects_docs_images_context_and_parks_the_lane(self):
        sd = self.prepare_submit('DESIGN', {'design.md': '# Design', 'design/01-list-desktop.png': 'png'})
        proof = self.lane / '.playwright-mcp' / 'proof' / 'logout' / 'qc-local'
        proof.mkdir(parents=True)
        (proof / '01.png').write_text('png')
        rel_png = str((sd / 'design' / '01-list-desktop.png').relative_to(self.lane))
        r = self.orch('submit', 'DESIGN', '--summary-file', str(self.h / 'summary.txt'),
                      '--image', f'{rel_png}::Danh sách', '--image', '.playwright-mcp/proof/logout/qc-local/01.png',
                      '--meta', 'screens=2', '--meta', 'tool=html')
        self.assertEqual(r.returncode, 0, r.stderr)
        body = self.platform.requests[-1]['body']
        self.assertEqual(body['summary'], 'Đã viết thiết kế')
        self.assertEqual(body['documents'], {'design.md': '# Design'})
        self.assertEqual(body['images'][0], {'path': f'/spec/1/{rel_png}', 'caption': 'Danh sách'})
        self.assertEqual(body['images'][1], {'path': '/proof/1/logout/qc-local/01.png', 'caption': ''})
        self.assertEqual(body['meta'], {'screens': 2, 'tool': 'html'})
        self.assertEqual(body['contextUsed'][0]['itemId'], 'mem_1')
        self.assertEqual(self.st('get', 'status'), 'waiting')
        self.assertIn('DESIGN', self.st('get', 'needs_action'))

    def test_submit_arch_sends_has_ui_and_entities(self):
        self.prepare_submit('ARCH', {'plan.md': 'p', 'tasks.md': 't', 'entities.json': '{"entities":[]}'})
        r = self.orch('submit', 'ARCH', '--summary-file', str(self.h / 'summary.txt'), '--has-ui', 'false')
        self.assertEqual(r.returncode, 0, r.stderr)
        body = self.platform.requests[-1]['body']
        self.assertIs(body['hasUi'], False)
        self.assertEqual(set(body['documents']), {'plan.md', 'tasks.md', 'entities.json'})

    def test_submit_rejects_images_outside_servable_dirs(self):
        self.prepare_submit('DESIGN', {'design.md': '# D'})
        for bad in ['/etc/passwd', '../x.png', 'src/app.png']:
            r = self.orch('submit', 'DESIGN', '--summary-file', str(self.h / 'summary.txt'), '--image', bad)
            self.assertEqual(r.returncode, 3, bad)
        self.assertFalse(any(q['path'].endswith('/submit') for q in self.platform.requests))

    def test_auto_approved_submit_keeps_running(self):
        self.prepare_submit('PM', {'spec.md': '# S'})
        self.platform.routes[('POST', '/internal/v1/runs/run_1/steps/PM/submit')] = (200, {
            'revisionId': 'rev_1', 'revisionNo': 1, 'approvalId': 'apr_1', 'autoApproved': True})
        self.orch('submit', 'PM', '--summary-file', str(self.h / 'summary.txt'))
        self.assertEqual(self.st('get', 'status'), 'running')

    def test_search_get_related(self):
        self.ctx.routes[('POST', '/internal/v1/memory/search')] = (200, {'degraded': False, 'hits': [
            {'itemId': 'mem_1', 'kind': 'FEEDBACK', 'title': 'Góp ý', 'text': 'luôn phân trang', 'score': 0.03,
             'via': 'hybrid', 'runId': 'r', 'step': 'BA', 'chunkId': 1}]})
        self.ctx.routes[('GET', '/internal/v1/memory/items/mem_1')] = (200, {'id': 'mem_1', 'title': 'Góp ý', 'content': 'nội dung đầy đủ'})
        self.ctx.routes[('GET', '/internal/v1/memory/related')] = (200, [
            {'edgeType': 'TOUCHES', 'direction': 'in', 'entityType': 'FEATURE', 'entityKey': 'run_a',
             'entityName': 'Thanh toán', 'sourceItemId': 'mem_2', 'sourceTitle': 'plan'}])
        out = self.orch('search', 'phân trang', '--kinds', 'FEEDBACK,HUMAN_EDIT', '--k', '3').stdout
        self.assertIn('[FEEDBACK] Góp ý', out)
        self.assertIn('mem_1', out)
        self.assertEqual(self.ctx.requests[-1]['body']['kinds'], ['FEEDBACK', 'HUMAN_EDIT'])
        self.assertIn('nội dung đầy đủ', self.orch('get', 'mem_1').stdout)
        self.assertIn('projectId=proj_t', self.ctx.requests[-1]['path'])
        self.assertIn('TOUCHES', self.orch('related', 'TABLE:orders').stdout)

if __name__ == '__main__':
    unittest.main()
