import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { run as runCmd, writeFiles, childEnv } from './util.js';
import { WORKSPACES_ROOT } from './jobs.js';
import { adoptFiles } from './team.js';
import { validateTeam, gitAuthEnv } from './setup.js';

// "Đội AI" tab (spec 2026-10-19 §5, P5): view a project's approved rules, propose changes, upload
// material for the AI Manager, ask for a redraft, and give an existing project an AI team.
// Every rule change goes through a SETUP run (review in "Chờ duyệt"); nothing here commits by itself.

const RULE_DOC = /^[a-z0-9][a-z0-9_-]*\.md$/;
const SKILL = /^[a-z0-9][a-z0-9_-]*$/;
export const HUMAN_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,100}\.(md|txt|json|ya?ml|csv|sql|xml|html|java|kt|ts|tsx|js|jsx|py|pdf|png|jpe?g)$/iu;
const MAX_HUMAN = 3 * 1024 * 1024; // base64 must fit the dashboard's 5MB JSON body limit
const MAX_RULE = 60_000;
const OPEN = ['queued', 'drafting', 'awaiting-review', 'publishing', 'error'];
const SYNC_EVERY_MS = 30_000;

const fail = (status, message) => Object.assign(new Error(message), { status });

/** Which credentials reach this repo: a configured provider whose host matches, else the host's own git setup. */
export function providerFor(repoUrl, providers) {
  let host;
  try { host = new URL(repoUrl).hostname; } catch { return 'host'; }
  const list = providers?.list?.() || {};
  if (host === 'github.com' && providers.configured('github')) return 'github';
  const gl = list.gitlab?.url && (() => { try { return new URL(list.gitlab.url).hostname; } catch { return null; } })();
  if (gl && gl === host && providers.configured('gitlab')) return 'gitlab';
  return 'host';
}

/**
 * `skillCatalog`: Shipyard's suggested skills ({ id, label, desc, roles, content }). Choosing one the repo
 * lacks adds `.claude/skills/<id>/SKILL.md` when the change is approved.
 */
