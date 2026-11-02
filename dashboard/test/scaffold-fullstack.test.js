// Fullstack projects: backend/ + frontend/ in one repository, generated and wired together.
import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateRequest, publicCatalog, stackById } from '../server/services/scaffold/catalog.js';
import { partsOf, withApiProxy, fullstackRootFiles, fullstackCiFiles, fullstackStarterRules, HEALTH_PATH, isMobileStack, mobilePackageId } from '../server/services/scaffold/fullstack.js';
import { probeTools } from '../server/services/scaffold/util.js';

const tools = { node: { ok: true, major: 22 }, npm: { ok: true, major: 10 }, git: { ok: true }, java: { ok: true }, unzip: { ok: true }, uv: { ok: true } };
const req = (over = {}) => ({ name: 'Kho hàng', slug: 'kho-hang', kind: 'fullstack', stack: 'java-spring', options: { db: 'postgresql' },
  frontend: { stack: 'ts-react-vite', options: { tests: true, docker: true } }, ...over });

describe('fullstack request', () => {
  it('validates both halves and keeps their options apart', () => {
    const s = validateRequest(req(), tools);
    expect(s.kind).toBe('fullstack');
    expect(s.options.db).toBe('postgresql');
    expect(s.frontend).toEqual({ stack: 'ts-react-vite', options: { tests: true, docker: true, db: 'none' } });
  });
  it('refuses a frontend as backend, a missing frontend, and checks every tool', () => {
    expect(() => validateRequest(req({ stack: 'ts-react-vite' }), tools)).toThrow(/phần backend/);
    expect(() => validateRequest(req({ frontend: { stack: 'java-spring' } }), tools)).toThrow(/frontend/);
    expect(() => validateRequest(req({ stack: 'python-fastapi' }), { ...tools, node: { ok: false } })).toThrow(/node/);
  });
  it('a single app keeps the old shape', () => {
    const s = validateRequest({ name: 'A', slug: 'app-a', stack: 'ts-nestjs' }, tools);
    expect(s.kind).toBe('single');
    expect(s.frontend).toBeUndefined();
  });
  it('the catalog says which half each stack can be', () => {
    const roles = Object.fromEntries(publicCatalog(tools).languages.flatMap(l => l.stacks).map(s => [s.id, s.role]));
    expect(roles).toEqual({ 'java-spring': 'backend', 'python-fastapi': 'backend', 'ts-nestjs': 'backend', 'ts-react-vite': 'frontend', 'flutter-android': 'frontend' });
  });
});

