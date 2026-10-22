import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HARNESS_ROOT } from '../config.js';
import { run as runCmd, writeFiles, SLUG_RE, childEnv } from './util.js';
import { validateWorkflow } from './catalog.js';
import { adoptFiles } from './team.js';
import { gitAuthEnv } from './setup.js';
import { GENERATED_MARK } from './laneprofile.js';

// Bring an existing Git repo into Shipyard. Every repo is built differently, so the PERSON fills in how
// this one is installed, run, checked and tested (nothing is guessed); from that Shipyard clones it,
// writes the lane profile (profiles/<slug>/: hooks built from exactly those commands), registers the
// project with its workflow, and — if asked — has the AI Manager write the AI team's rules from the code.
// The form is kept in config/imports/<slug>.json so the profile can be regenerated when a lane is added.

export const IMPORT_STAGES = [
  { id: 'clone', label: 'Clone repo' },
  { id: 'check', label: 'Kiểm tra thư mục ứng dụng' },
  { id: 'profile', label: 'Sinh script cho lane' },
  { id: 'register', label: 'Đăng ký dự án' },
  { id: 'team', label: 'Giao AI Manager soạn luật' },
];
export const IMPORTED_MARK = 'SHIPYARD_IMPORTED=1';
export const DB_KINDS = ['postgresql', 'sqlite', 'none', 'external'];
const SOURCES = ['url', 'github', 'gitlab', 'local'];
// Variables a lane provides that the person may reference in values ($API_PORT, ${DB_NAME}…).
export const LANE_VARS = ['API_PORT', 'FE_PORT', 'API_URL', 'FE_URL', 'DB_NAME', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD',
  'PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASS', 'DATABASE_URL', 'SQLITE_PATH', 'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'LANE_DIR', 'LANE', 'UPLOAD_DIR'];
const DENY_ENV = ['PATH', 'HOME', 'SHELL', 'BASH_ENV', 'ENV', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'PROFILE', 'PROFILE_DIR', 'HARNESS_ROOT',
  'LANE_DIR', 'LANE', 'RUN_DIR', 'LOG_DIR', 'API_PORT', 'FE_PORT', 'IFS'];

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const oneLine = (v, max, what) => {
  const s = String(v ?? '').trim();
  if (/[\r\n\0]/.test(s)) throw bad(`${what}: chỉ một dòng`);
  if (s.length > max) throw bad(`${what}: tối đa ${max} ký tự`);
  return s;
};
const relDir = (v, what) => {
  const s = String(v ?? '').trim().replace(/\/+$/, '') || '.';
  if (s !== '.' && (!/^[A-Za-z0-9._/-]{1,120}$/.test(s) || s.startsWith('/') || s.startsWith('-') || s.split('/').includes('..'))) {
    throw bad(`${what}: đường dẫn tương đối trong repo, vd backend hoặc .`);
  }
  return s;
};

/** Where to clone from: an https/ssh URL, or a folder on this machine. Never a git transport trick. */
export function validateSource(src = {}) {
  const provider = SOURCES.includes(src.provider) ? src.provider : 'url';
  const url = oneLine(src.url, 500, 'Repo');
  if (!url) throw bad('Nhập URL repo hoặc đường dẫn thư mục');
  if (provider === 'local') {
    if (!path.isAbsolute(url) || url.includes('..')) throw bad('Thư mục trên máy: đường dẫn tuyệt đối, vd /home/ban/du-an');
  } else if (!/^(https:\/\/[^\s'"`]+|ssh:\/\/[^\s'"`]+|git@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+)$/.test(url)) {
    throw bad('URL repo dạng https://…, ssh://… hoặc git@host:nhom/repo.git');
  }
  if ((provider === 'github' || provider === 'gitlab') && !url.startsWith('https://')) throw bad('Dùng token GitHub/GitLab thì URL phải là https://');
  return { provider, url };
}

function validateApp(a, role) {
  if (!a || a.enabled === false) return null;
  const label = role === 'backend' ? 'Backend' : 'Frontend';
  const app = {
    dir: relDir(a.dir, `${label} — thư mục`),
    tech: oneLine(a.tech, 120, `${label} — công nghệ`),
    install: oneLine(a.install, 500, `${label} — lệnh cài`),
    run: oneLine(a.run, 500, `${label} — lệnh chạy`),
    build: oneLine(a.build, 500, `${label} — lệnh build`),
    test: oneLine(a.test, 500, `${label} — lệnh test`),
    healthPath: oneLine(a.healthPath || '/', 200, `${label} — đường dẫn kiểm tra`),
  };
  if (!app.tech) throw bad(`${label}: ghi công nghệ (vd Laravel 11 / PHP 8.3)`);
  if (!app.run) throw bad(`${label}: nhập lệnh chạy ứng dụng`);
  if (!/^\/[A-Za-z0-9._~/?=&%:-]*$/.test(app.healthPath)) throw bad(`${label}: đường dẫn kiểm tra bắt đầu bằng /, vd /health`);
  return app;
}

/** KEY=VALUE lines (or [{key, value}]) the app needs; values may use the lane's $VARIABLES. */
export function parseEnv(input) {
  const rows = Array.isArray(input) ? input : String(input || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); if (i < 1) throw bad(`Biến môi trường "${l.slice(0, 40)}": dạng TEN=gia_tri`); return { key: l.slice(0, i).trim(), value: l.slice(i + 1) }; });
  if (rows.length > 40) throw bad('Tối đa 40 biến môi trường');
  return rows.map(({ key, value }) => {
    const k = String(key || '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) throw bad(`Tên biến không hợp lệ: ${k}`);
    if (DENY_ENV.includes(k)) throw bad(`Biến ${k} do lane quản lý, không đặt ở đây`);
    let v = oneLine(value, 500, `Giá trị ${k}`);
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    return { key: k, value: v };
  });
}

/** The import form, checked and normalized (throws a Vietnamese message on the first problem). */
export function validateImport(b = {}) {
  const name = oneLine(b.name, 100, 'Tên dự án');
  if (!name) throw bad('Nhập tên dự án');
  const slug = String(b.slug || '').trim();
  if (!SLUG_RE.test(slug)) throw bad('Slug: 3–40 ký tự chữ thường, số, gạch ngang');
  const source = validateSource(b.source);
  const branch = String(b.branch || '').trim();
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.startsWith('-') || branch.includes('..')) throw bad('Chọn nhánh tích hợp (vd development hoặc main)');
  const backend = validateApp(b.backend, 'backend');
  const frontend = validateApp(b.frontend, 'frontend');
  if (!backend && !frontend) throw bad('Khai báo ít nhất một ứng dụng (backend hoặc frontend)');
  const db = DB_KINDS.includes(b.db) ? b.db : 'none';
  const image = oneLine(b.image, 200, 'Image OpenHands');
  if (image && !/^[a-z0-9][a-z0-9._/:@-]*$/.test(image)) throw bad('Image OpenHands dạng tên:tag, vd php:8.3-cli');
  return {
    name, slug, source, branch, backend, frontend, db,
    migrate: oneLine(b.migrate, 500, 'Lệnh migrate'), seed: oneLine(b.seed, 500, 'Lệnh seed'),
    env: parseEnv(b.env), image, testPaths: oneLine(b.testPaths, 300, 'File test'),
    workflow: b.workflow == null ? null : validateWorkflow(b.workflow),
    aiTeam: b.aiTeam !== false, note: oneLine(String(b.note || '').replace(/\s*\n\s*/g, ' '), 2000, 'Lưu ý cho AI Manager'),
  };
}

/** Things that will likely not work on a lane, for the person to fix before importing. */
export function importWarnings(spec) {
  const out = [];
  const usesPort = s => /\$\{?PORT\b|\$\{?(API|FE)_PORT\b/.test(s);
  if (spec.backend && !usesPort(spec.backend.run)) out.push('Lệnh chạy backend không dùng $PORT — các lane sẽ tranh cùng một cổng.');
  if (spec.frontend && !usesPort(spec.frontend.run)) out.push('Lệnh chạy frontend không dùng $PORT — các lane sẽ tranh cùng một cổng.');
  if (spec.backend && !spec.backend.test && !(spec.frontend?.test)) out.push('Chưa có lệnh test — lane không có gì để kiểm tra trước khi mở PR.');
  if (spec.db === 'postgresql' && !spec.env.length) out.push('Ứng dụng đọc kết nối DB qua biến nào? Thêm ở "Biến môi trường" (vd DB_HOST=$DB_HOST).');
  return out;
}

// ── shell text built from the form (the person's commands run as written; everything else quoted) ──

export const sq = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
/** A double-quoted value where only the lane's own $VARIABLES expand. */
export function envValue(v) {
  let out = '';
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '$') {
      const m = v.slice(i).match(/^\$(\{([A-Z_]+)\}|([A-Z_][A-Z0-9_]*))/);
      const name = m && (m[2] || m[3]);
      if (name && LANE_VARS.includes(name)) { out += m[0]; i += m[0].length - 1; continue; }
      out += '\\$';
    } else if (c === '"' || c === '\\' || c === '`') out += `\\${c}`;
    else out += c;
  }
  return `"${out}"`;
}
// `exec` keeps one process per service when the command is a single program (lane-down kills the tree anyway).
// (Not with shell syntax, nor a leading VAR=value: `exec VAR=x cmd` would try to run "VAR=x".)
export const runLine = cmd => (/[;&|<>()]/.test(cmd) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(cmd) ? cmd : `exec ${cmd}`);
const at = dir => `"$LANE_DIR/${dir === '.' ? '' : dir}"`;

const HEAD = (title) => `#!/usr/bin/env bash\n# ${title} — generated by Shipyard from the import form (config/imports). Edit freely; remove\n# the SHIPYARD_GENERATED line in profile.env to stop Shipyard regenerating these.\nset -euo pipefail\n# shellcheck disable=SC1091\nsource "$PROFILE_DIR/profile.env"\n# shellcheck disable=SC1091\nsource "$PROFILE_DIR/hooks/_env.sh"\n`;

function envFile(spec) {
  const lines = ['#!/usr/bin/env bash', '# Environment every hook of this project gets (lane database, ports, the form\'s variables).',
    'export DB_NAME="${DB_NAME_OVERRIDE:-$DB_NAME}"',
    'export API_URL="http://localhost:$API_PORT"'];
  if (spec.db === 'postgresql') {
    lines.push('export DB_HOST="$PG_HOST" DB_PORT="$PG_PORT" DB_USER="$PG_USER" DB_PASSWORD="$PG_PASS"');
    lines.push('export DATABASE_URL="postgresql://$PG_USER:$PG_PASS@$PG_HOST:$PG_PORT/$DB_NAME"');
  }
  if (spec.db === 'sqlite') lines.push('mkdir -p "$LANE_DIR/data"', 'export SQLITE_PATH="$LANE_DIR/data/app.db" DATABASE_URL="sqlite:///$LANE_DIR/data/app.db"');
  for (const { key, value } of spec.env) lines.push(`export ${key}=${envValue(value)}`);
  return `${lines.join('\n')}\n`;
}

/** profile.env + integrations.env + hooks for an imported project, as { relativePath: content }. */
export function importProfileFiles(spec, { projectId = '' } = {}) {
  const { backend: be, frontend: fe } = spec;
  const apps = [be && ['backend', be], fe && ['frontend', fe]].filter(Boolean);
  const each = fn => apps.map(([role, a]) => fn(role, a)).filter(Boolean).join('');
  const inDir = (dir, cmd) => `( cd ${at(dir)} && bash -c ${sq(cmd)} )\n`;
  const workDir = be ? be.dir : fe.dir;
  const techLine = apps.map(([role, a]) => `${role} ${a.dir}: ${a.tech}`).join(' + ');
  const health = (url, p) => `curl -fsS --retry 90 --retry-delay 2 --retry-connrefused --max-time 5 -o /dev/null "${url}"${sq(p)}\n`;
  return {
    'profile.env': [
      `# Harness profile for ${spec.name} (${techLine}), from the import form in Shipyard.`,
      GENERATED_MARK,
      IMPORTED_MARK,
      `BACKEND_DIR="${be?.dir || '.'}"`,
      `FRONTEND_DIR="${fe?.dir || '.'}"`,
      'API_PATH=""',
      'DB_URL_SCHEME="postgresql"',
      'DB_SERVICE="postgres"',
      `BASE_BRANCH="${spec.branch}"`,
      `INTEGRATION_BRANCH="${spec.branch}"`,
      'BRANCH_PREFIX="feat/"',
      `TEST_PATHS=${sq(spec.testPaths)}`,
      'GENERATED_MERGE_PATHS=""',
      'MIGRATIONS_DIR=""',
      'QC_BOOT_ENV=""',
      `OPENHANDS_BASE_IMAGE="\${OPENHANDS_BASE_IMAGE:-${spec.image || 'debian:bookworm-slim'}}"`,
      'OPENHANDS_EXTRA_PACKAGES="${OPENHANDS_EXTRA_PACKAGES:-}"',
      'IMPL_AGENTS="1"',
      '',
    ].join('\n'),
    'integrations.env': [
      `# Integrations for ${spec.slug} (imported into Shipyard). The platform project makes its lanes run the role pipeline.`,
      `PLATFORM_PROJECT_ID="${projectId}"`,
      'TRACKER_ENABLED="0"',
      'DEV_QC_ENABLED="0"',
      'CI_WAIT_ENABLED="0"',
      '',
    ].join('\n'),
    'hooks/_env.sh': envFile(spec),
    'hooks/bootstrap.sh': HEAD('bootstrap: install dependencies') + (each((_, a) => a.install && inDir(a.dir, a.install)) || 'echo "bootstrap: no install command"\n'),
    'hooks/boot.sh': HEAD('boot: start this lane\'s apps in the background, then return') + each((role, a) => (role === 'backend'
      ? `harness_spawn api ${at(a.dir)} env PORT="$API_PORT" bash -c ${sq(runLine(a.run))}\n`
      : `harness_spawn fe ${at(a.dir)} env PORT="$FE_PORT" BACKEND_PORT="$API_PORT" BACKEND_URL="$API_URL" bash -c ${sq(runLine(a.run))}\n`)),
    'hooks/health.sh': HEAD('health: exit 0 when the lane\'s apps answer') + each((role, a) => health(role === 'backend' ? 'http://localhost:$API_PORT' : 'http://localhost:$FE_PORT', a.healthPath)),
    'hooks/ci-gate.sh': `${HEAD('ci-gate: build + tests before a push (TEST_DATABASE_URL = an isolated DB)')
      .replace('source "$PROFILE_DIR/hooks/_env.sh"', 'DB_NAME_OVERRIDE="${TEST_DATABASE_URL##*/}"\n# shellcheck disable=SC1091\nsource "$PROFILE_DIR/hooks/_env.sh"')}${
      each((_, a) => [a.build && inDir(a.dir, a.build), a.test && inDir(a.dir, a.test)].filter(Boolean).join('')) || 'echo "ci-gate: no build or test command in the import form"\n'}`,
    'hooks/migrate.sh': HEAD('migrate') + (spec.migrate ? inDir(workDir, spec.migrate) : 'echo "migrate: no migration command (the app manages its schema)"\n'),
    'hooks/seed.sh': HEAD('seed') + (spec.seed ? inDir(workDir, spec.seed) : 'echo "seed: no seed command"\n'),
    'hooks/e2e.sh': HEAD('e2e') + 'echo "e2e: no end-to-end suite configured — skipped"\n',
    'hooks/regen.sh': HEAD('regen') + 'exit 0\n',
  };
}

export const importPath = (harnessRoot, slug) => path.join(harnessRoot, 'config', 'imports', `${slug}.json`);
export function readImport(harnessRoot, slug) {
  try { return JSON.parse(fs.readFileSync(importPath(harnessRoot, slug), 'utf8')); } catch { return null; }
}
function saveImport(harnessRoot, spec) {
  const f = importPath(harnessRoot, spec.slug);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  // Values may hold credentials the app needs: owner-only, never shown back in full.
  fs.writeFileSync(f, JSON.stringify(spec, null, 2), { mode: 0o600 });
  fs.chmodSync(f, 0o600);
}

/** Writes profiles/<slug>/ for an imported project (only over a profile Shipyard generated). */
export function writeImportProfile(harnessRoot, spec, opts = {}) {
  const dir = path.join(harnessRoot, 'profiles', spec.slug);
  let existing = '';
  try { existing = fs.readFileSync(path.join(dir, 'profile.env'), 'utf8'); } catch { /* new */ }
  if (existing && !existing.includes(GENERATED_MARK)) throw bad(`profiles/${spec.slug} đã có và do người viết — không ghi đè`, 409);
  for (const [rel, text] of Object.entries(importProfileFiles(spec, opts))) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    if (rel.startsWith('hooks/')) fs.chmodSync(f, 0o755);
  }
  return spec.slug;
}

