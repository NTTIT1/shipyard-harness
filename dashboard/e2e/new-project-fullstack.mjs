// Live, through the browser: the wizard creates a FULLSTACK project (Spring Boot backend/ + React
// frontend/) — real generators, build + test of both halves, git, platform registration. Cleans up.
// Needs: platform + dashboard (DASH, default :8090), Chrome, JDK + Node on the host.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

const DASH = process.env.DASH || 'http://127.0.0.1:8090';
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const SHOTS = process.env.SHOTS;
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); console.log('ok -', m); };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png` }); };

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage();
const name = `Kho fullstack ${Date.now() % 100000}`;
let slug = '', projectId = null;
try {
  await p.goto(DASH);
  await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
  await p.waitForSelector('.sb-user');
  await p.getByRole('button', { name: /Khởi tạo dự án từ khung/ }).click();
  const m = p.locator('.modal-panel');
  const next = m.getByRole('button', { name: 'Tiếp' });
  await p.fill('#wz-name', name);
  slug = await p.inputValue('#wz-slug');
  await next.click();
  await next.click();                                                              // need: no AI advice
  await m.getByText('Fullstack: backend + frontend', { exact: true }).click();
  await shot(p, 'fs1-kind');
  await next.click();
  ok(await m.getByText('TypeScript', { exact: true }).count() === 1, 'language step lists backend languages only (TypeScript = NestJS)');
  await m.getByText('Java', { exact: true }).click(); await next.click();
  ok(await m.getByText('React + Vite', { exact: true }).count() === 0, 'backend step offers no frontend framework');
  await m.getByText('Spring Boot', { exact: true }).click(); await next.click();
  await m.getByText('Không dùng', { exact: true }).click(); await next.click();   // database
  await next.click();                                                               // backend options
  ok(await m.getByText('Frontend (thư mục frontend/, gọi backend qua /api)').count() === 1, 'frontend step');
  ok(await m.locator('input[name=frontend]:checked').count() === 1, 'React + Vite preselected');
  await shot(p, 'fs2-frontend');
  await next.click();                                                               // git (local)
  await next.click();                                                               // architecture: create now
  await next.click();                                                               // workflow: default
  await next.click();                                                               // AI team
  // Skip the AI Manager for a throwaway project (it would draft rules with real Claude).
  const aiTeam = m.getByRole('checkbox', { name: /AI Manager/ });
  if (await aiTeam.isChecked()) await aiTeam.uncheck();
  ok(!(await aiTeam.isChecked()), 'AI Manager off for the test project');
  await next.click();                                                               // review
  await shot(p, 'fs3-review');
  ok(await m.getByText('Fullstack — backend/ + frontend/ trong một repo').count() === 1, 'review shows the project kind');
  ok(await m.getByText('Không (chỉ dùng luật khởi đầu)').count() === 1, 'review: no AI Manager run');
  ok(await m.getByText('Java · Spring Boot').count() > 0 && await m.getByText('TypeScript · React + Vite').count() > 0, 'review shows both halves');
  await m.getByRole('button', { name: 'Tạo dự án' }).click();
  await m.getByRole('button', { name: 'Mở dự án' }).or(m.getByRole('button', { name: /Xoá thư mục/ })).first().waitFor({ timeout: 15 * 60_000 });
  await shot(p, 'fs4-done');
  ok(await m.getByRole('button', { name: 'Mở dự án' }).count() === 1, 'job finished: both halves built + tested, git, registered');
  const dir = path.join(os.homedir(), 'shipyard-workspaces', slug);
  ok(fs.existsSync(path.join(dir, 'backend/pom.xml')) && fs.existsSync(path.join(dir, 'frontend/package.json')), 'backend/ and frontend/ in one repo');
  const log = spawnSync('git', ['-C', dir, 'log', '--oneline', '-1'], { encoding: 'utf8' }).stdout;
  ok(/fullstack \(java-spring \+ ts-react-vite\)/.test(log), `first commit names both halves (${log.trim()})`);
  const pj = await p.evaluate(async s => (await (await fetch('/api/platform/projects')).json()).data.find(x => x.slug === s), slug);
  projectId = pj?.id;
  ok(!!projectId, 'registered on the platform');
} finally {
  if (!process.env.KEEP && slug) {
    if (projectId) await p.evaluate(async ([id, s]) => fetch(`/api/platform/projects/${id}?confirm=${s}`, { method: 'DELETE' }), [projectId, slug]);
    fs.rmSync(path.join(os.homedir(), 'shipyard-workspaces', slug), { recursive: true, force: true });
    console.log('cleaned up', slug);
  }
  await b.close();
}
