// Live flow for the "Đội AI" tab (P5): an existing repo without an AI team → "Thiết lập đội AI" →
// the AI Manager (real Claude) drafts from the code → approve → rules pushed to the project branch;
// then a person edits the read matrix + a rule and uploads material → approve → pushed. Cleans up.
// Needs: platform + a dashboard (DASH) whose SHIPYARD_WORKSPACES is scratch, Chrome, a logged-in `claude`,
// and ORIGIN = a bare git repo with a `develop` branch and no .shipyard/.
import { chromium } from 'playwright-core';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DASH = process.env.DASH || 'http://127.0.0.1:8099';
const ORIGIN = process.env.ORIGIN;
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); console.log('ok -', m); };
const shot = async (p, n) => { if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${n}.png`, fullPage: true }); };
const git = (...a) => spawnSync('git', ['-C', ORIGIN, ...a], { encoding: 'utf8' }).stdout.trim();
if (!ORIGIN) { console.error('set ORIGIN'); process.exit(64); }

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage();
await p.goto(DASH);
await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
await p.waitForSelector('.sb-user');
const call = (method, url, body) => p.evaluate(async ([method, url, body]) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}, [method, url, body]);

const slug = `kho-cu-${Date.now() % 100000}`;
const created = await call('POST', '/api/platform/projects', { name: 'Kho cũ thử', slug, repoUrl: ORIGIN, defaultBranch: 'develop' });
ok(created.status === 200 || created.status === 201, `existing project registered (${slug})`);
const pid = created.json.data.id;

const approveLatest = async () => {
  const inbox = (await call('GET', '/api/platform/approvals/inbox')).json.data.filter(i => i.projectId === pid);
  ok(inbox.length === 1 && inbox[0].step === 'MANAGER', 'the change waits in "Chờ duyệt" as the MANAGER step');
  return inbox[0];
};

try {
  await p.locator('.sb-nav-item', { hasText: 'Tổng quan & thành viên' }).click();
  await p.getByRole('button', { name: /Kho cũ thử/ }).click();
  await p.getByRole('tab', { name: 'Đội AI' }).click();
  await p.getByText('Dự án chưa có đội AI').waitFor({ timeout: 120_000 });
  ok(true, 'the tab clones the repo and offers to set up an AI team');
  await shot(p, 't1-adopt');
  await p.fill('#tm-adopt-note', 'Mọi API trả về ApiResponse<T>; mapping entity↔DTO bằng MapStruct.');
  await p.getByRole('button', { name: 'Thiết lập đội AI' }).click();
  await p.getByRole('button', { name: 'Xem & duyệt' }).or(p.locator('.tm-err')).first().waitFor({ timeout: 25 * 60_000 });
  ok(await p.getByRole('button', { name: 'Xem & duyệt' }).count() === 1, 'AI Manager drafted the rules from the real code');
  await shot(p, 't2-drafted');

  const item = await approveLatest();
  const view = (await call('GET', `/api/platform/runs/${item.runId}`)).json.data;
  const docs = (await call('GET', `/api/platform/runs/${item.runId}/revisions/${view.revisions.at(-1).id}`)).json.data.documents;
  console.log('   documents:', Object.keys(docs).join(', '));
  ok(/ApiResponse|MapStruct/.test(Object.values(docs).join('\n')), 'the rules follow the code + the note (ApiResponse / MapStruct)');

  await p.getByRole('button', { name: 'Xem & duyệt' }).click();
  await p.getByRole('button', { name: /^Duyệt/ }).click();
  for (let i = 0; i < 60 && git('log', '-1', '--format=%s', 'develop') !== 'docs(rules): project AI-team rules approved in Shipyard'; i++) await p.waitForTimeout(500);
  ok(git('show', 'develop:.shipyard/rules/project.md') === docs['project.md'].trim(), 'approved in the review screen → rules pushed to origin develop');

  // A person's edit: DEVOPS reads dev.md too, a new security rule file, and material for the AI.
  await p.locator('.sb-nav-item', { hasText: 'Tổng quan & thành viên' }).click();
  await p.getByRole('button', { name: /Kho cũ thử/ }).click();
  await p.getByRole('tab', { name: 'Đội AI' }).click();
  await p.locator('.tm-matrix').waitFor();
  const box = p.getByRole('checkbox', { name: /DevOps đọc dev.md/ });
  const before = await box.isChecked();
  await box.click();
  await p.fill('input[aria-label="Tên file luật mới"]', 'security');
  await p.getByRole('button', { name: 'Thêm', exact: true }).click();
  await p.fill('textarea[aria-label="Nội dung security.md"]', '# Luật bảo mật\n\n- **MUST** mọi endpoint ghi dữ liệu phải kiểm tra quyền.\n');
  await p.getByRole('checkbox', { name: /AI Review đọc security.md/ }).click();
  await p.locator('input[type=file]').setInputFiles({ name: 'quy-dinh.md', mimeType: 'text/markdown', buffer: Buffer.from('# Quy định công ty\nKhông log số CCCD.') });
  await p.getByText('quy-dinh.md').waitFor();
  ok(await p.locator('.tm-human li', { hasText: 'quy-dinh.md' }).getByText('chưa commit').count() === 1, 'uploaded material listed as not yet committed');
  await p.fill('input[aria-label="Ghi chú cho người duyệt"]', 'Thêm luật bảo mật');
  await shot(p, 't3-edit');
  await p.getByRole('button', { name: 'Gửi duyệt' }).click();
  await p.getByRole('button', { name: 'Xem & duyệt' }).waitFor({ timeout: 60_000 });
  const item2 = await approveLatest();
  const d2 = await call('POST', `/api/platform/approvals/${item2.approvalId}/decision`, { action: 'APPROVE' });
  ok(d2.status === 200, 'person\'s change approved');
  for (let i = 0; i < 60 && !git('show', 'develop:.shipyard/rules/security.md'); i++) await p.waitForTimeout(500);
  const team = JSON.parse(git('show', 'develop:.shipyard/team.json'));
  ok(git('show', 'develop:.shipyard/rules/security.md').includes('kiểm tra quyền'), 'new rule file pushed');
  ok(team.roles.REVIEW.reads.includes('rules/security.md') && team.roles.DEVOPS.reads.includes('rules/dev.md') !== before, 'read matrix change pushed');
  ok(git('show', 'develop:.shipyard/human/quy-dinh.md').includes('CCCD'), 'material committed with the approved rules');
  await p.getByRole('button', { name: 'Tải lại' }).click();
  await p.locator('.tm-human li', { hasText: 'quy-dinh.md' }).waitFor();
  await shot(p, 't4-done');
} finally {
  if (!process.env.KEEP) {
    const del = await call('DELETE', `/api/platform/projects/${pid}?confirm=${slug}`);
    console.log(del.status === 200 ? 'ok - test project deleted' : `cleanup: delete returned ${del.status}`);
    fs.rmSync(path.join(process.env.SHIPYARD_WORKSPACES || path.join(os.homedir(), 'shipyard-workspaces'), '.team', slug), { recursive: true, force: true });
  }
  await b.close();
}