/** What the AI Manager is told about the repo, from the form. */
function teamNote(spec) {
  const app = (role, a) => a && `${role} (${a.dir}): ${a.tech}; cài: ${a.install || '—'}; chạy: ${a.run}; build: ${a.build || '—'}; test: ${a.test || '—'}`;
  return [spec.note, 'Thông tin dự án do người nhập:', app('Backend', spec.backend), app('Frontend', spec.frontend),
    `Database: ${spec.db}`, spec.migrate && `Migrate: ${spec.migrate}`].filter(Boolean).join(' · ').slice(0, 2000);
}

/** Branches of a repo before cloning (git ls-remote), so the person picks the integration branch. */
export async function listBranches(src, { run = runCmd, providers } = {}) {
  const { provider, url } = validateSource(src);
  let out = '';
  const env = childEnv(provider === 'github' || provider === 'gitlab' ? gitAuthEnv(providers, provider) : { GIT_TERMINAL_PROMPT: '0' });
  await run('git', ['ls-remote', '--symref', '--', url, 'HEAD', 'refs/heads/*'], { env, timeoutMs: 30_000, log: l => { out += `${l}\n`; } })
    .catch(e => { throw bad(`Không đọc được repo: ${(e.tail || e.message).split('\n').pop()}`, 502); });
  const branches = [...out.matchAll(/^[0-9a-f]{40}\s+refs\/heads\/(\S+)$/gm)].map(m => m[1]);
  const head = out.match(/^ref: refs\/heads\/(\S+)\s+HEAD$/m)?.[1] || null;
  return { branches: branches.slice(0, 200), defaultBranch: head };
}

