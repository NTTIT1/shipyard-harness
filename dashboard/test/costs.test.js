// Costs API: admin-only, month aggregation from run/lane*/usage.jsonl, settings + per-feature hours.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, srv, url, role = 'SYS_ADMIN';
const J = { 'Content-Type': 'application/json' };

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-costs-'));
  process.env.HARNESS_ROOT = tmp;
  fs.mkdirSync(path.join(tmp, 'run', 'lane2'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'run', 'lane2', 'usage.jsonl'), [
    { at: '2026-10-10T03:00:00Z', lane: 2, step: 'pm', model: 'opus', feature: 'run_1', featureTitle: 'Chat', in: 10, out: 1, cacheRead: 0, cacheWrite: 0, usd: 2 },
    { at: '2026-10-11T03:00:00Z', lane: 2, step: 'main', stage: 'implementing', model: 'opus', feature: 'run_1', featureTitle: 'Chat', in: 10, out: 1, cacheRead: 0, cacheWrite: 0, usd: 3 },
  ].map(r => JSON.stringify(r)).join('\n') + '\n{torn');
  const { costsRouter } = await import('../server/routes/costs.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'u', role }; next(); });
  app.use(costsRouter());
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  url = `http://127.0.0.1:${srv.address().port}`;
});
afterAll(() => { srv?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('costs API', () => {
  it('aggregates the month for admins', async () => {
    role = 'SYS_ADMIN';
    const r = await (await fetch(`${url}/api/costs?month=2026-10`)).json();
    expect(r.totals.usd).toBe(5);
    expect(r.features[0].phases.DEV.usd).toBe(3);
    expect(r.settings.rates.DEVELOPER).toBeGreaterThan(0);
    expect(r.months).toEqual(['2026-10']);
  });
  it('is forbidden for non-admins and rejects a bad month', async () => {
    role = 'USER';
    expect((await fetch(`${url}/api/costs`)).status).toBe(403);
    role = 'SYS_ADMIN';
    expect((await fetch(`${url}/api/costs?month=2026-1x`)).status).toBe(400);
  });
  it('saves settings and per-feature hours', async () => {
    let r = await fetch(`${url}/api/costs/settings`, { method: 'PUT', headers: J, body: JSON.stringify({ planFeeVnd: 5000000, rates: { DEVELOPER: 300000 } }) });
    expect((await r.json()).rates.DEVELOPER).toBe(300000);
    r = await fetch(`${url}/api/costs/settings`, { method: 'PUT', headers: J, body: JSON.stringify({ usdToVnd: -1 }) });
    expect(r.status).toBe(400);
    await fetch(`${url}/api/costs/feature-hours`, { method: 'PUT', headers: J, body: JSON.stringify({ key: 'run_1', hours: { DEV: 40 } }) });
    const a = await (await fetch(`${url}/api/costs?month=2026-10`)).json();
    expect(a.totals.vnd).toBe(5000000);
    expect(a.features[0].hours.DEV).toBe(40);
  });
});
