// Project wizard: catalog validation, per-stack wiring, shared overlay and the job runner.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import express from 'express';
import { publicCatalog, validateRequest } from '../server/services/scaffold/catalog.js';
import { springDependencies, initializrUrl, addTestH2, springProperties, javaPackage } from '../server/services/scaffold/stacks/java-spring.js';
import { patchAppModule, nestPackages } from '../server/services/scaffold/stacks/ts-nestjs.js';
import { withVitest } from '../server/services/scaffold/stacks/ts-react-vite.js';
import { pythonDeps } from '../server/services/scaffold/stacks/python-fastapi.js';
import { mergeGitignore, composeFile, commonFiles } from '../server/services/scaffold/common.js';
import { createJobRunner } from '../server/services/scaffold/jobs.js';
import { run as realRun, npmInstallArgs, writeFiles } from '../server/services/scaffold/util.js';
import { scaffoldRouter, cachedProbe } from '../server/routes/scaffold.js';

const ALL = { java: { ok: true, major: 21, version: '21' }, node: { ok: true, major: 22 }, npm: { ok: true, major: 10 },
  uv: { ok: true }, git: { ok: true }, unzip: { ok: true } };
const req = (over = {}) => ({ name: 'Cửa hàng', slug: 'shop-api', stack: 'java-spring', options: {}, ...over });

describe('validateRequest', () => {
  it('fills option defaults and keeps only catalog keys', () => {
    const s = validateRequest(req({ options: { db: 'mysql', evil: 'rm -rf /' } }), ALL);
    expect(s).toEqual({ name: 'Cửa hàng', slug: 'shop-api', description: '', kind: 'single', stack: 'java-spring',
      options: { build: 'maven', javaVersion: '21', groupId: 'com.example', db: 'mysql', auth: 'none', docker: true },
      git: { provider: 'local' }, aiTeam: true, brief: '' });
  });
  it('rejects bad slugs, unknown stacks, choices and text patterns', () => {
    for (const slug of ['Shop', 'a', '1shop', 'shop_api', 'shop-', 'x'.repeat(41)]) {
      expect(() => validateRequest(req({ slug }), ALL)).toThrow(/Slug/);
    }
    expect(() => validateRequest(req({ stack: 'cobol' }), ALL)).toThrow(/Framework/);
    expect(() => validateRequest(req({ options: { db: 'oracle' } }), ALL)).toThrow(/Database/);
    expect(() => validateRequest(req({ options: { groupId: 'com.x;rm' } }), ALL)).toThrow(/Group ID/);
    expect(() => validateRequest(req({ name: 'a\nb' }), ALL)).toThrow(/một dòng/);
  });
  it('forces no database for frontend stacks', () => {
    expect(validateRequest(req({ stack: 'ts-react-vite' }), ALL).options.db).toBe('none');
  });
  it('refuses when the host lacks a tool or an old enough Java', () => {
    expect(() => validateRequest(req({ stack: 'python-fastapi' }), { ...ALL, uv: { ok: false } })).toThrow(/uv.*astral/);
    expect(() => validateRequest(req({ options: { javaVersion: '25' } }), ALL)).toThrow(/Java 21.*Java 25/);
  });
});

describe('publicCatalog', () => {
  it('groups stacks by language and reports missing tools with a hint', () => {
    const c = publicCatalog({ ...ALL, uv: { ok: false } });
    expect(c.languages.map(l => l.id)).toEqual(['java', 'python', 'typescript']);
    const ts = c.languages.find(l => l.id === 'typescript');
    expect(ts.stacks.map(s => s.label)).toEqual(['React + Vite', 'NestJS']);
    const py = c.languages.find(l => l.id === 'python').stacks[0];
    expect(py.available).toBe(false);
    expect(py.missing[0].tool).toBe('uv');
    const db = c.languages[0].stacks[0].options.find(o => o.id === 'db');
    expect(db.choices[0]).toEqual({ id: 'postgresql', label: 'PostgreSQL' });
  });
});