/** In-memory import jobs, one per slug at a time (the clone lands in <root>/<slug>). */
export function createImporter({ root, harnessRoot = HARNESS_ROOT, run = runCmd, providers, registerProject, setWorkflow = null,
  setup = null, now = () => new Date() } = {}) {
  const jobs = new Map();
  const locks = new Set();
  const pub = j => j && ({
    id: j.id, slug: j.spec.slug, name: j.spec.name, status: j.status, stage: j.stage, stageList: j.stageList, stages: j.stages,
    error: j.error, errorTail: j.errorTail, dir: j.dir, project: j.project || null, setupRunId: j.setupRunId || null,
    warnings: importWarnings(j.spec), retryable: j.status === 'failed' && j.stage !== 'clone',
    startedAt: j.startedAt, finishedAt: j.finishedAt, log: j.log.slice(-400),
  });

  function steps(j, user) {
    const { spec } = j;
    const log = j.log.push.bind(j.log);
    const authed = spec.source.provider === 'github' || spec.source.provider === 'gitlab';
    return {
      async clone() {
        const env = childEnv(authed ? gitAuthEnv(providers, spec.source.provider) : { GIT_TERMINAL_PROMPT: '0' });
        j.created = true;
        await run('git', ['clone', '-q', '--no-tags', '-b', spec.branch, '--', spec.source.url, j.dir],
          { env, log, signal: j.abort.signal, timeoutMs: 15 * 60_000 });
      },
      check() {
        for (const [label, a] of [['Backend', spec.backend], ['Frontend', spec.frontend]]) {
          if (!a) continue;
          const d = path.join(j.dir, a.dir);
          if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw bad(`${label}: không có thư mục "${a.dir}" trong nhánh ${spec.branch}`);
          const seen = fs.readdirSync(d).filter(f => /^(package\.json|pom\.xml|build\.gradle(\.kts)?|composer\.json|pyproject\.toml|requirements\.txt|go\.mod|Gemfile|Cargo\.toml|.*\.csproj|.*\.sln)$/.test(f));
          log(`${label} ${a.dir}: ${a.tech}${seen.length ? ` (thấy ${seen.join(', ')})` : ''}`);
        }
        for (const w of importWarnings(spec)) log(`⚠ ${w}`);
      },
      profile() {
        saveImport(harnessRoot, spec);
        writeImportProfile(harnessRoot, spec, { projectId: j.project?.id || '' });
        log(`Đã sinh profiles/${spec.slug}/ (cài, chạy, kiểm tra, CI) từ thông tin bạn nhập`);
      },
      async register() {
        if (!j.project) {
          j.project = await registerProject({ slug: spec.slug, name: spec.name, repoUrl: spec.source.url, defaultBranch: spec.branch }, j.token);
          log(`Đã tạo dự án ${j.project?.id || ''}`);
          writeImportProfile(harnessRoot, spec, { projectId: j.project?.id || '' });
        }
        if (spec.workflow && setWorkflow && !j.workflowSet) {
          await setWorkflow(j.project.id, spec.workflow, j.token);
          j.workflowSet = true;
          log(`Quy trình: ${spec.workflow.filter(w => w.mode !== 'SKIP').map(w => w.step).join(' → ')}`);
        }
      },
      async team() {
        if (!j.setupRunId) {
          if (!fs.existsSync(path.join(j.dir, '.shipyard', 'team.json'))) writeFiles(j.dir, adoptFiles({ name: spec.name, branch: spec.branch }));
          j.setupRunId = await setup.start({ projectId: j.project.id, slug: spec.slug, name: spec.name,
            stack: [spec.backend && `backend ${spec.backend.dir}: ${spec.backend.tech}`, spec.frontend && `frontend ${spec.frontend.dir}: ${spec.frontend.tech}`].filter(Boolean).join(' + '),
            dir: j.dir, provider: authed ? spec.source.provider : 'host', branch: spec.branch, createdBy: user.id,
            adopt: true, note: teamNote(spec), title: `Thiết lập đội AI — ${spec.name}` });
        }
        log(`AI Manager đang đọc code và soạn luật (run ${j.setupRunId}); xong sẽ có trong "Chờ duyệt".`);
      },
    };
  }

  async function execute(j, user, from = 0) {
    const fns = steps(j, user);
    try {
      for (const s of j.stageList.slice(from)) {
        if (j.abort.signal.aborted) throw new Error('đã huỷ');
        j.stage = s.id; j.stages[s.id] = 'running'; j.log.push(`── ${s.label}`);
        await fns[s.id]();
        j.stages[s.id] = 'done';
      }
      Object.assign(j, { status: 'done', stage: null, error: null, errorTail: '' });
    } catch (e) {
      if (j.stage) j.stages[j.stage] = 'failed';
      j.status = j.abort.signal.aborted ? 'cancelled' : 'failed';
      j.error = e.message; j.errorTail = e.tail || '';
      j.log.push(`✗ ${e.message}`);
    } finally {
      j.finishedAt = now().toISOString();
      locks.delete(j.spec.slug);
    }
  }

  return {
    root,
    start(spec, user, token) {
      const authed = spec.source.provider === 'github' || spec.source.provider === 'gitlab';
      if (authed && !providers?.configured(spec.source.provider)) throw bad(`Chưa kết nối ${spec.source.provider === 'github' ? 'GitHub' : 'GitLab'} (Dự án → Tạo từ khung → Kho Git)`);
      if (spec.aiTeam && !setup) throw bad('Chưa bật được AI Manager', 503);
      if (locks.has(spec.slug)) throw bad('Dự án này đang được nhập', 409);
      const dir = path.join(root, spec.slug);
      if (fs.existsSync(dir)) throw bad(`Thư mục ${dir} đã tồn tại`, 409);
      const existing = readImport(harnessRoot, spec.slug);
      if (existing) throw bad(`Đã nhập một dự án với slug ${spec.slug}`, 409);
      fs.mkdirSync(root, { recursive: true });
      locks.add(spec.slug);
      const stageList = IMPORT_STAGES.filter(s => s.id !== 'team' || spec.aiTeam);
      const j = { id: `imp_${crypto.randomBytes(6).toString('hex')}`, spec, dir, status: 'running', stage: null, stageList,
        stages: Object.fromEntries(stageList.map(s => [s.id, 'pending'])), log: [], abort: new AbortController(),
        startedAt: now().toISOString(), finishedAt: null, userId: user.id, user, token };
      jobs.set(j.id, j);
      j.done = execute(j, user);
      return pub(j);
    },
    get: id => pub(jobs.get(id)),
    owner: id => jobs.get(id)?.userId,
    touch(id, token) { const j = jobs.get(id); if (j && token) j.token = token; },
    wait: id => jobs.get(id)?.done,
    /** Resume a failed import after its clone (folder missing, network, session expired…). */
    async retry(id, token) {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.status !== 'failed' || j.stage === 'clone') throw bad('Chỉ thử lại được sau bước clone — bước clone lỗi thì xoá rồi nhập lại', 409);
      if (locks.has(j.spec.slug)) throw bad('Dự án này đang được nhập', 409);
      locks.add(j.spec.slug);
      j.token = token || j.token;
      j.abort = new AbortController();
      Object.assign(j, { status: 'running', error: null, errorTail: '', finishedAt: null });
      j.done = execute(j, j.user, j.stageList.findIndex(s => s.id === j.stage));
      await j.done;
      return pub(j);
    },
    /** Drop a failed import before the project was registered: the clone and the generated profile go. */
    discard(id) {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.status === 'running') throw bad('Đang nhập, đợi xong hoặc lỗi', 409);
      if (j.project) throw bad('Dự án đã được đăng ký — xoá dự án ở trang dự án', 409);
      if (j.created) fs.rmSync(j.dir, { recursive: true, force: true });
      fs.rmSync(importPath(harnessRoot, j.spec.slug), { force: true });
      const prof = path.join(harnessRoot, 'profiles', j.spec.slug);
      try { if (fs.readFileSync(path.join(prof, 'profile.env'), 'utf8').includes(IMPORTED_MARK)) fs.rmSync(prof, { recursive: true, force: true }); } catch { /* none */ }
      jobs.delete(id);
      return { ok: true };
    },
  };
}
