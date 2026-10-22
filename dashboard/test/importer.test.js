// Importing an existing repo: the person's form → checked spec → lane profile built from exactly their
// commands → clone + register + AI Manager; lanes bound to the project use that profile.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { validateImport, importWarnings, importProfileFiles, envValue, parseEnv, createImporter, listBranches,
  readImport, IMPORTED_MARK, runLine } from '../server/services/scaffold/importer.js';
import { laneAddArgs, laneProjects } from '../server/services/actions.js';

const FORM = {
  name: 'Bán hàng cũ', slug: 'ban-hang-cu', source: { provider: 'local', url: '/tmp/x' }, branch: 'main',
  backend: { dir: 'api', tech: 'Laravel 11 / PHP 8.3', install: 'composer install', run: 'php artisan serve --port=$PORT',
    healthPath: '/up', build: '', test: 'php artisan test' },
  frontend: { dir: 'web', tech: 'Vue 3 + Vite', install: 'npm ci', run: 'npx vite --port $PORT', healthPath: '/', build: 'npm run build', test: '' },
  db: 'postgresql', migrate: 'php artisan migrate --force', seed: '',
  env: 'DB_CONNECTION=pgsql\nDB_DATABASE=$DB_NAME\nAPP_KEY="base64:abc$def"\n# comment',
  workflow: null, aiTeam: false,
};

describe('import form', () => {
  it('normalizes what the person typed', () => {
    const s = validateImport(FORM);
    expect(s.backend).toMatchObject({ dir: 'api', run: 'php artisan serve --port=$PORT', healthPath: '/up' });
    expect(s.env).toEqual([{ key: 'DB_CONNECTION', value: 'pgsql' }, { key: 'DB_DATABASE', value: '$DB_NAME' }, { key: 'APP_KEY', value: 'base64:abc$def' }]);
    expect(importWarnings(s)).toEqual([]);
  });

  it('refuses what would be unsafe or unusable', () => {
    const bad = patch => () => validateImport({ ...FORM, ...patch });
    expect(bad({ source: { provider: 'url', url: 'ext::sh -c touch% /tmp/pwn' } })).toThrow(/https/);
    expect(bad({ source: { provider: 'url', url: '-uhttp://x' } })).toThrow();
    expect(bad({ source: { provider: 'github', url: 'git@github.com:a/b.git' } })).toThrow(/https/);
    expect(bad({ source: { provider: 'local', url: 'relative/path' } })).toThrow(/tuyệt đối/);
    expect(bad({ branch: '--upload-pack=x' })).toThrow(/nhánh/);
    expect(bad({ backend: { ...FORM.backend, dir: '../etc' } })).toThrow(/tương đối/);
    expect(bad({ backend: { ...FORM.backend, run: 'a\nrm -rf /' } })).toThrow(/một dòng/);
    expect(bad({ backend: { ...FORM.backend, tech: '' } })).toThrow(/công nghệ/);
    expect(bad({ backend: null, frontend: null })).toThrow(/ít nhất một/);
    expect(() => parseEnv('PATH=/x')).toThrow(/lane quản lý/);
    expect(() => parseEnv('1BAD=x')).toThrow(/không hợp lệ/);
  });

  it('warns about lanes fighting over one port, and no tests', () => {
    const s = validateImport({ ...FORM, backend: { ...FORM.backend, run: 'php artisan serve', test: '' }, frontend: null });
    expect(importWarnings(s).join(' ')).toMatch(/\$PORT.*test/s);
  });

  it('keeps one process per service when it can', () => {
    expect(runLine('php artisan serve')).toBe('exec php artisan serve');
    expect(runLine('PORT=$PORT python3 app.py')).toBe('PORT=$PORT python3 app.py');
    expect(runLine('cd x && npm start')).toBe('cd x && npm start');
    expect(spawnSync('bash', ['-c', runLine('X=1 true')]).status).toBe(0);
  });

  it('only the lane variables expand in values', () => {
    expect(envValue('$DB_NAME-${API_PORT}')).toBe('"$DB_NAME-${API_PORT}"');
    expect(envValue('p$ss"`x`\\')).toBe('"p\\$ss\\"\\`x\\`\\\\"');
    expect(envValue('$(rm -rf /)')).toBe('"\\$(rm -rf /)"');
  });
});

