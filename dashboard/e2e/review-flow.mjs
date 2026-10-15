// Live UI flow: seed a run through the orchestrator's harness API, then as admin:
// inbox → review PM (edit + request changes) → harness resubmits → approve → projects/members/gates/memory.
// Needs: bin/platform.sh start; node server/index.js 8099; Chrome at CHROME_BIN or /usr/bin/google-chrome.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const DASH = process.env.DASH || 'http://127.0.0.1:8099';
const GW = process.env.GW || 'http://127.0.0.1:9080';
const ORCH = process.env.ORCH || 'http://127.0.0.1:9084';
const TOKEN = process.env.SHIPYARD_SERVICE_TOKEN || fs.readFileSync(path.resolve('../run/platform/service-token'), 'utf8').trim();
const OUT = process.env.SHOTS || path.resolve('e2e/shots');
fs.mkdirSync(OUT, { recursive: true });
const J = { 'Content-Type': 'application/json' };
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };

const login = await (await fetch(`${GW}/api/v1/auth/login`, { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@shipyard.local', password: process.env.ADMIN_PASSWORD || 'admin123' }) })).json();
const AT = login.data.accessToken;
const A = { ...J, Authorization: `Bearer ${AT}` };
const me = (await (await fetch(`${GW}/api/v1/auth/me`, { headers: A })).json()).data;
const proj = (await (await fetch(`${GW}/api/v1/projects`, { method: 'POST', headers: A, body: JSON.stringify({ name: 'UI E2E', slug: `ui${Date.now()}`, repoUrl: 'https://example.com/r.git' }) })).json()).data;
const S = { ...J, 'X-Service-Token': TOKEN };
const run = (await (await fetch(`${ORCH}/internal/v1/runs`, { method: 'POST', headers: S, body: JSON.stringify({ projectId: proj.id, laneRef: 'e2e-host:lane9', title: 'Đăng xuất (UI e2e)', description: '', createdBy: me.id }) })).json()).data;
const submitPm = text => fetch(`${ORCH}/internal/v1/runs/${run.id}/steps/PM/submit`, { method: 'POST', headers: S,
  body: JSON.stringify({ summary: 'Viết spec đăng xuất', documents: { 'spec.md': text }, images: [], meta: {}, contextUsed: [] }) });
await submitPm('# Đăng xuất\n\n- AC-1 bấm nút thì về trang đăng nhập\n<img src=x onerror="window.__xss=1">');

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(DASH);
await page.fill('input[type=email]', 'admin@shipyard.local');
await page.fill('input[type=password]', process.env.ADMIN_PASSWORD || 'admin123');
await page.click('button[type=submit]');
await page.waitForSelector('.sb-user');

await page.getByRole('button', { name: /Chờ tôi duyệt/ }).click();
await page.getByText('Đăng xuất (UI e2e)').waitFor();
await page.screenshot({ path: `${OUT}/01-inbox.png` });
await page.getByText('Đăng xuất (UI e2e)').click();
await page.getByRole('heading', { name: 'Đăng xuất (UI e2e)' }).waitFor();
ok(await page.evaluate(() => !window.__xss), 'markdown with an onerror payload stays inert');
await page.screenshot({ path: `${OUT}/02-review.png`, fullPage: true });

await page.getByRole('button', { name: 'Yêu cầu sửa' }).click();
ok(await page.getByText('Cần nhập góp ý cho AI.').isVisible(), 'request changes without feedback is blocked in the UI');
await page.getByRole('button', { name: 'Sửa', exact: true }).click();
await page.getByLabel('Sửa spec.md').fill('# Đăng xuất\n\n- AC-1 bấm nút thì về trang đăng nhập\n- AC-2 phiên hết hạn tự đăng xuất\n');
await page.getByLabel('Góp ý cho AI').fill('Thêm AC cho phiên hết hạn');
await page.getByRole('button', { name: 'Yêu cầu sửa' }).click();
await page.getByRole('status').waitFor();
ok((await page.getByRole('status').textContent()).includes('Không đánh thức được lane'), 'decision saved; lane on another host is reported as not woken');
await page.screenshot({ path: `${OUT}/03-requested.png`, fullPage: true });

const next = (await (await fetch(`${ORCH}/internal/v1/runs/${run.id}/next`, { headers: S })).json()).data;
ok(next.mode === 'REVISE' && next.editedDocuments['spec.md'].includes('AC-2'), 'harness sees REVISE with the human edit');
await submitPm(next.editedDocuments['spec.md'] + '- AC-3 nút có trên mọi trang\n');

await page.getByRole('button', { name: /Chờ tôi duyệt/ }).click();
await page.getByText('Đăng xuất (UI e2e)').click();
await page.getByRole('button', { name: 'So với bản trước' }).click();
ok(await page.locator('.diff .add', { hasText: 'AC-3' }).count() === 1, 'diff against the previous revision shows the new line');
await page.screenshot({ path: `${OUT}/04-diff.png`, fullPage: true });
await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
await page.getByRole('status').waitFor();
const after = (await (await fetch(`${ORCH}/internal/v1/runs/${run.id}/next`, { headers: S })).json()).data;
ok(after.step === 'BA' && after.mode === 'WORK', 'approve moves the run to BA');

// Second decision on the same (now closed) approval → 409 handled.
const apr = (await (await fetch(`${GW}/api/v1/runs/${run.id}`, { headers: A })).json()).data.revisions.at(-1).approvalId;
const dup = await page.evaluate(async id => (await fetch(`/api/platform/approvals/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"APPROVE"}' })).status, apr);
ok(dup === 409, 'a second decision on a closed gate is a 409');

await page.getByRole('button', { name: 'Dự án' }).click();
await page.getByRole('button', { name: 'UI E2E' }).click();
await page.getByRole('tab', { name: 'Thành viên' }).waitFor();
await page.getByLabel('Email thành viên mới').fill('khong-ton-tai@x.io');
await page.getByRole('button', { name: 'Thêm thành viên' }).click();
ok(await page.getByRole('alert').textContent().then(t => t.includes('Không tìm thấy')), 'unknown member email shows a clear message');
await page.getByRole('tab', { name: 'Cổng duyệt' }).click();
await page.getByText('Tự động duyệt').first().waitFor();
await page.screenshot({ path: `${OUT}/05-gates.png`, fullPage: true });
await page.getByRole('tab', { name: 'Bộ nhớ' }).click();
await page.waitForTimeout(6000); // outbox → context-service
await page.getByRole('button', { name: 'Tìm' }).click();
await page.getByText('Thêm AC cho phiên hết hạn', { exact: false }).first().waitFor({ timeout: 20000 });
await page.screenshot({ path: `${OUT}/06-memory.png`, fullPage: true });
ok(true, 'reviewer feedback is visible in project memory');

await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: `${OUT}/07-mobile.png`, fullPage: true });
await browser.close();
console.log('REVIEW-UI E2E: PASS');