describe('Spring Boot', () => {
  const ctx = (o = {}) => ({ slug: 'shop-api', name: 'Shop', description: '', options: { build: 'maven', javaVersion: '21', groupId: 'com.acme', db: 'postgresql', auth: 'none', docker: true, ...o } });
  it('maps options to Initializr dependencies', () => {
    expect(springDependencies(ctx().options)).toEqual(['web', 'actuator', 'validation', 'data-jpa', 'postgresql']);
    expect(springDependencies(ctx({ db: 'mongodb', auth: 'jwt' }).options)).toEqual(['web', 'actuator', 'validation', 'data-mongodb', 'security', 'oauth2-resource-server']);
    expect(springDependencies(ctx({ db: 'none', auth: 'oauth2' }).options)).toContain('oauth2-client');
  });
  it('builds the Initializr URL', () => {
    const u = new URL(initializrUrl(ctx({ build: 'gradle' })));
    expect(u.host).toBe('start.spring.io');
    expect(u.searchParams.get('type')).toBe('gradle-project');
    expect(u.searchParams.get('packageName')).toBe('com.acme.shopapi');
    expect(u.searchParams.get('baseDir')).toBe('shop-api');
  });
  it('makes a valid Java package from any slug', () => {
    expect(javaPackage('com.acme', 'shop-2-api')).toBe('com.acme.shop2api');
    expect(javaPackage('com.acme', 'a1')).toBe('com.acme.a1');
  });
  it('adds H2 in test scope to Maven and Gradle builds, once', () => {
    const pom = '<project>\n\t<dependencies>\n\t\t<dependency/>\n\t</dependencies>\n</project>';
    const p = addTestH2('pom.xml', pom);
    expect(p).toMatch(/<artifactId>h2<\/artifactId>\n\t\t\t<scope>test<\/scope>/);
    expect(addTestH2('pom.xml', p)).toBe(p);
    expect(addTestH2('build.gradle', "dependencies {\n\timplementation 'x'\n}")).toContain("testRuntimeOnly 'com.h2database:h2'");
  });
  it('reads the shared env names', () => {
    const pg = springProperties(ctx());
    expect(pg).toContain('jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:shop_api}');
    expect(springProperties(ctx({ db: 'mongodb' }))).toContain('spring.mongodb.uri=${MONGODB_URI:');
    expect(springProperties(ctx({ db: 'redis' }))).toContain('spring.data.redis.host=${REDIS_HOST:localhost}');
  });
});

describe('NestJS', () => {
  const mod = "import { Module } from '@nestjs/common';\nimport { AppController } from './app.controller.js';\n\n@Module({\n  imports: [],\n  controllers: [AppController],\n})\nexport class AppModule {}\n";
  it('registers config + TypeORM in AppModule', () => {
    const out = patchAppModule(mod, { db: 'postgresql', auth: 'jwt' });
    expect(out).toMatch(/import \{ AppController \} from '\.\/app\.controller\.js';\nimport \{ ConfigModule, ConfigService \}/);
    expect(out).toContain("type: 'postgres'");
    expect(out).toContain('JwtModule.registerAsync');
    expect(out).toContain('ConfigModule.forRoot({ isGlobal: true })');
  });
  it('fails loudly when the CLI output changes shape', () => {
    expect(() => patchAppModule(mod.replace('imports: [],', 'imports: [X],'), { db: 'none' })).toThrow(/app\.module/);
  });
  it('picks driver packages', () => {
    expect(nestPackages({ db: 'mysql' })).toEqual(['@nestjs/config', '@nestjs/typeorm', 'typeorm', 'mysql2']);
    expect(nestPackages({ db: 'mongodb', auth: 'jwt' })).toEqual(['@nestjs/config', '@nestjs/mongoose', 'mongoose', '@nestjs/jwt']);
  });
});

describe('React + Vite', () => {
  it('wires Vitest into config and scripts', () => {
    const cfg = "import react from '@vitejs/plugin-react'\nexport default defineConfig({\n  plugins: [react()],\n})\n";
    const w = withVitest(cfg, JSON.stringify({ scripts: { build: 'vite build' } }));
    expect(w.viteConfig).toMatch(/^\/\/\/ <reference types="vitest\/config" \/>/);
    expect(w.viteConfig).toContain("plugins: [react()],\n  test: { environment: 'jsdom' },");
    expect(JSON.parse(w.pkgJson).scripts).toEqual({ build: 'vite build', test: 'vitest run' });
  });
});

describe('FastAPI', () => {
  it('picks drivers per database', () => {
    expect(pythonDeps({ db: 'postgresql', auth: 'jwt' })).toEqual(expect.arrayContaining(['sqlalchemy>=2.0', 'psycopg[binary]>=3.2', 'pyjwt>=2.9']));
    expect(pythonDeps({ db: 'none' }).some(d => d.startsWith('sqlalchemy'))).toBe(false);
  });
});

describe('npm', () => {
  it('adds --legacy-peer-deps only for npm < 10', () => {
    expect(npmInstallArgs({ npm: { major: 9 } })).toContain('--legacy-peer-deps');
    expect(npmInstallArgs({ npm: { major: 10 } }, ['-D', 'x'])).toEqual(['install', '--no-audit', '--no-fund', '-D', 'x']);
  });
});

