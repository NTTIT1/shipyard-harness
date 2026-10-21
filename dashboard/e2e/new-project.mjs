// Live UI flow: an admin creates a React + Vite project with the wizard, then deletes it again.
// Needs: bin/platform.sh start; a dashboard (DASH, default :8099); Chrome at CHROME_BIN or /usr/bin/google-chrome.
import { chromium } from 'playwright-core';

const DASH = process.env.DASH || 'http://127.0.0.1:8099';
const GW = process.env.GW || 'http://127.0.0.1:9080';
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const J = { 'Content-Type': 'application/json' };
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
const shot = async (p, n) => { if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${n}.png` }); };

const name = `Wizard thử ${Date.now() % 100000}`;
const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.goto(DASH);
await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
await p.waitForSelector('.sb-user');
await p.getByRole('button', { name: 'Dự án' }).click();
await p.getByRole('button', { name: 'Tạo', exact: true }).click();
await p.getByRole('button', { name: /Tạo từ khung/ }).click();
const m = p.locator('.modal-panel');
const next = m.getByRole('button', { name: 'Tiếp' });
ok(await next.isDisabled(), 'cannot continue without a name');
await p.fill('#wz-name', name);
const slug = await p.inputValue('#wz-slug');
ok(/^wizard-thu-\d+$/.test(slug), `slug derived from the name (${slug})`);
await shot(p, 'wz1-info');
await next.click();
await next.click(); // need: no AI advice
await next.click(); // project kind: one app (default)
await m.getByText('TypeScript', { exact: true }).click(); await next.click();
await m.getByText('React + Vite', { exact: true }).click();
await shot(p, 'wz2-stack');
await next.click();
ok(await m.getByText('Database', { exact: true }).count() === 0, 'React + Vite skips the database step');
await next.click(); // options
await next.click(); // git
await next.click(); // architecture: create now
await next.click(); // workflow: default
const aiTeam = m.getByRole('checkbox', { name: /AI Manager/ });
if (await aiTeam.isChecked()) await aiTeam.uncheck();   // no real Claude for a throwaway project
await next.click(); // AI team → review
await shot(p, 'wz3-review');
ok(await m.getByText('React + Vite').count() > 0, 'review lists the stack');
await m.getByRole('button', { name: 'Tạo dự án' }).click();
await m.getByRole('button', { name: 'Mở dự án' }).waitFor({ timeout: 8 * 60_000 });
await shot(p, 'wz4-done');
ok(await m.locator('.wz-done').count() === 1, 'job finished: build, test, git, register');
await m.getByRole('button', { name: 'Mở dự án' }).click();
await p.waitForTimeout(800);
ok(await p.getByText(name).count() > 0, 'new project is selected in the list');

const AT = (await (await fetch(`${GW}/api/v1/auth/login`, { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@shipyard.local', password: PW }) })).json()).data.accessToken;
const A = { ...J, Authorization: `Bearer ${AT}` };
const proj = (await (await fetch(`${GW}/api/v1/projects`, { headers: A })).json()).data.find(x => x.slug === slug);
ok(proj && proj.defaultBranch === 'development' && proj.repoUrl.endsWith(`/${slug}`), `project registered (${proj?.repoUrl})`);
if (!process.env.KEEP) {
  const d = await fetch(`${GW}/api/v1/projects/${proj.id}?confirm=${slug}`, { method: 'DELETE', headers: A });
  ok(d.ok, 'test project deleted again');
}
await b.close();
