import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from '../config.js';

/*
 * Company frameworks (feedback item 5): a team's own starter repo — its libraries, auth, logging, folder
 * layout — with sample code, offered in "Từ khung" next to Shipyard's built-in stacks. A new project is a
 * copy of the framework at one branch: placeholders renamed to the new project's names (in file contents
 * and in paths, e.g. com/acme/template → com/acme/kho_hang), the sample code kept or removed, git history
 * dropped. Shipyard adds only what is missing (its AI-team rules, CI, README when the framework has none).
 */

export const FRAMEWORKS_FILE = () => path.join(HARNESS_ROOT, 'config', 'frameworks.json');
const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/;
const TOKEN_RE = /^[A-Za-z0-9._/-]{3,100}$/;
const REL_RE = /^[A-Za-z0-9._@-][A-Za-z0-9._/@-]{0,199}$/;
const CMD_RE = /^[A-Za-z0-9._/:=@+-]+$/;
export const LANGUAGES = { java: 'Java', python: 'Python', typescript: 'TypeScript', kotlin: 'Kotlin', go: 'Go', csharp: 'C#', php: 'PHP', other: 'Khác' };
const MAX_FILE = 2 * 1024 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'build', 'dist', '.gradle', '.venv', '__pycache__', '.idea']);

const bad = msg => Object.assign(new Error(msg), { status: 400 });

/** A repo address git can clone: https/ssh URL, or an absolute local path (a repo on this machine). */
export function okRepo(url) {
  const u = String(url || '').trim();
  if (/^https:\/\/[^\s'"`<>\\]{3,300}$/.test(u)) return true;
  if (/^(ssh:\/\/)?[A-Za-z0-9._-]+@[A-Za-z0-9.-]+[:/][A-Za-z0-9._/~-]{1,200}$/.test(u)) return true;
  return path.isAbsolute(u) && !u.includes('..') && /^[A-Za-z0-9._/ -]{2,300}$/.test(u);
}

/** The commands a framework names (shown in its README, verify runs one): argv, no shell. */
function command(raw, label) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.length > 200 || !s.split(/\s+/).every(w => CMD_RE.test(w))) throw bad(`${label}: chỉ gồm lệnh và tham số đơn giản (không dùng ;, |, &, $)`);
  return s;
}

/** One framework from the admin screen → checked, or a 400 naming what is wrong. */
export function normalizeFramework(f = {}) {
  const id = String(f.id || '').trim().toLowerCase();
  const label = String(f.label || '').trim().slice(0, 60);
  if (!ID_RE.test(id)) throw bad('Mã framework: chữ thường, số, gạch ngang (2–31 ký tự)');
  if (!label) throw bad('Đặt tên cho framework');
  const repoUrl = String(f.repoUrl || '').trim();
  if (!okRepo(repoUrl)) throw bad(`${label}: địa chỉ repo không hợp lệ (https://…, git@…: hoặc đường dẫn trên máy)`);
  const branch = String(f.branch || 'main').trim();
  if (!BRANCH_RE.test(branch) || branch.startsWith('-') || branch.includes('..')) throw bad(`${label}: nhánh không hợp lệ`);
  const language = LANGUAGES[f.language] ? f.language : 'other';
  const replace = (Array.isArray(f.replace) ? f.replace : []).slice(0, 10).map(r => {
    const from = String(r?.from || '').trim();
    const to = String(r?.to || '').trim();
    if (!TOKEN_RE.test(from)) throw bad(`${label}: chuỗi cần đổi "${from}" chỉ gồm chữ, số, . _ - / (từ 3 ký tự)`);
    if (!['slug', 'name', 'package', 'pascal', 'snake'].includes(to)) throw bad(`${label}: "${from}" phải đổi thành slug, name, package, pascal hoặc snake`);
    return { from, to };
  });
  const rel = list => (Array.isArray(list) ? list : String(list || '').split(/[\n,]/)).map(s => String(s).trim().replace(/\/+$/, ''))
    .filter(Boolean).slice(0, 30).map(p => {
      if (!REL_RE.test(p) || p.split('/').includes('..') || p === '.git' || p.startsWith('.git/')) throw bad(`${label}: đường dẫn "${p}" không hợp lệ`);
      return p;
    });
  const packageBase = String(f.packageBase || '').trim();
  if (packageBase && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(packageBase)) throw bad(`${label}: gốc package dạng com.congty`);
  if (replace.some(r => r.to === 'package') && !packageBase) throw bad(`${label}: đổi thành package cần khai báo gốc package (ví dụ com.congty)`);
  const port = f.port == null || f.port === '' ? 8080 : Number(f.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw bad(`${label}: cổng ứng dụng không hợp lệ`);
  return {
    id, label, description: String(f.description || '').trim().slice(0, 300), language, repoUrl, branch, packageBase,
    replace, samples: rel(f.samples), remove: rel(f.remove), port,
    commands: { dev: command(f.commands?.dev, 'Lệnh chạy'), test: command(f.commands?.test, 'Lệnh test'), build: command(f.commands?.build, 'Lệnh build') },
    verify: command(f.verify, 'Lệnh kiểm tra'),
  };
}

export function readFrameworks(file = FRAMEWORKS_FILE()) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (Array.isArray(d) ? d : d.frameworks || []).flatMap(f => { try { return [normalizeFramework(f)]; } catch { return []; } });
  } catch { return []; }
}