describe('lane profile from the form', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-prof-')); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('hooks are valid bash and run exactly the person\'s commands, on the lane\'s ports and DB', () => {
    const files = importProfileFiles(validateImport(FORM), { projectId: 'proj_1' });
    expect(files['profile.env']).toContain(IMPORTED_MARK);
    expect(files['profile.env']).toContain('INTEGRATION_BRANCH="main"');
    expect(files['integrations.env']).toContain('PLATFORM_PROJECT_ID="proj_1"');
    // Write the profile + a fake lane, with stub commands that record what they were asked to do.
    const prof = path.join(tmp, 'prof'), lane = path.join(tmp, 'lane'), bin = path.join(tmp, 'bin'), rec = path.join(tmp, 'rec');
    for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(prof, rel)), { recursive: true }); fs.writeFileSync(path.join(prof, rel), text); }
    for (const d of ['api', 'web']) fs.mkdirSync(path.join(lane, d), { recursive: true });
    fs.mkdirSync(bin);
    for (const c of ['composer', 'php', 'npm', 'npx', 'curl']) {
      fs.writeFileSync(path.join(bin, c), `#!/usr/bin/env bash\necho "$(basename "$PWD") ${c} $* PORT=\${PORT:-} DB=\${DB_DATABASE:-}/\${DATABASE_URL:-}" >> ${rec}\n`, { mode: 0o755 });
    }
    for (const [rel] of Object.entries(files)) if (rel.endsWith('.sh')) expect(spawnSync('bash', ['-n', path.join(prof, rel)]).status, rel).toBe(0);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PROFILE_DIR: prof, LANE_DIR: lane, API_PORT: '8102', FE_PORT: '3102',
      DB_NAME: 'shop_l2', PG_HOST: 'localhost', PG_PORT: '5432', PG_USER: 'u', PG_PASS: 'p', TEST_DATABASE_URL: 'postgresql://x/shop_l2_test' };
    const hook = (name, extra = {}) => spawnSync('bash', ['-c', `harness_spawn(){ local n="$1" wd="$2"; shift 2; ( cd "$wd" && "$@" ); }; export -f harness_spawn; bash "${prof}/hooks/${name}.sh"`],
      { env: { ...env, ...extra }, encoding: 'utf8' });
    for (const h of ['bootstrap', 'boot', 'health', 'ci-gate', 'migrate', 'seed', 'e2e']) expect(hook(h).status, `${h}: ${hook(h).stderr}`).toBe(0);
    const lines = fs.readFileSync(rec, 'utf8').split('\n');
    expect(lines).toContain('api composer install PORT= DB=shop_l2/postgresql://u:p@localhost:5432/shop_l2');
    expect(lines).toContain('web npm ci PORT= DB=shop_l2/postgresql://u:p@localhost:5432/shop_l2');
    expect(lines).toContain('api php artisan serve --port=8102 PORT=8102 DB=shop_l2/postgresql://u:p@localhost:5432/shop_l2');
    expect(lines).toContain('web npx vite --port 3102 PORT=3102 DB=shop_l2/postgresql://u:p@localhost:5432/shop_l2');
    expect(lines.some(l => l.includes('curl') && l.includes('http://localhost:8102/up'))).toBe(true);
    expect(lines).toContain('api php artisan test PORT= DB=shop_l2_test/postgresql://u:p@localhost:5432/shop_l2_test');   // CI on the test DB
    expect(lines).toContain('web npm run build PORT= DB=shop_l2_test/postgresql://u:p@localhost:5432/shop_l2_test');
    expect(lines).toContain('api php artisan migrate --force PORT= DB=shop_l2/postgresql://u:p@localhost:5432/shop_l2');
    expect(files['hooks/_env.sh']).toContain('export APP_KEY="base64:abc\\$def"');
  });
});

