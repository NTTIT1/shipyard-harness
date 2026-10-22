// Live, through the browser: import an existing repo — the person fills in how it is installed, run and
// tested, Shipyard clones it, writes the lane profile from those commands and registers the project
// with its workflow. Uses a throw-away local repo; AI Manager off (no model cost). Cleans up.
//   DASH=http://127.0.0.1:8090 node e2e/import-repo.mjs
import { chromium } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const DASH = process.env.DASH || 'http://127.0.0.1:8090';
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const SHOTS = process.env.SHOTS;
const HARNESS = process.env.HARNESS_ROOT || path.resolve(import.meta.dirname, '../..');
const WS = process.env.SHIPYARD_WORKSPACES || path.join(os.homedir(), 'shipyard-workspaces');
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); console.log('ok -', m); };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
const slug = `kho-cu-${Date.now() % 100000}`;
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'import-src-'));
const git = (...a) => spawnSync('git', ['-C', src, '-c', 'user.name=t', '-c', 'user.email=t@x', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' });
fs.mkdirSync(path.join(src, 'server'));
fs.writeFileSync(path.join(src, 'server', 'app.py'), 'import http.server, os\nhttp.server.HTTPServer(("", int(os.environ["PORT"])), http.server.SimpleHTTPRequestHandler).serve_forever()\n');
fs.mkdirSync(path.join(src, 'tai-lieu', 'man-hinh'), { recursive: true });
fs.writeFileSync(path.join(src, 'tai-lieu', 'yeu-cau.md'), '# Yêu cầu kho\n');
fs.writeFileSync(path.join(src, 'tai-lieu', 'man-hinh', '01-ton-kho.png'), 'png');
git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'init'); git('branch', 'development');

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage();
let projectId = null;
const api = (method, url, body) => p.evaluate(async ([m, u, bd]) => {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: bd ? JSON.stringify(bd) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, url, body]);

try {
  await p.goto(DASH);
  await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
  await p.waitForSelector('.sb-user');
  await p.locator('.sb-nav-item', { hasText: /Tổng quan & thành viên|Dự án/ }).first().click();
  await p.getByRole('button', { name: /Thêm dự án|Liên kết|Thêm hoặc liên kết/ }).first().click();
  await p.getByRole('button', { name: 'Nhập dự án có sẵn từ Git' }).click();
  const m = p.locator('.modal-panel');
  await m.getByLabel('Tên dự án').fill('Kho cũ thử');
  await m.getByLabel(/Slug/).fill(slug);
  await m.getByLabel('Lấy repo từ').selectOption('local');
  await m.getByLabel('Thư mục repo trên máy').fill(src);
  await m.getByRole('button', { name: 'Đọc nhánh' }).click();
  await m.getByLabel(/Nhánh tích hợp/).waitFor();
  ok(await m.getByLabel(/Nhánh tích hợp/).inputValue() === 'development', 'branches read before cloning; development picked');
  await shot(p, 'imp1-repo');
  await m.getByRole('button', { name: 'Tiếp' }).click();

  ok(await m.getByLabel('Công nghệ').first().inputValue() === '', 'nothing pre-filled: the person describes the repo');
  await m.locator('#imp-backend-dir').fill('server');
  await m.locator('#imp-backend-tech').fill('Python http.server');
  await m.locator('#imp-backend-run').fill('python3 app.py');
  await m.locator('#imp-backend-test').fill('python3 -m py_compile app.py');
  await shot(p, 'imp2-apps');
  await m.getByRole('button', { name: 'Tiếp' }).click();
  // Documents: where THIS repo keeps what lanes must follow.
  await m.locator('#imp-doc-brief').fill('tai-lieu/yeu-cau.md');
  await m.locator('#imp-doc-mockups').fill('tai-lieu/man-hinh');
  await shot(p, 'imp2b-docs');
  await m.getByRole('button', { name: 'Tiếp' }).click();
  await m.getByText('Không dùng').click();
  await m.getByRole('button', { name: 'Tiếp' }).click();
  await m.getByRole('checkbox', { name: /AI Manager/ }).uncheck();
  await m.getByRole('button', { name: 'Tiếp' }).click();
  await m.getByText('Lệnh chạy backend không dùng $PORT').waitFor();
  ok(true, 'review warns that lanes would fight over one port');
  await shot(p, 'imp3-review-warn');
  // Go back and fix it (the stepper's done steps are clickable).
  await m.getByRole('button', { name: /Ứng dụng/ }).click();
  await m.locator('#imp-backend-run').fill('PORT=$PORT python3 app.py');
  for (let i = 0; i < 4; i++) await m.getByRole('button', { name: 'Tiếp' }).click();
  ok(await m.getByText('không dùng $PORT').count() === 0, 'warning gone after the fix');
  await m.getByRole('button', { name: 'Nhập dự án' }).click();
  await m.locator('.wz-done').waitFor({ timeout: 60_000 });
  await shot(p, 'imp4-done');
  const imp = JSON.parse(fs.readFileSync(path.join(HARNESS, 'config', 'imports', `${slug}.json`), 'utf8'));
  ok(imp.backend.run === 'PORT=$PORT python3 app.py', 'the form is kept for the lane profile');
  const boot = fs.readFileSync(path.join(HARNESS, 'profiles', slug, 'hooks', 'boot.sh'), 'utf8');
  const docs = JSON.parse(fs.readFileSync(path.join(HARNESS, 'profiles', slug, 'project-docs.json'), 'utf8'));
  ok(docs.brief === 'tai-lieu/yeu-cau.md' && docs.mockups === 'tai-lieu/man-hinh', 'declared documents saved for the lanes');
  const sec = spawnSync('python3', [path.join(HARNESS, 'bin', 'project_docs.py'), path.join(WS, slug), 'design', path.join(HARNESS, 'profiles', slug)], { encoding: 'utf8' }).stdout;
  ok(sec.includes('tai-lieu/yeu-cau.md') && sec.includes('01-ton-kho.png') && sec.includes('không vẽ lại'), 'a lane design step would be told to follow them');
  ok(boot.includes(`harness_spawn api "$LANE_DIR/server" env PORT="$API_PORT" bash -c 'PORT=$PORT python3 app.py'`), 'boot hook runs the person\'s command on the lane port');
  const list = (await api('GET', '/api/platform/projects')).body;
  projectId = (list.data || list).find(x => x.slug === slug)?.id;
  ok(!!projectId, 'project registered');
  ok(fs.existsSync(path.join(WS, slug, 'server', 'app.py')), 'repo cloned');
  const lanesP = (await api('GET', '/api/lanes/projects')).body;
  ok((lanesP || []).some(x => x.slug === slug && x.imported), 'lanes can now be added for it');
} finally {
  if (!process.env.KEEP) {
    if (projectId) await api('DELETE', `/api/platform/projects/${projectId}?confirm=${slug}`);
    for (const d of [path.join(WS, slug), path.join(HARNESS, 'profiles', slug), src]) fs.rmSync(d, { recursive: true, force: true });
    fs.rmSync(path.join(HARNESS, 'config', 'imports', `${slug}.json`), { force: true });
    console.log('cleaned up', slug);
  }
  await b.close();
}
