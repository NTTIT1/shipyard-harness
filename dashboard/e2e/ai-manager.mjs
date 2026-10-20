// Live flow: wizard → project with an AI team → the AI Manager (real Claude) drafts the rules →
// approve in the dashboard → rules committed on development → feature runs allowed. Cleans up.
// Needs: platform + dashboard running (DASH, default :8090), Chrome, a logged-in `claude` CLI.
import { chromium } from 'playwright-core';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DASH = process.env.DASH || 'http://127.0.0.1:8090';
const GW = process.env.GW || 'http://127.0.0.1:9080';
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
const shot = async (p, n) => { if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${n}.png` }); };

const name = `AI Manager thử ${Date.now() % 100000}`;
const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.goto(DASH);
await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
await p.waitForSelector('.sb-user');
await p.getByRole('button', { name: 'Dự án' }).click();
await p.getByRole('button', { name: 'Tạo', exact: true }).click();
await p.getByRole('button', { name: /Tạo từ khung/ }).click();
const m = p.locator('.modal-panel'); const next = m.getByRole('button', { name: 'Tiếp' });
await p.fill('#wz-name', name);
const slug = await p.inputValue('#wz-slug');
await next.click();
await m.getByText('TypeScript', { exact: true }).click(); await next.click();
await m.getByText('React + Vite', { exact: true }).click(); await next.click();
await next.click(); // options
await next.click(); // git: local
await p.fill('#wz-brief', 'Ứng dụng quản lý kho nội bộ. Quy định công ty: mọi chuỗi hiển thị cho người dùng phải bằng tiếng Việt; tên component bắt đầu bằng tiền tố "Kho" (ví dụ KhoTable); không dùng thư viện UI bên ngoài.');
await shot(p, 'am1-team');
await next.click();
await m.getByRole('button', { name: 'Tạo dự án' }).click();
await m.getByRole('button', { name: 'Mở dự án' }).waitFor({ timeout: 8 * 60_000 });
ok(true, 'project generated, verified and registered');

// AI Manager drafts with real Claude (minutes).
await m.locator('.wz-setup.awaiting-review, .wz-setup.error').waitFor({ timeout: 25 * 60_000 });
await shot(p, 'am2-drafted');
ok(await m.locator('.wz-setup.awaiting-review').count() === 1, `AI Manager submitted the rules (${await m.locator('.wz-setup').innerText()})`);
await m.getByRole('button', { name: 'Mở dự án' }).click();

const call = (method, url, body) => p.evaluate(async ([method, url, body]) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}, [method, url, body]);
const proj = (await call('GET', '/api/platform/projects')).json.data.find(x => x.slug === slug);
const inbox = (await call('GET', '/api/platform/approvals/inbox')).json.data.filter(i => i.projectId === proj.id);
ok(inbox.length === 1 && inbox[0].step === 'MANAGER', 'the rules wait in "Chờ duyệt" as the MANAGER step');
const view = (await call('GET', `/api/platform/runs/${inbox[0].runId}`)).json.data;
const rev = (await call('GET', `/api/platform/runs/${inbox[0].runId}/revisions/${view.revisions.at(-1).id}`)).json.data;
const docs = rev.documents;
console.log('   documents:', Object.keys(docs).join(', '));
ok(docs['project.md'] && docs['team.json'], 'project.md + team.json submitted');
ok(/Kho/.test(Object.values(docs).join('\n')), 'the rules use the human brief (component prefix "Kho")');

const d = await call('POST', `/api/platform/approvals/${inbox[0].approvalId}/decision`, { action: 'APPROVE' });
ok(d.status === 200 && d.json.resumed === true, 'approval hands the run back to the AI Manager runner');
const dir = path.join(os.homedir(), 'shipyard-workspaces', slug);
const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' }).stdout.trim();
for (let i = 0; i < 60 && git('log', '-1', '--format=%s', 'development') !== 'docs(rules): project AI-team rules approved in Shipyard'; i++) await p.waitForTimeout(500);
ok(git('log', '-1', '--format=%s', 'development') === 'docs(rules): project AI-team rules approved in Shipyard', 'approved rules committed on development');
ok(git('show', 'development:.shipyard/rules/project.md') === docs['project.md'], 'committed rules == approved rules');
const team = spawnSync('python3', [path.resolve('../bin/team_rules.py'), dir, 'main'], { encoding: 'utf8' }).stdout;
ok(team.includes('vai trò DEV'), 'AI Dev now receives the approved rules');
await p.waitForTimeout(1500);
const runAfter = (await call('GET', `/api/platform/runs/${inbox[0].runId}`)).json.data;
ok(runAfter.run.status === 'DONE', 'setup run DONE');

if (!process.env.KEEP) {
  const del = await call('DELETE', `/api/platform/projects/${proj.id}?confirm=${slug}`);
  ok(del.status === 200, 'test project deleted');
  fs.rmSync(dir, { recursive: true, force: true });
}
await b.close();
