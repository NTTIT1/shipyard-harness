// Live, through the browser: "Duyệt kiến trúc trước" in the new-project wizard. The project is
// registered, the job pauses, the architect's architecture.md waits in review, a human approves it
// on the project page, and only then is the skeleton (React + Vite) generated with docs/architecture.md.
// Run against a dashboard started with CLAUDE_BIN pointing at a fake `claude` (no model cost), e.g.
//   CLAUDE_BIN=/path/fake-claude.sh node server/index.js 8091   then   DASH=http://127.0.0.1:8091 node e2e/new-project-arch-first.mjs
// Needs: platform, Chrome, Node on the host. Cleans up.
import { chromium } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const DASH = process.env.DASH || 'http://127.0.0.1:8091';
const ORCH = process.env.ORCH || 'http://127.0.0.1:9084';
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const SHOTS = process.env.SHOTS;
const HARNESS = process.env.HARNESS_ROOT || path.resolve(import.meta.dirname, '../..');
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); console.log('ok -', m); };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
const until = async (fn, ms, what) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timeout: ${what}`); await new Promise(r => setTimeout(r, 1500)); } };

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage();
const name = `Kho kiến trúc ${Date.now() % 100000}`;
let slug = '', projectId = null, runId = null;
const api = (method, url, body) => p.evaluate(async ([m, u, bd]) => {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: bd ? JSON.stringify(bd) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, url, body]);

try {
  await p.goto(DASH);
  await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
  await p.waitForSelector('.sb-user');
  await p.getByRole('button', { name: /Khởi tạo dự án từ khung|Tạo dự án mới/ }).first().click();
  const m = p.locator('.modal-panel');
  const next = m.getByRole('button', { name: 'Tiếp' });
  await p.fill('#wz-name', name);
  slug = await p.inputValue('#wz-slug');
  await next.click();
  await m.getByText('Một ứng dụng', { exact: true }).click(); await next.click();
  await m.getByText('TypeScript', { exact: true }).click(); await next.click();
  await m.getByText('React + Vite', { exact: true }).click(); await next.click();
  await next.click();                                                              // options
  await next.click();                                                              // git (local)
  ok(await m.getByText('Khi nào tạo khung dự án?').count() === 1, 'architecture step');
  await m.getByText('Duyệt kiến trúc trước', { exact: true }).click();
  ok(await next.isDisabled(), 'requirements are needed before continuing');
  await p.fill('#wz-req', 'Ứng dụng web quản lý kho nhỏ: danh mục hàng, nhập kho, xuất kho, báo cáo tồn theo tháng.');
  await shot(p, 'af1-arch-step');
  await next.click();
  const aiTeam = m.getByRole('checkbox', { name: /AI Manager/ });
  if (await aiTeam.isChecked()) await aiTeam.uncheck();
  await next.click();                                                              // review
  ok(await m.getByText('AI soạn kiến trúc → bạn duyệt → rồi mới tạo khung dự án').count() === 1, 'review shows architecture first');
  await m.getByRole('button', { name: 'Tạo dự án' }).click();

  await m.getByText('Đang chờ duyệt kiến trúc.').waitFor({ timeout: 60_000 });
  const dir = path.join(os.homedir(), 'shipyard-workspaces', slug);
  ok(!fs.existsSync(dir), 'nothing generated before the architecture is approved');
  const pj = await p.evaluate(async s => (await (await fetch('/api/platform/projects')).json()).data.find(x => x.slug === s), slug);
  projectId = pj?.id;
  ok(!!projectId, 'project registered first (so the architecture can be reviewed in it)');
  await m.getByText(/Kiến trúc:.*Chờ duyệt|Kiến trúc:.*Đã nộp bản kiến trúc/).waitFor({ timeout: 120_000 });
  await shot(p, 'af2-waiting');

  const bps = await until(async () => {
    const r = await api('GET', `/api/scaffold/blueprints?projectId=${projectId}`);
    return r.body?.find(x => x.status === 'awaiting-review') || null;
  }, 120_000, 'architecture submitted');
  runId = bps.runId;
  const token = fs.readFileSync(path.join(HARNESS, 'run/platform/service-token'), 'utf8').trim();
  const feat = await fetch(`${ORCH}/internal/v1/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: JSON.stringify({ projectId, laneRef: 'e2e:lane9', title: 'x', description: '', createdBy: 'e2e' }) });
  ok(feat.status === 409, 'no feature can start before the architecture is approved');

  // Approve from the project page: banner → review → Duyệt.
  await m.getByRole('button', { name: 'Mở dự án' }).click();
  await p.getByRole('button', { name: 'Mở bản kiến trúc' }).click();
  await p.getByText('Dự án chưa có code.', { exact: false }).waitFor();
  await shot(p, 'af3-review');
  await p.getByRole('button', { name: 'Duyệt', exact: true }).click();

  const job = await until(async () => {
    const r = await api('GET', `/api/scaffold/blueprint/${runId}`);
    if (r.body?.status === 'error') throw new Error(`blueprint error: ${r.body.error}`);
    return r.body?.status === 'done' ? r.body : null;
  }, 10 * 60_000, 'project scaffolded after approval');
  ok(!!job, 'approval scaffolded the project and released the run');
  const git = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).stdout.trim();
  ok(git('show', 'HEAD:docs/architecture.md').includes('# Kiến trúc — e2e'), 'docs/architecture.md committed with the approved text');
  ok(fs.existsSync(path.join(dir, 'package.json')), 'React + Vite skeleton generated');
  const feat2 = await fetch(`${ORCH}/internal/v1/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: JSON.stringify({ projectId, laneRef: 'e2e:lane9', title: 'x', description: '', createdBy: 'e2e' }) });
  ok(feat2.status === 200, 'features can start once the architecture is approved and the project exists');
  await p.reload(); await p.waitForSelector('.sb-user');
  await shot(p, 'af4-done');
} finally {
  if (!process.env.KEEP && slug) {
    if (projectId) await api('DELETE', `/api/platform/projects/${projectId}?confirm=${slug}`);
    fs.rmSync(path.join(os.homedir(), 'shipyard-workspaces', slug), { recursive: true, force: true });
    fs.rmSync(path.join(HARNESS, 'run/scaffold/blueprints', slug), { recursive: true, force: true });
    const f = path.join(HARNESS, 'run/scaffold/blueprints.json');
    try { const s = JSON.parse(fs.readFileSync(f, 'utf8')); for (const [k, v] of Object.entries(s)) if (v.slug === slug) delete s[k]; fs.writeFileSync(f, JSON.stringify(s, null, 2)); } catch { /* none */ }
    console.log('cleaned up', slug);
  }
  await b.close();
}
