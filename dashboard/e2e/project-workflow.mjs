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

  await p.getByRole('button', { name: 'Kiến trúc → Code → Test' }).click();
  ok(await p.locator('.wf-chip').allTextContents().then(t => t.join(' → ')) === 'Kiến trúc → Lập trình → Kiểm thử', 'preset shows ARCH → DEV → TEST');
  // fine-tune: bring PM back right after ARCH, approved automatically
  await p.getByRole('radiogroup', { name: 'Chế độ bước PM — Yêu cầu' }).getByText('Tự duyệt').click();
  ok(await p.getByRole('button', { name: 'Đưa Lập trình lên trước' }).count() === 0, 'DEV cannot be moved');
  ok(await p.getByRole('radiogroup', { name: 'Chế độ bước Lập trình' }).getByText('Bỏ bước').count() === 0, 'DEV cannot be skipped');
  await shot(p, 'wf2-edited');
  await p.getByRole('button', { name: 'Lưu quy trình' }).click();
  await p.getByText('Đã lưu.', { exact: false }).waitFor();

  const wf1 = (await api('GET', `/api/platform/projects/${pid}/workflow`)).body.data;
  ok(wf1.map(w => `${w.step}:${w.mode}`).join() === 'ARCH:REQUIRED,PM:AUTO,BA:SKIP,DESIGN:SKIP,DEV:REQUIRED,TEST:REQUIRED', 'saved order and modes');

  await p.reload(); await p.waitForSelector('.sb-user');
  await openWorkflow();
  ok(await p.locator('.wf-chip').allTextContents().then(t => t.join(' → ')) === 'Kiến trúc → PM — Yêu cầu → Lập trình → Kiểm thử', 'after reload the page shows the saved workflow');
  await shot(p, 'wf3-after-reload');

  // A new feature run (what a lane does at /ship-feature start) follows the project's workflow.
  const token = fs.readFileSync(path.join(HARNESS, 'run/platform/service-token'), 'utf8').trim();
  const run = await (await fetch(`${ORCH}/internal/v1/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: JSON.stringify({ projectId: pid, laneRef: 'e2e:lane9', title: 'thử quy trình', description: '', createdBy: 'e2e' }) })).json();
  ok(run.data.currentStep === 'ARCH', `the run starts at ARCH (${run.data.currentStep})`);
  ok(run.data.workflow.join() === 'ARCH,PM,BA,DESIGN,DEV,TEST', 'the run froze the workflow order');

  const bad = await api('PUT', `/api/platform/projects/${pid}/workflow`, wf1.map(w => (w.step === 'DEV' ? { ...w, mode: 'SKIP' } : w)));
  ok(bad.status === 400, 'skipping DEV is refused by the server');

  await p.setViewportSize({ width: 390, height: 844 });
  await shot(p, 'wf4-mobile');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll on a phone');
} finally {
  if (pid && !process.env.KEEP) {
    const r = await api('DELETE', `/api/platform/projects/${pid}?confirm=${slug}`);
    console.log('cleaned up', slug, r.status);
  }
  await b.close();
}
