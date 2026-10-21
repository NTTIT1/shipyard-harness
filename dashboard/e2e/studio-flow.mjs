// Live, through the browser: the product studio chat — idea → AI PM asks → brief approved → AI
// architect (stack + architecture) approved → AI designer (mockup) approved → project created with
// every approved document in docs/ and its roadmap listed. Run against a dashboard started with
// CLAUDE_BIN pointing at a fake `claude` (no model cost). Needs platform, Chrome, Node. Cleans up.
import { chromium } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const DASH = process.env.DASH || 'http://127.0.0.1:8091';
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const SHOTS = process.env.SHOTS;
const HARNESS = process.env.HARNESS_ROOT || path.resolve(import.meta.dirname, '../..');
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); console.log('ok -', m); };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
let sessionId = null, projectId = null;
const slug = `ban-hang-chat-${Date.now() % 100000}`;
const api = (method, url, body) => p.evaluate(async ([m, u, bd]) => {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: bd ? JSON.stringify(bd) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, url, body]);

try {
  await p.goto(DASH);
  await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
  await p.waitForSelector('.sb-user');
  await p.locator('.sb-nav-item', { hasText: 'Ý tưởng sản phẩm' }).click();
  await p.getByText('Bạn muốn làm sản phẩm gì?').waitFor();
  await shot(p, 'st1-new');
  await p.getByLabel('Ý tưởng sản phẩm').fill('Tôi cần hệ thống bán hàng khoảng 1000 user');
  await p.getByRole('button', { name: 'Gửi cho AI PM' }).click();
  await p.getByText('Bạn có bao nhiêu cửa hàng?').waitFor({ timeout: 60_000 });
  ok(true, 'AI PM answers the idea with a question');
  sessionId = (await api('GET', '/api/studio')).body[0].id;

  await p.getByLabel('Nhắn cho AI').fill('5 cửa hàng thời trang, bán tại quầy và online');
  await p.getByRole('button', { name: 'Gửi', exact: true }).click();
  await p.getByText('Mình đã viết bản yêu cầu', { exact: false }).waitFor({ timeout: 60_000 });
  await p.locator('.st-doc-body').getByText('Bán hàng cho 5 cửa hàng.').waitFor();
  ok(true, 'the brief appears next to the chat');
  await shot(p, 'st2-brief');
  await p.getByRole('button', { name: 'Duyệt yêu cầu' }).click();

  await p.getByText('Đề xuất React + Vite.').waitFor({ timeout: 60_000 });
  await p.locator('.st-doc-body').getByText('React + Vite cho bản thử').waitFor();
  ok(await p.locator('.st-doc-body').getByText('1000 user: một instance').count() === 1, 'architect: stack advice with scale notes');
  await shot(p, 'st3-system');
  await p.getByRole('button', { name: 'Duyệt thiết kế hệ thống' }).click();

  await p.getByText('Đã vẽ 1 màn hình.').waitFor({ timeout: 60_000 });
  const frame = p.frameLocator('iframe.st-mock');
  await frame.getByText('Màn hình thử').waitFor();
  ok(true, 'designer: mockup rendered (sandboxed)');
  await shot(p, 'st4-ui');
  await p.getByRole('button', { name: 'Duyệt giao diện' }).click();

  await p.locator('#st-name').waitFor();
  await p.fill('#st-name', 'Bán hàng chat');
  await p.fill('#st-slug', slug);
  ok(await p.locator('.wf-preset.on').textContent() === 'Plan → Code → Test', 'workflow pre-selected from the advice');
  const aiTeam = p.getByRole('checkbox', { name: /AI Manager/ });
  if (await aiTeam.isChecked()) await aiTeam.uncheck();
  await shot(p, 'st5-create');
  await p.getByRole('button', { name: 'Tạo dự án' }).click();

  await p.getByRole('heading', { name: 'Lộ trình tính năng' }).waitFor({ timeout: 30_000 });
  const done = await (async () => {
    for (let i = 0; i < 300; i++) {
      const s = (await api('GET', `/api/studio/${sessionId}`)).body;
      if (s?.job?.status === 'done') return s;
      if (s?.job?.status === 'failed') throw new Error(`job failed: ${s.job.error}`);
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('timeout: project generation');
  })();
  projectId = done.project.projectId || done.job.project?.id;
  ok(!!projectId, 'project created and registered');
  ok(done.roadmap.map(r => r.title).join('|') === 'Đăng nhập|Bán hàng', 'roadmap listed for Plan → Code');
  const dir = path.join(os.homedir(), 'shipyard-workspaces', slug);
  const files = spawnSync('git', ['-C', dir, 'ls-files', 'docs'], { encoding: 'utf8' }).stdout.trim().split('\n');
  ok(['docs/product-brief.md', 'docs/architecture.md', 'docs/design/design.md', 'docs/design/mockups/01-ban-hang.html'].every(f => files.includes(f)),
    'every approved document committed under docs/');
  const wf = (await api('GET', `/api/platform/projects/${projectId}/workflow`)).body.data;
  ok(wf.filter(w => w.mode !== 'SKIP').map(w => w.step).join() === 'ARCH,DEV,TEST', 'project workflow is Plan → Code → Test');
  await p.reload(); await p.waitForSelector('.sb-user');
  await p.locator('.sb-nav-item', { hasText: 'Ý tưởng sản phẩm' }).click();
  await p.locator('.st-item').first().click();
  await p.getByRole('heading', { name: 'Lộ trình tính năng' }).waitFor();
  await shot(p, 'st6-build');
  await p.setViewportSize({ width: 390, height: 844 });
  await shot(p, 'st7-mobile');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll on a phone');
} finally {
  if (!process.env.KEEP) {
    if (projectId) await api('DELETE', `/api/platform/projects/${projectId}?confirm=${slug}`);
    fs.rmSync(path.join(os.homedir(), 'shipyard-workspaces', slug), { recursive: true, force: true });
    if (sessionId) {
      fs.rmSync(path.join(HARNESS, 'run/studio', sessionId), { recursive: true, force: true });
      fs.rmSync(path.join(HARNESS, 'run/studio', `${sessionId}.json`), { force: true });
    }
    console.log('cleaned up', slug, sessionId);
  }
  await b.close();
}