describe('import job', () => {
  let tmp, repo, harness, registered, setupCalls;
  const me = { id: 'u1', email: 'a@x.io', name: 'A' };
  const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@x', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-job-'));
    repo = path.join(tmp, 'origin'); harness = path.join(tmp, 'harness');
    fs.mkdirSync(path.join(repo, 'api'), { recursive: true }); fs.mkdirSync(path.join(repo, 'web'));
    fs.writeFileSync(path.join(repo, 'api', 'composer.json'), '{}'); fs.writeFileSync(path.join(repo, 'web', 'package.json'), '{}');
    git(repo, 'init', '-q', '-b', 'main'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init'); git(repo, 'branch', 'development');
    registered = []; setupCalls = [];
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const make = () => createImporter({ root: path.join(tmp, 'ws'), harnessRoot: harness,
    registerProject: async p => { registered.push(p); return { id: 'proj_7' }; },
    setWorkflow: async (id, w) => registered.push({ id, w }),
    setup: { start: async a => { setupCalls.push(a); return 'run_setup'; } } });

  it('clones, checks, writes the profile, registers, hands the code to the AI Manager; lanes use the profile', async () => {
    const wf = ['ARCH', 'PM', 'BA', 'DESIGN', 'DEV', 'TEST'].map(step => ({ step, mode: ['PM', 'BA', 'DESIGN'].includes(step) ? 'SKIP' : 'AUTO' }));
    const spec = validateImport({ ...FORM, source: { provider: 'local', url: repo }, branch: 'development', workflow: wf, aiTeam: true, note: 'Giữ chuẩn PSR-12' });
    const im = make();
    const j = im.start(spec, me, 'tok');
    await im.wait(j.id);
    const done = im.get(j.id);
    expect(done.status, done.error).toBe('done');
    expect(done.stageList.map(s => s.id)).toEqual(['clone', 'check', 'profile', 'register', 'team']);
    const dir = path.join(tmp, 'ws', 'ban-hang-cu');
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()).toBe('development');
    expect(done.log.join('\n')).toContain('thấy composer.json');
    expect(registered[0]).toEqual({ slug: 'ban-hang-cu', name: 'Bán hàng cũ', repoUrl: repo, defaultBranch: 'development' });
    expect(registered[1].w.find(w => w.step === 'ARCH').mode).toBe('AUTO');
    expect(setupCalls[0]).toMatchObject({ projectId: 'proj_7', adopt: true, branch: 'development', provider: 'host', dir });
    expect(setupCalls[0].note).toContain('Giữ chuẩn PSR-12');
    expect(setupCalls[0].note).toContain('php artisan test');
    expect(fs.existsSync(path.join(dir, '.shipyard', 'team.json'))).toBe(true);
    expect(fs.statSync(path.join(harness, 'config', 'imports', 'ban-hang-cu.json')).mode & 0o777).toBe(0o600);
    expect(readImport(harness, 'ban-hang-cu').backend.tech).toBe('Laravel 11 / PHP 8.3');
    expect(fs.readFileSync(path.join(harness, 'profiles', 'ban-hang-cu', 'integrations.env'), 'utf8')).toContain('proj_7');

    // Adding a lane for it: bound to the imported profile and the clone.
    const args = laneAddArgs({ slug: 'ban-hang-cu', projectId: 'proj_7', name: 'Bán hàng cũ' }, { root: path.join(tmp, 'ws'), harnessRoot: harness });
    expect(args.slice(0, 4)).toEqual(['--profile', 'ban-hang-cu', '--source', dir]);
    expect(laneProjects({ root: path.join(tmp, 'ws'), harnessRoot: harness })).toEqual([
      { slug: 'ban-hang-cu', name: 'Bán hàng cũ', imported: true, supported: true, reason: '', stack: 'Laravel 11 / PHP 8.3 + Vue 3 + Vite' }]);

    // The same slug cannot be imported twice.
    expect(() => make().start(spec, me, 'tok')).toThrow(/tồn tại|Đã nhập/);
  });

  it('a missing app folder fails at the check; the failed import can be discarded', async () => {
    const spec = validateImport({ ...FORM, source: { provider: 'local', url: repo }, backend: { ...FORM.backend, dir: 'server' } });
    const im = make();
    const j = im.start(spec, me, 'tok');
    await im.wait(j.id);
    const f = im.get(j.id);
    expect(f).toMatchObject({ status: 'failed', stage: 'check', retryable: true });
    expect(f.error).toContain('không có thư mục "server"');
    expect(registered).toEqual([]);
    expect(im.discard(j.id)).toEqual({ ok: true });
    expect(fs.existsSync(path.join(tmp, 'ws', 'ban-hang-cu'))).toBe(false);
  });

  it('lists the branches of a repo before cloning', async () => {
    const r = await listBranches({ provider: 'local', url: repo });
    expect(r.branches.sort()).toEqual(['development', 'main']);
    expect(r.defaultBranch).toBe('main');
  });
});
