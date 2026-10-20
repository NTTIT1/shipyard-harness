// Live: generate a REAL fullstack project (backend/ + frontend/) through the wizard's job runner,
// with the real toolchains (Initializr/Maven or Nest CLI/npm, create-vite/npm), build + test both,
// then run ./dev.sh and prove the frontend reaches the backend through /api.
//   node e2e/fullstack-generate.mjs <backend-stack> [root] [backend-port]
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createJobRunner } from '../server/services/scaffold/jobs.js';
import { validateRequest } from '../server/services/scaffold/catalog.js';
import { probeTools } from '../server/services/scaffold/util.js';

const backendStack = process.argv[2] || 'java-spring';
const root = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'fs-gen-'));
const port = process.argv[4] || '9090';
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
const tools = probeTools();
const slug = `fs-${backendStack.split('-')[1]}-${Date.now() % 10000}`;
const spec = validateRequest({ name: 'Kho hàng thử', slug, kind: 'fullstack', stack: backendStack,
  options: { db: 'none', docker: true }, frontend: { stack: 'ts-react-vite', options: { tests: true, docker: true } },
  aiTeam: false, git: { provider: 'local' } }, tools);
const runner = createJobRunner({ root, tools: () => tools, registerProject: async () => ({ id: 'proj_test' }) });
const t0 = Date.now();
const job = runner.start(spec, { id: 'u1', email: 'dev@example.com', name: 'Dev' }, null);
await runner.wait(job.id);
const j = runner.get(job.id);
if (j.status !== 'done') { console.error(j.log.slice(-40).join('\n')); }
ok(j.status === 'done', `${backendStack} + React generated, built and tested in ${Math.round((Date.now() - t0) / 1000)}s`);
const dir = j.dir;
for (const f of ['backend', 'frontend', 'dev.sh', 'docker-compose.yml', '.env.example', 'README.md', '.shipyard/project.json',
  '.shipyard/rules/project.md', 'frontend/src/BackendStatus.tsx', 'frontend/src/api.ts']) ok(fs.existsSync(path.join(dir, f)), `has ${f}`);
ok(fs.readFileSync(path.join(dir, 'frontend/vite.config.ts'), 'utf8').includes("'/api'"), 'vite proxies /api');
ok(!fs.existsSync(path.join(dir, slug)), 'no stray folder named after the slug');

// run it: ./dev.sh, then ask the FRONTEND dev server for the backend's health through /api
const health = { 'java-spring': '/actuator/health', 'python-fastapi': '/health', 'ts-nestjs': '/' }[backendStack];
const dev = spawn('bash', ['./dev.sh'], { cwd: dir, env: { ...process.env, BACKEND_PORT: port }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; dev.stdout.on('data', d => { out += d; }); dev.stderr.on('data', d => { out += d; });
let answer = null;
for (let i = 0; i < 120 && !answer; i++) {
  await new Promise(r => setTimeout(r, 2000));
  try {
    const r = await fetch(`http://localhost:5173/api${health}`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) answer = { status: r.status, body: (await r.text()).slice(0, 80) };
  } catch { /* not up yet */ }
}
process.kill(-dev.pid, 'SIGTERM');
if (!answer) console.error(out.slice(-3000));
ok(answer, `frontend :5173/api${health} → backend :${port} answered ${answer && `${answer.status} ${answer.body}`}`);
const page = answer && await fetch('http://localhost:5173/').then(r => r.text()).catch(() => '');
console.log('project dir:', dir);