export function saveFrameworks(list, file = FRAMEWORKS_FILE()) {
  if (!Array.isArray(list) || list.length > 30) throw bad('Tối đa 30 framework');
  const out = list.map(normalizeFramework);
  if (new Set(out.map(f => f.id)).size !== out.length) throw bad('Mã framework bị trùng');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ frameworks: out }, null, 2)}\n`);
  return out;
}

/** The new project's names, as each placeholder kind wants them. */
export function namesFor(ctx, fw) {
  const words = ctx.slug.split('-');
  const snake = words.join('_');
  return {
    slug: ctx.slug, name: ctx.name, snake,
    pascal: words.map(w => w[0].toUpperCase() + w.slice(1)).join(''),
    package: fw.packageBase ? `${fw.packageBase}.${snake}` : snake,
  };
}

/** Every (from → to) pair, with the slash form of dotted names for paths (com.acme.app → com/acme/app). */
export function replacements(fw, names) {
  const pairs = [];
  for (const r of fw.replace) {
    const to = names[r.to];
    pairs.push([r.from, to]);
    if (r.from.includes('.') && !r.from.includes('/')) pairs.push([r.from.replace(/\./g, '/'), to.replace(/\./g, '/')]);
  }
  return pairs.sort((a, b) => b[0].length - a[0].length); // longest first: com.acme.app before acme
}

const isText = buf => !buf.subarray(0, 8000).includes(0);

function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(dir, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/**
 * Turns a fresh copy of the framework (in `dir`) into the new project: drop git history and the paths
 * the framework says to drop, drop the sample code unless it is wanted, then rename placeholders in file
 * contents and in paths. Returns what changed, for the job log.
 */
export function applyFramework(dir, fw, ctx, { samples = true } = {}) {
  fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
  const inside = p => {
    const abs = path.resolve(dir, p);
    return abs.startsWith(path.resolve(dir) + path.sep) ? abs : null;
  };
  let removed = 0;
  for (const p of [...fw.remove, ...(samples ? [] : fw.samples)]) {
    const abs = inside(p);
    if (abs && fs.existsSync(abs)) { fs.rmSync(abs, { recursive: true, force: true }); removed++; }
  }
  const pairs = replacements(fw, namesFor(ctx, fw));
  const swap = s => pairs.reduce((acc, [a, b]) => acc.split(a).join(b), s);
  let edited = 0, moved = 0;
  for (const rel of walk(dir)) {
    const abs = path.join(dir, rel);
    const st = fs.statSync(abs);
    if (st.size <= MAX_FILE) {
      const buf = fs.readFileSync(abs);
      if (isText(buf)) {
        const text = buf.toString('utf8');
        const next = swap(text);
        if (next !== text) { fs.writeFileSync(abs, next); edited++; }
      }
    }
    const target = swap(rel);
    if (target !== rel) {
      const to = inside(target);
      if (!to) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(abs, to);
      moved++;
    }
  }
  pruneEmpty(dir);
  return { removed, edited, moved };
}

function pruneEmpty(dir, rel = '') {
  const abs = path.join(dir, rel);
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) pruneEmpty(dir, rel ? `${rel}/${e.name}` : e.name);
  }
  if (rel && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
}

/** A framework as a stack of the "Từ khung" catalog (same interface as stacks/*.js). */
export function frameworkStack(fw, { gitEnv = () => ({}) } = {}) {
  return {
    id: `fw-${fw.id}`, framework: fw.id, company: true,
    language: `company-${fw.language}`, languageLabel: `Framework công ty · ${LANGUAGES[fw.language]}`,
    label: fw.label, description: fw.description || `Sinh từ ${fw.repoUrl} (nhánh ${fw.branch})`,
    appPort: fw.port, noDatabase: true, keepsOwnFiles: true,
    options: [{ id: 'samples', label: 'Kèm code mẫu', type: 'bool', default: true }],
    requires: () => ['git'],
    check: () => '',
    async generate(ctx) {
      ctx.log(`Lấy framework ${fw.label} (${fw.branch})`);
      await ctx.run('git', ['clone', '-q', '--depth', '1', '--branch', fw.branch, '--', fw.repoUrl, ctx.dir],
        { cwd: ctx.parentDir, extraEnv: gitEnv(fw.repoUrl), timeoutMs: 10 * 60_000 });
      const r = applyFramework(ctx.dir, fw, ctx, { samples: ctx.options.samples !== false });
      ctx.log(`Đổi tên ở ${r.edited} file, chuyển ${r.moved} file sang thư mục mới, bỏ ${r.removed} mục${ctx.options.samples === false ? ' (gồm code mẫu)' : ''}`);
    },
    overlay: () => ({}),
    env: () => ({}),
    gitignore: () => '',
    commands: () => ({ dev: fw.commands.dev || '# xem README của framework', test: fw.commands.test || '', build: fw.commands.build || '' }),
    async verify(ctx) {
      if (!fw.verify) { ctx.log('Framework không khai báo lệnh kiểm tra — bỏ qua'); return; }
      const [cmd, ...args] = fw.verify.split(/\s+/);
      await ctx.run(cmd, args, { cwd: ctx.dir, timeoutMs: 20 * 60_000 });
    },
  };
}
