// Live, through the browser: the lane pipeline after the code. A project sets its default (checks,
// PR, who merges, deploy wait, QC on the test environment, ticket); a lane overrides it and goes back
// to the project. Uses a throw-away project and an IDLE lane (LANE, default 3); restores both.
//   DASH=http://127.0.0.1:8090 LANE=3 node e2e/lane-pipeline.mjs
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const DASH = process.env.DASH || 'http://127.0.0.1:8090';
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const LANE = process.env.LANE || '3';
const SHOTS = process.env.SHOTS;
const HARNESS = process.env.HARNESS_ROOT || path.resolve(import.meta.dirname, '../..');
const OVERRIDE = path.join(HARNESS, 'config', 'lanes', `lane${LANE}.pipeline.json`);
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); console.log('ok -', m); };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
const slug = `pipe-${Date.now() % 100000}`;
const NAME = `Quy trình lane thử ${slug.slice(-5)}`;
if (fs.existsSync(OVERRIDE)) throw new Error(`lane ${LANE} already has a pipeline override — pick another LANE`);

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 1000 } })).newPage();
const api = (method, url, body) => p.evaluate(async ([m, u, bd]) => {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: bd ? JSON.stringify(bd) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, url, body]);
let pid = null;

try {
  await p.goto(DASH);
  await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
  await p.waitForSelector('.sb-user');
  const created = await api('POST', '/api/platform/projects', { slug, name: NAME, repoUrl: `file:///tmp/${slug}` });
  pid = created.body.data.id;
  ok((await api('GET', `/api/platform/projects/${pid}/delivery`)).body.data && Object.keys((await api('GET', `/api/platform/projects/${pid}/delivery`)).body.data).length === 0,
    'a new project follows its profile');

  // ── project default ──
  await p.reload(); await p.waitForSelector('.sb-user');
  await p.locator('.top-project-badge-btn').click();
  await p.getByRole('option', { name: new RegExp(NAME) }).click();
  await p.locator('.sb-nav-item', { hasText: 'Quy trình & duyệt' }).click();
  await p.getByText('Sau khi code xong — mặc định cho mọi lane của dự án').waitFor();
  await p.getByRole('checkbox', { name: /Đặt quy trình riêng cho dự án/ }).check();
  await p.getByRole('checkbox', { name: /^E2E/ }).uncheck();
  await p.locator('.wf-mode label', { hasText: 'Lane tự merge khi mọi thứ xanh' }).click();
  await p.getByText(/Lane tự merge chỉ khi CI của PR xanh/).waitFor();
  await p.getByRole('checkbox', { name: /QC trên môi trường test/ }).check();
  await p.getByLabel('Địa chỉ môi trường test').fill('javascript:x');
  ok(await p.getByText('Địa chỉ môi trường test dạng http(s)://…').count() === 1, 'a bad test URL is refused before saving');
  await p.getByLabel('Địa chỉ môi trường test').fill('http://192.168.56.10');
  await p.getByLabel('QC đỏ thì').selectOption('HUMAN');
  await shot(p, 'pl1-project');
  await p.getByRole('button', { name: 'Lưu', exact: true }).click();
  await p.getByText(/Đã lưu\. Áp dụng cho các tính năng giao từ bây giờ/).waitFor();
  const d = (await api('GET', `/api/platform/projects/${pid}/delivery`)).body.data;
  ok(d.e2e === false && d.merge === 'AUTO' && d.testQc === true && d.testUrl === 'http://192.168.56.10' && d.testQcOnFail === 'HUMAN' && d.ciGate === true,
    'project default saved on the platform');
  await api('PUT', `/api/platform/projects/${pid}/delivery`, {});
  ok(Object.keys((await api('GET', `/api/platform/projects/${pid}/delivery`)).body.data).length === 0, 'back to the profile');

  // ── lane override ──
  const before = (await api('GET', `/api/lane/${LANE}/pipeline`)).body;
  ok(before.override === null && before.effective.source !== 'lane', `lane ${LANE} follows ${before.effective.source}`);
  await p.reload(); await p.waitForSelector('.sb-user');
  // Open the lane's own project so its lanes are listed (LANE_PROJECT, default HRM-GMS).
  await p.locator('.top-project-badge-btn').click();
  await p.getByRole('option', { name: new RegExp(process.env.LANE_PROJECT || 'HRM-GMS') }).first().click();
  // "Lanes" in the sidebar toggles its list: open it only when it is closed.
  const laneItem = p.locator('.sb-sub-lane-item').filter({ has: p.locator('.sb-sub-lane-name', { hasText: new RegExp(`^Lane ${LANE}$`) }) });
  await p.waitForTimeout(1500);   // the sidebar re-renders for the new project choice
  if (!(await laneItem.count())) await p.locator('.sb-nav-item', { hasText: 'Lanes' }).click();
  await laneItem.first().click();
  await p.getByRole('button', { name: `Thao tác lane ${LANE}` }).first().click();
  await p.getByRole('menuitem', { name: 'Quy trình của lane' }).click();
  const m = p.locator('.modal-panel');
  await m.getByText(/Đang chạy theo/).waitFor();
  await m.getByRole('checkbox', { name: /Dùng quy trình riêng cho lane này/ }).check();
  await m.getByRole('checkbox', { name: /Kiểm định GO\/NO-GO/ }).uncheck();
  await m.getByRole('checkbox', { name: /Mở pull request/ }).uncheck();
  ok(await m.getByText('Sau khi merge').count() === 0, 'no PR: the after-merge part disappears');
  await shot(p, 'pl2-lane');
  await m.getByRole('button', { name: 'Lưu', exact: true }).click();
  await m.getByText(/Đã lưu — lane áp dụng/).first().waitFor();
  const saved = JSON.parse(fs.readFileSync(OVERRIDE, 'utf8'));
  ok(saved.seniorGate === false && saved.openPr === false, 'override saved for the lane');
  const eff = (await api('GET', `/api/lane/${LANE}/pipeline`)).body.effective;
  ok(eff.source === 'lane' && eff.openPr === false && eff.seniorGate === false, 'the lane now runs its own pipeline');
  ok(await m.getByText(/riêng của lane này/).count() === 1, 'the modal says which pipeline the lane runs');
  await m.getByRole('checkbox', { name: /Dùng quy trình riêng cho lane này/ }).uncheck();
  await m.getByRole('button', { name: 'Lưu', exact: true }).click();
  await m.getByText(/(mặc định của dự án|cấu hình gốc của profile)/).waitFor();
  ok(!fs.existsSync(OVERRIDE), 'override removed — the lane follows its project again');
} finally {
  if (!process.env.KEEP) {
    fs.rmSync(OVERRIDE, { force: true });
    if (pid) await api('DELETE', `/api/platform/projects/${pid}?confirm=${slug}`);
    console.log('cleaned up', slug, `lane${LANE}`);
  }
  await b.close();
}
