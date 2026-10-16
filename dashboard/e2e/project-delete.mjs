// Live UI flow: an owner deletes a throwaway project (with a run + memory) via "Xoá dự án".
// Needs: bin/platform.sh start; a dashboard (DASH, default :8099); Chrome at CHROME_BIN or /usr/bin/google-chrome.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const DASH = process.env.DASH || 'http://127.0.0.1:8099';
const GW = process.env.GW || 'http://127.0.0.1:9080';
const ORCH = process.env.ORCH || 'http://127.0.0.1:9084';
const TOKEN = process.env.SHIPYARD_SERVICE_TOKEN || fs.readFileSync(path.resolve('../run/platform/service-token'), 'utf8').trim();
const PW = process.env.ADMIN_PASSWORD || 'admin123';
const J = { 'Content-Type': 'application/json' };
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };

const AT = (await (await fetch(`${GW}/api/v1/auth/login`, { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@shipyard.local', password: PW }) })).json()).data.accessToken;
const A = { ...J, Authorization: `Bearer ${AT}` };
const slug = `xoa${Date.now()}`;
const proj = (await (await fetch(`${GW}/api/v1/projects`, { method: 'POST', headers: A, body: JSON.stringify({ name: `Xoá thử ${slug.slice(-5)}`, slug, repoUrl: 'https://example.com/r.git' }) })).json()).data;
const S = { ...J, 'X-Service-Token': TOKEN };
const run = (await (await fetch(`${ORCH}/internal/v1/runs`, { method: 'POST', headers: S, body: JSON.stringify({ projectId: proj.id, laneRef: 'x:lane9', title: 't', description: '', createdBy: 'usr_x' }) })).json()).data;
await fetch(`${ORCH}/internal/v1/runs/${run.id}/next`, { headers: S });
await fetch(`${ORCH}/internal/v1/runs/${run.id}/steps/PM/submit`, { method: 'POST', headers: S, body: JSON.stringify({ summary: 's', documents: { 'spec.md': '# S' }, images: [], meta: {}, contextUsed: [] }) });

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.goto(DASH);
await p.fill('input[type=email]', 'admin@shipyard.local'); await p.fill('input[type=password]', PW); await p.click('button[type=submit]');
await p.waitForSelector('.sb-user');
await p.getByRole('button', { name: 'Dự án' }).click();
await p.getByText(proj.name).first().click();
await p.getByRole('button', { name: 'Xoá dự án' }).click();
const confirmBtn = p.locator('.modal-panel').getByRole('button', { name: 'Xoá vĩnh viễn' });
await p.fill('#pj-del-confirm', 'sai-slug');
ok(await confirmBtn.isDisabled(), 'wrong slug keeps the delete disabled');
await p.fill('#pj-del-confirm', slug);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/pd1-confirm.png` });
await confirmBtn.click();
await p.locator('.modal-panel').waitFor({ state: 'detached' });
await p.waitForTimeout(800);
ok(await p.getByText(proj.name).count() === 0, 'project disappears from the list');
const gone = await fetch(`${GW}/api/v1/projects/${proj.id}`, { headers: A });
ok(gone.status === 404, 'project API returns 404');
const r = await fetch(`${ORCH}/internal/v1/runs/${run.id}`, { headers: S });
ok(r.status === 404, `orchestrator run purged (${r.status})`);
await b.close();