export function createTeamHub({ setup, providers, run = runCmd, root = WORKSPACES_ROOT, now = Date.now, skillCatalog = [],
  branchFile = path.join(root, '.team', 'branches.json') } = {}) {
  const synced = new Map();
  // Per-project override of the rules branch, for repos whose integration branch differs from the platform's defaultBranch.
  const branches = () => { try { return JSON.parse(fs.readFileSync(branchFile, 'utf8')); } catch { return {}; } };
  const busy = new Set();

  const gitOut = (dir, ...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: childEnv(), timeout: 20000, maxBuffer: 20 * 1024 * 1024 });
    return r.status === 0 ? r.stdout : null;
  };
  const show = (ctx, p) => gitOut(ctx.dir, 'show', `${ctx.branch}:.shipyard/${p}`);
  const latest = projectId => setup.forProject(projectId)[0] || null;
  const isOpen = e => !!e && OPEN.includes(e.status);

  /** Local repo the team tab works in: the wizard's workspace, or a clone Shipyard keeps under <root>/.team/. */
  async function locate(project) {
    const branch = branches()[project.id] || project.defaultBranch || 'development';
    const known = setup.forProject(project.id).find(e => e.dir && fs.existsSync(e.dir));
    if (known) return { dir: known.dir, branch: known.branch || branch, provider: known.provider || 'local' };
    const url = project.repoUrl || '';
    if (path.isAbsolute(url) && path.resolve(url).startsWith(path.resolve(root) + path.sep) && fs.existsSync(path.join(url, '.git'))) {
      return { dir: url, branch, provider: gitOut(url, 'remote')?.trim() ? 'host' : 'local' };
    }
    if (!url) throw fail(400, 'Dự án chưa khai báo repo');
    const dir = path.join(root, '.team', project.slug);
    const provider = path.isAbsolute(url) ? 'host' : providerFor(url, providers);
    if (!fs.existsSync(path.join(dir, '.git'))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.rmSync(dir, { recursive: true, force: true });
      await run('git', ['clone', '-q', '--no-tags', url, dir], { extraEnv: gitAuthEnv(providers, provider), timeoutMs: 10 * 60_000 })
        .catch(e => { throw fail(502, `Không clone được ${url}: ${e.message}${e.tail ? ` — ${e.tail.split('\n').pop()}` : ''}`); });
    }
    return { dir, branch, provider };
  }

  /** Fast-forward the integration branch (never while a setup run owns the working tree). */
  async function sync(project, ctx, force = false) {
    if (isOpen(latest(project.id))) return;
    if (!force && now() - (synced.get(project.id) || 0) < SYNC_EVERY_MS) return;
    const hasOrigin = (gitOut(ctx.dir, 'remote') || '').split('\n').includes('origin');
    const g = (...a) => run('git', a, { cwd: ctx.dir, log: () => {} });
    if (hasOrigin) {
      const env = gitAuthEnv(providers, ctx.provider);
      await run('git', ['fetch', '-q', '--prune', 'origin'], { cwd: ctx.dir, log: () => {}, extraEnv: env })
        .catch(e => { throw fail(502, `Không fetch được repo: ${e.message}`); });
      if (gitOut(ctx.dir, 'rev-parse', '--verify', '-q', `refs/remotes/origin/${ctx.branch}`) === null) {
        throw Object.assign(fail(409, `Repo không có nhánh ${ctx.branch} — chọn nhánh tích hợp của dự án`), { branches: remoteBranches(ctx) });
      }
    }
    const local = gitOut(ctx.dir, 'rev-parse', '--verify', '-q', `refs/heads/${ctx.branch}`) !== null;
    if (!local && hasOrigin) await g('branch', ctx.branch, `origin/${ctx.branch}`);
    else if (!local) throw fail(400, `Repo không có nhánh ${ctx.branch}`);
    await g('switch', '-q', ctx.branch);
    if (hasOrigin) await g('merge', '-q', '--ff-only', `origin/${ctx.branch}`)
      .catch(() => { throw fail(409, `Nhánh ${ctx.branch} trên máy đã lệch khỏi origin — cần xử lý tay trong ${ctx.dir}`); });
    synced.set(project.id, now());
  }

  const remoteBranches = ctx => (gitOut(ctx.dir, 'for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin') || '')
    .split('\n').filter(b => b && b !== 'HEAD');

  async function open(project, { force = false } = {}) {
    const ctx = await locate(project);
    await sync(project, ctx, force);
    return ctx;
  }

  function rulesOf(ctx) {
    const names = (gitOut(ctx.dir, 'ls-tree', '--name-only', `${ctx.branch}:.shipyard/rules`) || '').split('\n').filter(n => RULE_DOC.test(n));
    return Object.fromEntries(names.map(n => [n, show(ctx, `rules/${n}`) || '']));
  }

  function humanOf(ctx) {
    const d = path.join(ctx.dir, '.shipyard', 'human');
    const committed = new Set((gitOut(ctx.dir, 'ls-tree', '--name-only', `${ctx.branch}:.shipyard/human`) || '').split('\n').filter(Boolean));
    const files = fs.existsSync(d) ? fs.readdirSync(d).filter(n => fs.statSync(path.join(d, n)).isFile()) : [];
    return files.sort().map(name => ({ name, size: fs.statSync(path.join(d, name)).size, committed: committed.has(name) }));
  }

  const skillsOf = ctx => (gitOut(ctx.dir, 'ls-tree', '-d', '--name-only', `${ctx.branch}:.claude/skills`) || '')
    .split('\n').filter(n => SKILL.test(n));

  const setupView = e => e && ({ runId: e.runId, status: e.status, error: e.error || null, title: e.title || null,
    note: e.note || null, adopt: !!e.adopt, createdAt: e.createdAt || null, updatedAt: e.updatedAt, busy: setup.isBusy(e.runId) });

  async function state(project, opts) {
    const ctx = await open(project, opts);
    const teamText = show(ctx, 'team.json');
    let team = null, teamError = null;
    if (teamText != null) { try { team = validateTeam(teamText); } catch (e) { teamError = e.message; } }
    const e = latest(project.id);
    return {
      projectId: project.id, dir: ctx.dir, branch: ctx.branch, provider: ctx.provider,
      adopted: teamText != null, team, teamError, rules: teamText != null ? rulesOf(ctx) : {},
      skills: skillsOf(ctx), human: humanOf(ctx), setup: setupView(e), open: isOpen(e),
      skillCatalog: skillCatalog.map(({ id, label, desc, roles }) => ({ id, label, desc, roles: roles || [] })),
    };
  }

  /** One mutating action per project at a time, and never while a setup run is open. */
  async function exclusive(project, fn, { allowOpen = false } = {}) {
    if (busy.has(project.id)) throw fail(409, 'Đang xử lý một thao tác khác của dự án này');
    if (!allowOpen && isOpen(latest(project.id))) throw fail(409, 'Đang có bộ luật chờ soạn/duyệt — xử lý xong mới gửi thay đổi mới');
    busy.add(project.id);
    try { return await fn(); } finally { busy.delete(project.id); }
  }

  const startRun = (project, ctx, user, extra) => setup.start({
    projectId: project.id, slug: project.slug, name: project.name, stack: null, dir: ctx.dir,
    provider: ctx.provider, branch: ctx.branch, createdBy: user.id, ...extra,
  });

  return {
    state,

    /** Use another branch of the repo for this project's rules (must exist on origin). */
    setBranch: (project, branch) => exclusive(project, async () => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(branch || '') || branch.includes('..')) throw fail(400, 'Tên nhánh không hợp lệ');
      const ctx = await locate(project);
      const hasOrigin = (gitOut(ctx.dir, 'remote') || '').split('\n').includes('origin');
      const ok = hasOrigin ? remoteBranches(ctx).includes(branch) : gitOut(ctx.dir, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`) !== null;
      if (!ok) throw fail(400, `Repo không có nhánh ${branch}`);
      fs.mkdirSync(path.dirname(branchFile), { recursive: true });
      fs.writeFileSync(branchFile, JSON.stringify({ ...branches(), [project.id]: branch }, null, 2));
      synced.delete(project.id);
      return { branch };
    }),

    /** Give an existing project its AI team: generic starter + an AI Manager draft from the real code. */
    adopt: (project, user, { note = '' } = {}) => exclusive(project, async () => {
      const ctx = await open(project, { force: true });
      if (show(ctx, 'team.json') != null) throw fail(409, 'Dự án đã có đội AI');
      writeFiles(ctx.dir, adoptFiles({ name: project.name, branch: ctx.branch }));
      return { runId: await startRun(project, ctx, user, { adopt: true, note: clip(note), title: `Thiết lập đội AI — ${project.name}` }) };
    }),

    /** A person's edit of the rules / read matrix / skills, sent for review unchanged. */
    propose: (project, user, { rules = {}, team, note = '' } = {}) => exclusive(project, async () => {
      const ctx = await open(project, { force: true });
      if (show(ctx, 'team.json') == null) throw fail(409, 'Dự án chưa có đội AI — bấm "Thiết lập đội AI" trước');
      const docs = rulesOf(ctx);
      for (const [name, text] of Object.entries(rules || {})) {
        if (!RULE_DOC.test(name)) throw fail(400, `Tên file luật không hợp lệ: ${name} (chữ thường, số, -, _; đuôi .md)`);
        if (text === null) { delete docs[name]; continue; }
        if (typeof text !== 'string' || text.length > MAX_RULE) throw fail(400, `${name}: nội dung không hợp lệ hoặc quá dài`);
        docs[name] = text;
      }
      if (!docs['project.md']?.trim()) throw fail(400, 'Phải giữ rules/project.md (luật chung)');
      const teamText = team === undefined ? show(ctx, 'team.json') : JSON.stringify(team, null, 2) + '\n';
      try { validateTeam(teamText); } catch (e) { throw fail(400, e.message); }
      const inRepo = new Set(skillsOf(ctx));
      const skillFiles = {};
      for (const [role, cfg] of Object.entries(JSON.parse(teamText).roles)) {
        for (const p of cfg?.reads || []) if (!docs[p.slice('rules/'.length)]) throw fail(400, `${role} đọc ${p} nhưng file này không còn`);
        for (const s of cfg?.skills || []) {
          if (!SKILL.test(s)) throw fail(400, `${role}: tên skill không hợp lệ "${s}"`);
          if (inRepo.has(s)) continue;
          const c = skillCatalog.find(x => x.id === s);
          if (!c) throw fail(400, `${role}: skill "${s}" không có trong repo lẫn danh mục gợi ý`);
          skillFiles[`.claude/skills/${c.id}/SKILL.md`] = `---\nname: ${c.id}\ndescription: ${c.desc}\n---\n\n${c.content}\n`;
        }
      }
      const added = Object.keys(skillFiles).map(f => f.split('/')[2]);
      const base = clip(note) || `Thay đổi luật do ${user.email || user.id} sửa trực tiếp`;
      return { runId: await startRun(project, ctx, user, {
        documents: { ...docs, 'team.json': teamText }, skillFiles: added.length ? skillFiles : null,
        note: added.length ? `${base}\nThêm skill từ danh mục Shipyard: ${added.join(', ')}` : base,
        title: `Sửa luật đội AI — ${project.name}`,
      }) };
    }),

    /** Ask the AI Manager to rewrite the rules (after new material, or the code moved on). */
    redraft: (project, user, { note = '' } = {}) => exclusive(project, async () => {
      const ctx = await open(project, { force: true });
      if (show(ctx, 'team.json') == null) throw fail(409, 'Dự án chưa có đội AI — bấm "Thiết lập đội AI" trước');
      return { runId: await startRun(project, ctx, user, { note: clip(note), title: `Soạn lại luật — ${project.name}` }) };
    }),

    /** Material for the AI Manager; committed together with the next approved rules. */
    putHuman: (project, name, base64) => exclusive(project, async () => {
      if (!HUMAN_NAME.test(name || '')) throw fail(400, 'Tên file không hợp lệ (cho phép .md .txt .pdf .png .json .yaml .sql, mã nguồn…)');
      const buf = Buffer.from(String(base64 || ''), 'base64');
      if (!buf.length) throw fail(400, 'File rỗng');
      if (buf.length > MAX_HUMAN) throw fail(400, 'File tối đa 3MB');
      const ctx = await locate(project);
      const d = path.join(ctx.dir, '.shipyard', 'human');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, name), buf);
      return humanOf(ctx);
    }, { allowOpen: true }),

    readHuman: async (project, name) => {
      if (!HUMAN_NAME.test(name || '')) throw fail(400, 'Tên file không hợp lệ');
      const ctx = await locate(project);
      const p = path.join(ctx.dir, '.shipyard', 'human', name);
      if (!fs.existsSync(p)) throw fail(404, 'Không có file này');
      return p;
    },

    deleteHuman: (project, name) => exclusive(project, async () => {
      if (!HUMAN_NAME.test(name || '')) throw fail(400, 'Tên file không hợp lệ');
      const ctx = await locate(project);
      fs.rmSync(path.join(ctx.dir, '.shipyard', 'human', name), { force: true });
      return humanOf(ctx);
    }, { allowOpen: true }),

    /** Re-run the open setup run's next action (after an error). */
    retry(project) {
      const e = latest(project.id);
      if (!isOpen(e)) throw fail(409, 'Không có bộ luật nào đang dở');
      setup.work(e.runId);
      return { runId: e.runId };
    },
  };
}

const clip = s => String(s || '').trim().slice(0, 4000);
