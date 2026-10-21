// Multi-project lanes: a Shipyard-generated project gets a harness profile whose hooks fit its stack.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { laneProfileFiles, writeLaneProfile, GENERATED_MARK } from '../server/services/scaffold/laneprofile.js';
import { laneAddArgs, laneProjects } from '../server/services/actions.js';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'laneprof-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
function project(slug, meta) {
  const dir = path.join(tmp, 'ws', slug);
  fs.mkdirSync(path.join(dir, '.shipyard'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.shipyard', 'project.json'), JSON.stringify({ name: slug, slug, ...meta }));
  spawnSync('git', ['init', '-q', dir]);
  return dir;
}
const bashOk = text => spawnSync('bash', ['-n'], { input: text }).status === 0;

describe('lane profile', () => {
  it('fullstack Spring + React: backend on API_PORT against the lane DB, Vite proxying /api to it', () => {
    const dir = project('ban-hang', { kind: 'fullstack', backend: { dir: 'backend', stack: 'java-spring', options: { db: 'postgresql' } },
      frontend: { dir: 'frontend', stack: 'ts-react-vite', options: { tests: true } } });
    const { slug, files } = laneProfileFiles(dir, { projectId: 'proj_1' });
    expect(slug).toBe('ban-hang');
    expect(files['profile.env']).toContain(GENERATED_MARK);
    expect(files['profile.env']).toContain('BACKEND_DIR="backend"');
    expect(files['profile.env']).toContain('OPENHANDS_EXTRA_PACKAGES="${OPENHANDS_EXTRA_PACKAGES:-nodejs npm}"');
    expect(files['integrations.env']).toContain('PLATFORM_PROJECT_ID="proj_1"');
    expect(files['hooks/boot.sh']).toContain('source "$PROFILE_DIR/profile.env"');   // BACKEND_DIR etc. are not exported by run_hook
    expect(files['hooks/boot.sh']).toContain('export DB_HOST="$PG_HOST"');
    expect(files['hooks/boot.sh']).toMatch(/harness_spawn api .* env PORT="\$API_PORT"/);
    expect(files['hooks/boot.sh']).toContain('BACKEND_PORT="$API_PORT" npx vite --port "$FE_PORT"');
    expect(files['hooks/health.sh']).toContain('/actuator/health');
    expect(files['hooks/ci-gate.sh']).toContain('DB_NAME_OVERRIDE="${TEST_DATABASE_URL##*/}"');
    expect(files['hooks/ci-gate.sh']).toContain('npm run build && npm test');
    for (const [f, t] of Object.entries(files)) if (f.startsWith('hooks/')) expect(bashOk(t), f).toBe(true);
  });
  it('single FastAPI / NestJS / React projects', () => {
    const py = laneProfileFiles(project('kho-py', { stack: 'python-fastapi', options: { db: 'sqlite' } })).files;
    expect(py['hooks/boot.sh']).toContain('uv run uvicorn kho_py.main:app --app-dir src');
    expect(py['hooks/boot.sh']).toContain('SQLITE_PATH="$LANE_DIR/data/app.db"');
    expect(py['profile.env']).toContain('BACKEND_DIR="."');
    const nest = laneProfileFiles(project('kho-nest', { stack: 'ts-nestjs', options: { db: 'none' } })).files;
    expect(nest['hooks/boot.sh']).toContain('npm run start:dev');
    expect(nest['hooks/boot.sh']).not.toContain('DB_HOST');
    const fe = laneProfileFiles(project('kho-fe', { stack: 'ts-react-vite', options: { tests: false } })).files;
    expect(fe['hooks/ci-gate.sh']).toContain('npm run build"');
    expect(fe['hooks/ci-gate.sh']).not.toContain('npm test');
    for (const files of [py, nest, fe]) for (const [f, t] of Object.entries(files)) if (f.startsWith('hooks/')) expect(bashOk(t), f).toBe(true);
  });
  it('refuses databases the shared lane infra cannot run, and non-Shipyard repos', () => {
    expect(() => laneProfileFiles(project('kho-my', { stack: 'ts-nestjs', options: { db: 'mysql' } }))).toThrow(/mysql/);
    fs.mkdirSync(path.join(tmp, 'plain'));
    expect(() => laneProfileFiles(path.join(tmp, 'plain'))).toThrow(/project.json/);
  });
  it('writes profiles/<slug>/ but never over a hand-made profile', () => {
    const dir = project('kho-w', { stack: 'ts-nestjs', options: { db: 'postgresql' } });
    const root = path.join(tmp, 'harness');
    expect(writeLaneProfile(root, dir, { projectId: 'p1' })).toBe('kho-w');
    expect(fs.statSync(path.join(root, 'profiles/kho-w/hooks/boot.sh')).mode & 0o111).toBeTruthy();
    writeLaneProfile(root, dir, { projectId: 'p2' });   // regenerating our own profile is fine
    expect(fs.readFileSync(path.join(root, 'profiles/kho-w/integrations.env'), 'utf8')).toContain('"p2"');
    fs.writeFileSync(path.join(root, 'profiles/kho-w/profile.env'), 'BACKEND_DIR=x\n');
    expect(() => writeLaneProfile(root, dir, {})).toThrow(/không ghi đè/);
  });
  it('lane-add flags and the list of projects lanes can be added for', () => {
    project('kho-a', { stack: 'ts-nestjs', options: { db: 'postgresql' } });
    project('kho-b', { stack: 'ts-nestjs', options: { db: 'mongodb' } });
    const root = path.join(tmp, 'ws');
    const harnessRoot = path.join(tmp, 'harness');
    expect(laneAddArgs({ slug: 'kho-a', projectId: 'proj_a' }, { root, harnessRoot })).toEqual(['--profile', 'kho-a', '--source', path.join(root, 'kho-a')]);
    expect(() => laneAddArgs({ slug: '../etc' }, { root, harnessRoot })).toThrow(/slug/);
    expect(() => laneAddArgs({ slug: 'kho-zz' }, { root, harnessRoot })).toThrow(/Không thấy repo/);
    expect(laneProjects({ root })).toEqual([
      { slug: 'kho-a', name: 'kho-a', stack: 'ts-nestjs', supported: true, reason: '' },
      { slug: 'kho-b', name: 'kho-b', stack: 'ts-nestjs', supported: false, reason: 'database mongodb chưa chạy được trên lane' },
    ]);
  });
});