describe('shared overlay', () => {
  it('merges .gitignore without duplicates and always ignores .env', () => {
    const g = mergeGitignore('node_modules\n.env\n', 'node_modules\ndist/\n');
    expect(g).toBe('node_modules\n.env\n\n# Shipyard\ndist/\n.env.*\n!.env.example\n.idea/\n.vscode/\n*.iml\n.DS_Store\n*.log\n');
    expect(mergeGitignore(g, 'dist/\n')).toBe(g);
  });
  it('writes compose for app + db, db only, or nothing', () => {
    const spring = { id: 'java-spring', appPort: 8080 };
    const both = composeFile({ slug: 'shop', options: { docker: true, db: 'postgresql' } }, spring);
    expect(both).toContain('  app:\n    build: .\n    ports: ["8080:8080"]\n    env_file: [.env]\n    environment:\n      DB_HOST: db\n    depends_on: [db]');
    expect(both).toContain('image: postgres:16-alpine');
    expect(both).toMatch(/volumes:\n {2}db-data:\n$/);
    expect(composeFile({ slug: 'shop', options: { docker: false, db: 'redis' } }, spring)).toBe('services:\n  db:\n    image: redis:7-alpine\n    ports: ["6379:6379"]\n');
    expect(composeFile({ slug: 'shop', options: { docker: false, db: 'none' } }, spring)).toBeNull();
  });
  it('never writes a real-looking secret into .env.example', () => {
    const fake = { id: 'x', languageLabel: 'X', label: 'Y', options: [], env: () => ({ JWT_SECRET: 'change-me' }),
      commands: () => ({ dev: 'run', build: 'build' }), gitignore: () => '' };
    const files = commonFiles({ name: 'S', slug: 'shop', options: { db: 'mysql', docker: true }, dir: '/nonexistent' }, fake, '2026-10-19T00:00:00Z');
    for (const line of files['.env.example'].trim().split('\n')) {
      const [k, v] = line.split('=');
      if (/PASSWORD|SECRET|TOKEN|KEY/.test(k)) expect(v).toBe('change-me');
    }
    expect(JSON.parse(files['.shipyard/project.json'])).toMatchObject({ stack: 'x', generatedAt: '2026-10-19T00:00:00Z' });
  });
});

describe('job runner', () => {
  let root;
  const tools = () => ALL;
  // Real git, every other tool faked: the FastAPI template is generated in-process, so the flow runs offline.
  const run = (cmd, args, opts) => (cmd === 'git' ? realRun(cmd, args, opts) : (opts.log(`(fake) ${cmd} ${args.join(' ')}`), Promise.resolve()));
  const spec = slug => validateRequest({ name: 'Py', slug, stack: 'python-fastapi', options: { db: 'sqlite' }, aiTeam: false }, ALL);
  const user = { id: 'u1', email: 'dev@acme.io' };
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('generates, commits on main + development and registers with the freshest token', async () => {
    const calls = [];
    const r = createJobRunner({ root, tools, run, registerProject: async (b, t) => { calls.push([b, t]); return { id: 'proj_1' }; } });
    const j = r.start(spec('py-app'), user, 'tok-1');
    r.touch(j.id, 'tok-2');
    await r.wait(j.id);
    const done = r.get(j.id);
    expect(done.status).toBe('done');
    expect(done.project).toEqual({ id: 'proj_1' });
    expect(calls).toEqual([[{ slug: 'py-app', name: 'Py', repoUrl: path.join(root, 'py-app'), defaultBranch: 'development' }, 'tok-2']]);
    const git = (...a) => spawnSync('git', a, { cwd: path.join(root, 'py-app'), encoding: 'utf8' }).stdout.trim();
    expect(git('branch', '--format=%(refname:short)').split('\n').sort()).toEqual(['development', 'main']);
    expect(git('log', '--format=%an <%ae>|%s')).toBe('dev <dev@acme.io>|chore: scaffold python-fastapi project via Shipyard');
    expect(git('ls-files')).toContain('src/py_app/main.py');
    expect(git('ls-files')).toContain('.env.example');
    expect(git('ls-files')).not.toMatch(/^\.env$/m);
    expect(done.log.some(l => l.includes('(fake) uv run pytest'))).toBe(true);
  });

  it('refuses a slug whose folder exists or is already being created', async () => {
    const r = createJobRunner({ root, tools, run, registerProject: async () => ({}) });
    const j = r.start(spec('dup-app'), user, 't');
    expect(() => r.start(spec('dup-app'), user, 't')).toThrow(/đang được tạo/);
    await r.wait(j.id);
    expect(() => r.start(spec('dup-app'), user, 't')).toThrow(/đã tồn tại/);
  });

  it('stops at the failing stage, keeps the folder until discarded', async () => {
    const failing = (cmd, args, opts) => (cmd === 'uv' && args[0] === 'run'
      ? Promise.reject(Object.assign(new Error('uv run thất bại: mã lỗi 1'), { tail: '1 failed' })) : run(cmd, args, opts));
    const r = createJobRunner({ root, tools, run: failing, registerProject: async () => ({}) });
    const j = r.start(spec('bad-app'), user, 't');
    await r.wait(j.id);
    const f = r.get(j.id);
    expect(f).toMatchObject({ status: 'failed', stage: 'verify', errorTail: '1 failed' });
    expect(f.stages).toEqual({ generate: 'done', overlay: 'done', verify: 'failed', git: 'pending', register: 'pending' });
    expect(fs.existsSync(path.join(root, 'bad-app'))).toBe(true);
    expect(r.discard(j.id)).toEqual({ ok: true, remoteKept: null });
    expect(fs.existsSync(path.join(root, 'bad-app'))).toBe(false);
  });

  it('retries only a failed registration, never deletes a registered project folder', async () => {
    let n = 0;
    const r = createJobRunner({ root, tools, run, registerProject: async () => { if (n++ === 0) throw new Error('Phiên đăng nhập đã hết hạn'); return { id: 'proj_9' }; } });
    const j = r.start(spec('reg-app'), user, 't');
    await r.wait(j.id);
    expect(r.get(j.id)).toMatchObject({ status: 'failed', stage: 'register' });
    const ok = await r.retry(j.id, 'fresh');
    expect(ok).toMatchObject({ status: 'done', project: { id: 'proj_9' }, error: null });
    await expect(r.retry(j.id, 'x')).rejects.toThrow(/đăng ký/);
    expect(() => r.discard(j.id)).toThrow(/đã được tạo/);
  });

  it('cancels a running command', async () => {
    const slow = (cmd, args, opts) => (cmd === 'uv' ? realRun('sleep', ['30'], opts) : run(cmd, args, opts));
    const r = createJobRunner({ root, tools, run: slow, registerProject: async () => ({}) });
    const j = r.start(spec('slow-app'), user, 't');
    await new Promise(res => setTimeout(res, 300));
    r.cancel(j.id);
    await r.wait(j.id);
    expect(r.get(j.id).status).toBe('cancelled');
  });
});

