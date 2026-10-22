// Live, through the browser: an owner reorders a project's feature workflow and leaves steps out
// ("Kiến trúc → Code → Test"), saves it, and a new feature run then starts at ARCH with PM/BA/DESIGN
// left out. Uses a throwaway platform project and deletes it at the end.
// Needs: platform + dashboard (DASH, default :8090), Chrome.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const DASH = process.env.DASH || 'http://127.0.0.1:8090';
const ORCH = process.env.ORCH || 'http://127.0.0.1:9084';
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const SHOTS = process.env.SHOTS;
const HARNESS = process.env.HARNESS_ROOT || path.resolve(import.meta.dirname, '../..');
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); console.log('ok -', m); };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage();
const slug = `wf-test-${Date.now() % 100000}`;
const NAME = `Quy trình thử ${slug.slice(-5)}`;
let pid = null;
const api = (method, url, body) => p.evaluate(async ([m, u, bd]) => {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: bd ? JSON.stringify(bd) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, url, body]);

try {
  await p.goto(DASH);
  await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
  await p.waitForSelector('.sb-user');
  const created = await api('POST', '/api/platform/projects', { slug, name: NAME, repoUrl: `file:///tmp/${slug}` });
  ok(created.status === 200 || created.status === 201, `throwaway project created (${created.status})`);
  pid = created.body.data.id;

  const wf0 = await api('GET', `/api/platform/projects/${pid}/workflow`);
  ok(wf0.body.data.map(w => w.step).join() === 'PM,BA,ARCH,DESIGN,DEV,TEST', 'a new project runs the full workflow');

  await p.reload(); await p.waitForSelector('.sb-user');
  const openWorkflow = async () => {
    await p.locator('.top-project-badge-btn').click();
    await p.getByRole('option', { name: new RegExp(NAME) }).click();
    await p.locator('.sb-nav-item', { hasText: 'Quy trình & duyệt' }).click();
    await p.getByText('Lưu quy trình').waitFor();
  };
  await openWorkflow();
  await shot(p, 'wf1-default');

  await p.getByRole('button', { name: 'Plan → Code → Test' }).click();
  ok(await p.locator('.wfc-node .wfc-name').allTextContents().then(t => t.join(' → ')) === 'Plan — Kiến trúc → Lập trình → Kiểm thử', 'canvas shows Plan → Code → Test');
  ok(await p.locator('.wfc-skip').count() === 3, 'left-out steps listed under the canvas');

  // Canvas + inspector: click Plan, give it its own model and guardrails
  await p.locator('.wfc-node', { hasText: 'Plan — Kiến trúc' }).click();
  await p.locator('.wfi-title', { hasText: 'Plan — Kiến trúc' }).waitFor();
  const ins = p.locator('.wfi');
  await ins.getByLabel('Model AI — Plan — Kiến trúc').selectOption('claude:claude-opus-5-5');
  await ins.getByLabel('Giới hạn phút').fill('45');
  await ins.getByLabel('Ngân sách (₫)').fill('800000');
  await ins.getByLabel('Khi AI lỗi / quá giờ / vượt ngân sách').selectOption('RETRY');
  await ins.getByLabel('Số vòng thử lại').fill('2');
  await ins.getByRole('button', { name: 'Spec (PM)' }).click();
  await ins.getByLabel('Thêm đường dẫn file đầu vào').fill('docs/architecture.md');
  await ins.getByRole('button', { name: 'Thêm', exact: true }).click();
  ok(await p.locator('.wfc-node.on .wfc-sum').textContent() === '45 phút · thử lại 2 lần · trần 800.000 ₫ · 2 đầu vào', 'the node summarises its guardrails');
  // TEST: only after a green DEV, and stop the whole run when it fails
  await p.locator('.wfc-node', { hasText: 'Kiểm thử' }).click();
  await ins.getByLabel('Điều kiện chạy').selectOption('PREV_PASSED');
  await ins.getByLabel('Khi AI lỗi / quá giờ / vượt ngân sách').selectOption('FAIL_RUN');
  ok(await p.locator('.wfc-node', { hasText: 'Lập trình' }).click().then(() => ins.getByLabel('Điều kiện chạy').isDisabled()), 'Code always runs (condition locked)');
  await shot(p, 'wf2-canvas');
  await p.getByRole('tab', { name: 'Bảng chi tiết' }).click();
  ok(await p.locator('.wfe-table tbody tr').count() === 6, 'detailed table lists every step');
  ok(await p.locator('.wfe-table').getByText('AI phản biện plan').count() === 1, 'table shows what the lane really runs');
  await shot(p, 'wf2-table');

  // 6 phases: bring PM back (approved automatically) and DRAG it above Plan
  await p.getByRole('tab', { name: '6 giai đoạn' }).click();
  await p.getByRole('radiogroup', { name: 'Chế độ bước PM — Yêu cầu' }).getByText('Tự duyệt').click();
  const grip = p.locator('[data-grip="PM"]');
  const box = await grip.boundingBox();
  const rowH = await p.locator('.gate-pipeline-card').first().evaluate(el => el.offsetHeight);
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - (rowH * i) / 8);
  await shot(p, 'wf2-dragging');
  await p.mouse.up();
  const order = () => p.locator('.gate-pipeline-card .gate-step-name').allTextContents();
  ok((await order())[0] === 'PM — Yêu cầu', 'dragging the handle moved PM to the top');
  // keyboard: ↓ then ↑ on the same handle → back where it was, focus kept
  await p.locator('[data-grip="PM"]').focus();
  await p.keyboard.press('ArrowDown');
  ok((await order())[1] === 'PM — Yêu cầu', 'arrow down moves the step');
  await p.keyboard.press('ArrowUp');
  ok((await order())[0] === 'PM — Yêu cầu', 'arrow up moves it back');
  ok(await p.locator('[data-grip="DEV"]').count() === 0, 'DEV cannot be moved');
  ok(await p.getByRole('radiogroup', { name: 'Chế độ bước Lập trình' }).getByText('Bỏ bước').count() === 0, 'DEV cannot be skipped');
  await shot(p, 'wf3-edited');
  await p.getByRole('button', { name: 'Lưu quy trình' }).click();
  await p.getByText('Đã lưu.', { exact: false }).waitFor();

  const wf1 = (await api('GET', `/api/platform/projects/${pid}/workflow`)).body.data;
  ok(wf1.map(w => `${w.step}:${w.mode}`).join() === 'PM:AUTO,ARCH:REQUIRED,BA:SKIP,DESIGN:SKIP,DEV:AUTO,TEST:AUTO', 'saved order and modes');
  const arch = wf1.find(w => w.step === 'ARCH').config;
  const sorted = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
  ok(sorted(arch) === sorted({ model: 'claude:claude-opus-5-5', maxRetries: 2, timeoutMinutes: 45, budgetVnd: 800000, onFailure: 'RETRY', requiredInputs: ['spec.md', 'docs/architecture.md'] }),
    `ARCH settings saved on the project (${JSON.stringify(arch)})`);
  ok(wf1.find(w => w.step === 'TEST').config.condition === 'PREV_PASSED', 'TEST condition saved');

  await p.reload(); await p.waitForSelector('.sb-user');
  await openWorkflow();
  ok(await p.locator('.wfc-node .wfc-name').allTextContents().then(t => t.join(' → ')) === 'PM — Yêu cầu → Plan — Kiến trúc → Lập trình → Kiểm thử', 'after reload the canvas shows the saved workflow');
  await shot(p, 'wf4-after-reload');

  // A new feature run (what a lane does at /ship-feature start) follows the project's workflow.
  const token = fs.readFileSync(path.join(HARNESS, 'run/platform/service-token'), 'utf8').trim();
  const run = await (await fetch(`${ORCH}/internal/v1/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: JSON.stringify({ projectId: pid, laneRef: 'e2e:lane9', title: 'thử quy trình', description: '', createdBy: 'e2e' }) })).json();
  ok(run.data.currentStep === 'PM', `the run starts at PM (${run.data.currentStep})`);
  ok(run.data.workflow.join() === 'PM,ARCH,BA,DESIGN,DEV,TEST', 'the run froze the workflow order');
  const nx = await (await fetch(`${ORCH}/internal/v1/runs/${run.data.id}/next`, { headers: { 'X-Service-Token': token } })).json();
  ok(nx.data.stepConfig.ARCH.timeoutMinutes === 45 && nx.data.stepConfig.TEST.onFailure === 'FAIL_RUN', 'the lane receives the frozen step settings');

  const bad = await api('PUT', `/api/platform/projects/${pid}/workflow`, wf1.map(w => (w.step === 'DEV' ? { ...w, mode: 'SKIP' } : w)));
  ok(bad.status === 400, 'skipping DEV is refused by the server');

  await p.setViewportSize({ width: 390, height: 844 });
  await shot(p, 'wf5-mobile');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll on a phone');
} finally {
  if (pid && !process.env.KEEP) {
    const r = await api('DELETE', `/api/platform/projects/${pid}?confirm=${slug}`);
    console.log('cleaned up', slug, r.status);
  }
  await b.close();
}
