// Fullstack projects: backend/ + frontend/ in one repository, generated and wired together.
import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateRequest, publicCatalog, stackById } from '../server/services/scaffold/catalog.js';
import { partsOf, withApiProxy, fullstackRootFiles, fullstackCiFiles, fullstackStarterRules, HEALTH_PATH, isMobileStack, mobilePackageId } from '../server/services/scaffold/fullstack.js';
import { probeTools } from '../server/services/scaffold/util.js';
import { frontendWiring, pubspecWithHttp, debugManifestCleartext } from '../server/services/scaffold/fullstack.js';
import fs from 'fs';
import os from 'os';

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

describe('backend + Flutter app in one repo', () => {
  const spec = { kind: 'fullstack', stack: 'java-spring', options: { db: 'postgresql', docker: true, build: 'maven', javaVersion: '21', groupId: 'com.acme', auth: 'none' },
    frontend: { stack: 'flutter-android', options: { tests: true, org: 'com.example' } } };
  const ctx = { name: 'Bán hàng', slug: 'ban-hang', description: 'POS' };
  const parts = partsOf(spec, '/x/ban-hang', id => stackById(id));
  const [b, f] = parts;

  it('puts the app in mobile/, next to backend/', () => {
    expect(parts.map(p => [p.role, p.sub])).toEqual([['backend', 'backend'], ['frontend', 'mobile']]);
    expect(f.dir).toBe(path.join('/x/ban-hang', 'mobile'));
  });

  it('wires the app to the backend through API_URL (the emulator reaches the host at 10.0.2.2)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-'));
    fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: ban_hang\ndependencies:\n  flutter:\n    sdk: flutter\n\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n');
    fs.mkdirSync(path.join(dir, 'android/app/src/debug'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'android/app/src/debug/AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-permission android:name="android.permission.INTERNET"/>\n</manifest>\n');
    const w = frontendWiring(ctx, b, { ...f, dir });
    expect(w['lib/api.dart']).toContain("String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080')");
    expect(w['lib/backend_status.dart']).toContain('/actuator/health');
    expect(w['lib/main.dart']).toContain('BackendStatus');
    expect(w['test/widget_test.dart']).toContain('testWidgets');
    expect(w['test/widget_test.dart']).toContain('package:ban_hang/backend_status.dart');
    expect(w['pubspec.yaml']).toMatch(/dependencies:\n  http: \^1\.2\.2\n  flutter:/);
    expect(w['android/app/src/debug/AndroidManifest.xml']).toContain('android:usesCleartextTraffic="true"');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('pubspec and manifest edits are idempotent', () => {
    const once = pubspecWithHttp('dependencies:\n  flutter:\n    sdk: flutter\n');
    expect(pubspecWithHttp(once)).toBe(once);
    const m = debugManifestCleartext('<manifest>\n</manifest>\n');
    expect(debugManifestCleartext(m)).toBe(m);
  });

  it('root: project.json knows the app, dev.sh runs the backend only, no frontend container, no remote Flutter CI', () => {
    const root = fullstackRootFiles(ctx, b, f, '2026-01-01T00:00:00.000Z');
    const meta = JSON.parse(root['.shipyard/project.json']);
    expect(meta.frontend).toMatchObject({ dir: 'mobile', stack: 'flutter-android' });
    expect(meta.mobile).toEqual({ packageId: 'com.example.ban_hang', apiDefine: 'API_URL' });
    expect(root['dev.sh']).not.toContain('cd frontend');
    expect(root['dev.sh']).toContain('flutter run --dart-define=API_URL=http://10.0.2.2:');
    expect(root['docker-compose.yml']).not.toContain('frontend:');
    expect(root['README.md']).toContain('`mobile/`');
    expect(fullstackCiFiles('gitlab', parts)['.gitlab-ci.yml']).not.toContain('frontend:');
    expect(fullstackCiFiles('github', parts)['.github/workflows/ci.yml']).not.toContain('flutter');
    expect(fullstackStarterRules(ctx, b, f)['rules/project.md']).toContain('lib/api.dart');
  });

  it('a web project comes out exactly as before', () => {
    const want = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fullstack-web.json'), 'utf8'));
    const web = { ...spec, frontend: { stack: 'ts-react-vite', options: { tests: true, docker: true } } };
    const wp = partsOf(web, '/x/kho-hang', id => stackById(id));
    const c = { name: 'Kho hàng', slug: 'kho-hang', description: 'Quản lý kho' };
    expect(JSON.parse(JSON.stringify({ parts: wp.map(p => [p.role, p.sub, p.dir]), root: fullstackRootFiles(c, wp[0], wp[1], '2026-01-01T00:00:00.000Z'),
      github: fullstackCiFiles('github', wp), gitlab: fullstackCiFiles('gitlab', wp), rules: fullstackStarterRules(c, wp[0], wp[1]) }))).toEqual(want);
  });
});

describe('Flutter — review fixes', () => {
  it('every stack can be verified, Flutter by pub get + analyze + test (C1)', async () => {
    const { STACKS } = await import('../server/services/scaffold/catalog.js');
    for (const st of STACKS) expect(typeof st.verify, st.id).toBe('function');
    const calls = [];
    const flutter = STACKS.find(x => x.id === 'flutter-android');
    await flutter.verify({ dir: '/x/mobile', options: { tests: true }, run: async (cmd, args, o) => calls.push([cmd, ...args, o.cwd]) });
    expect(calls).toEqual([['flutter', 'pub', 'get', '/x/mobile'], ['flutter', 'analyze', '/x/mobile'], ['flutter', 'test', '/x/mobile']]);
    calls.length = 0;
    await flutter.verify({ dir: '/x/mobile', options: { tests: false }, run: async (cmd, args, o) => calls.push([cmd, ...args, o.cwd]) });
    expect(calls.map(c => c[1])).toEqual(['pub', 'analyze']);
  });
  it('the generated main.dart passes flutter_lints and survives any project name (I1)', () => {
    const spec = { kind: 'fullstack', stack: 'java-spring', options: { db: 'postgresql', build: 'maven', javaVersion: '21', groupId: 'com.acme', auth: 'none' },
      frontend: { stack: 'flutter-android', options: { tests: true, org: 'com.example' } } };
    const [b, f] = partsOf(spec, '/x/p', id => stackById(id));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-'));
    fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'dependencies:\n');
    const main = frontendWiring({ name: "Giá $5 'rẻ' \\ ok", slug: 'gia-re' }, b, { ...f, dir })['lib/main.dart'];
    expect(main).toContain("appBar: AppBar(title: const Text('Giá \\$5 \\'rẻ\\' \\\\ ok'))");
    expect(main).toContain("title: 'Giá \\$5 \\'rẻ\\' \\\\ ok'");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