describe('fullstack layout and wiring', () => {
  const spec = validateRequest(req(), tools);
  const root = '/ws/kho-hang';
  const [backend, frontend] = partsOf(spec, root, id => stackById(id));
  const ctx = { name: 'Kho hàng', slug: 'kho-hang', description: '' };

  it('backend/ and frontend/ under one root; a single app is the root itself', () => {
    expect([backend.dir, frontend.dir]).toEqual([path.join(root, 'backend'), path.join(root, 'frontend')]);
    expect(partsOf({ stack: 'ts-nestjs', options: {} }, root, id => stackById(id)).map(p => p.dir)).toEqual([root]);
  });
  it('Vite proxies /api to the backend port', () => {
    const cfg = "import { defineConfig } from 'vite'\nexport default defineConfig({\n  plugins: [react()],\n})\n";
    const out = withApiProxy(cfg, 8080);
    expect(out).toContain("'/api': { target: `http://localhost:${process.env.BACKEND_PORT || 8080}`");
    expect(out).toContain("rewrite: p => p.replace(/^\\/api/, '')");
    expect(withApiProxy(out, 8080)).toBe(out);
    expect(() => withApiProxy('export default {}', 8080)).toThrow(/plugins/);
    expect(HEALTH_PATH['java-spring']).toBe('/actuator/health');
  });
  it('root: dev.sh runs db + backend + frontend, compose has all three, env from the backend', () => {
    const f = fullstackRootFiles(ctx, backend, frontend, '2026-10-20T00:00:00Z');
    expect(f['dev.sh']).toContain('docker compose up -d db');
    expect(f['dev.sh']).toContain('(cd backend && ./mvnw spring-boot:run)');
    expect(f['dev.sh']).toContain('export BACKEND_PORT="${BACKEND_PORT:-8080}"');
    expect(f['dev.sh']).toContain('npm run dev');
    expect(f['docker-compose.yml']).toMatch(/  db:\n[\s\S]*  frontend:\n    build: \.\/frontend/);
    expect(f['.env.example']).toContain('DB_NAME=kho_hang');
    expect(JSON.parse(f['.shipyard/project.json'])).toMatchObject({ kind: 'fullstack', backend: { dir: 'backend', stack: 'java-spring' }, frontend: { dir: 'frontend', stack: 'ts-react-vite' } });
    expect(f['README.md']).toContain('./dev.sh');
    expect(f['.gitignore']).toContain('node_modules/');
  });
  it('CI has one job per half with its own working directory', () => {
    const gh = fullstackCiFiles('github', [backend, frontend])['.github/workflows/ci.yml'];
    expect(gh).toMatch(/  backend:\n[\s\S]*working-directory: backend[\s\S]*\.\/mvnw -B verify/);
    expect(gh).toMatch(/  frontend:\n[\s\S]*working-directory: frontend[\s\S]*cache-dependency-path: frontend\/package-lock.json/);
    const gl = fullstackCiFiles('gitlab', [backend, frontend])['.gitlab-ci.yml'];
    expect(gl).toContain('before_script: [cd backend]');
    expect(gl).toContain('before_script: [cd frontend]');
    expect(fullstackCiFiles('local', [backend, frontend])).toEqual({});
  });
  it('AI rules cover both halves and keep API changes in one pull request', () => {
    const r = fullstackStarterRules(ctx, backend, frontend);
    expect(r['rules/project.md']).toContain('`backend/`');
    expect(r['rules/project.md']).toContain('`frontend/`');
    expect(r['rules/project.md']).toContain('cả hai phía trong cùng pull request');
    expect(r['rules/dev.md']).toContain('./dev.sh');
    expect(r['rules/test.md']).toContain('cd frontend && npm test');
  });
});

describe('Flutter (Android) stack', () => {
  const withFlutter = { ...tools, flutter: { ok: true, major: 3, version: '3.27.1' } };
  it('is a frontend that needs flutter on the machine', () => {
    const f = publicCatalog(tools).languages.flatMap(l => l.stacks).find(x => x.id === 'flutter-android');
    expect(f).toMatchObject({ role: 'frontend', available: false });
    expect(f.missing.map(m => m.tool)).toContain('flutter');
    expect(publicCatalog(withFlutter).languages.flatMap(l => l.stacks).find(x => x.id === 'flutter-android').available).toBe(true);
  });
  it('goes with a backend, never alone', () => {
    const s = validateRequest(req({ frontend: { stack: 'flutter-android', options: { org: 'com.congty' } } }), withFlutter);
    expect(s.frontend).toMatchObject({ stack: 'flutter-android', options: { org: 'com.congty', tests: true } });
    expect(() => validateRequest({ name: 'A', slug: 'app-a', stack: 'flutter-android' }, withFlutter)).toThrow(/backend/);
  });
  it('helpers', () => {
    expect(isMobileStack('flutter-android')).toBe(true);
    expect(isMobileStack('ts-react-vite')).toBe(false);
    expect(mobilePackageId('com.congty', 'ban-hang')).toBe('com.congty.ban_hang');
    expect(mobilePackageId('com.congty', '1-app')).toBe('com.congty.app_1_app');
  });
  it('the machine is probed for flutter, adb, emulator and maestro', () => {
    const out = { flutter: 'Flutter 3.27.1 • channel stable', adb: 'Android Debug Bridge version 1.0.41', emulator: 'Android emulator version 35.2.10.0', maestro: '1.39.0' };
    const t = probeTools((cmd, args) => (out[cmd] ? { status: 0, stdout: out[cmd], stderr: '' } : { status: 0, stdout: 'v22.1.0', stderr: '' }));
    expect(t.flutter).toMatchObject({ ok: true, version: '3.27.1' });
    expect(t.adb).toMatchObject({ ok: true, version: '1.0.41' });
    expect(t.emulator).toMatchObject({ ok: true, version: '35.2.10.0' });
    expect(t.maestro).toMatchObject({ ok: true, version: '1.39.0' });
  });
});