describe('writeFiles', () => {
  it('refuses paths outside the project', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
    expect(() => writeFiles(d, { '../escape.txt': 'x' })).toThrow(/không hợp lệ/);
    fs.rmSync(d, { recursive: true, force: true });
  });
});

describe('routes', () => {
  async function serve(user, runner) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = user; next(); });
    app.use(scaffoldRouter({ authEnabled: true, runner, tools: () => ALL, providers: { list: () => ({}) } }));
    const srv = app.listen(0);
    await new Promise(r => srv.once('listening', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    return { base, close: () => srv.close() };
  }
  const fakeRunner = { root: '/w', owner: id => (id === 'scf_1' ? 'admin1' : undefined), get: id => ({ id }), touch() {},
    start: (spec, user, token) => ({ id: 'scf_new', spec, user: user.id, token }) };

  it('is SYS_ADMIN only', async () => {
    const s = await serve({ id: 'u', role: 'USER' }, fakeRunner);
    expect((await fetch(`${s.base}/api/scaffold/catalog`)).status).toBe(403);
    s.close();
  });
  it('serves the catalog and starts a validated job with the session token', async () => {
    const s = await serve({ id: 'admin1', role: 'SYS_ADMIN' }, fakeRunner);
    const c = await (await fetch(`${s.base}/api/scaffold/catalog`)).json();
    expect(c.stages.map(x => x.id)).toEqual(['generate', 'overlay', 'verify', 'git', 'remote', 'register', 'team']);
    const bad = await fetch(`${s.base}/api/scaffold/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'X' }) });
    expect(bad.status).toBe(400);
    const ok = await fetch(`${s.base}/api/scaffold/jobs`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'sy_at=abc' }, body: JSON.stringify(req()) });
    expect(ok.status).toBe(202);
    expect(await ok.json()).toMatchObject({ id: 'scf_new', user: 'admin1', token: 'abc', spec: { slug: 'shop-api' } });
    s.close();
  });
  it("hides other people's jobs", async () => {
    const s = await serve({ id: 'admin2', role: 'SYS_ADMIN' }, fakeRunner);
    expect((await fetch(`${s.base}/api/scaffold/jobs/scf_1`)).status).toBe(403);
    expect((await fetch(`${s.base}/api/scaffold/jobs/scf_x`)).status).toBe(404);
    s.close();
  });
  it('caches the tool probe', () => {
    let n = 0, t = 0;
    const p = cachedProbe(() => ++n, 1000, () => t);
    p(); p(); t = 2000; p();
    expect(n).toBe(2);
  });
});
