import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { run as runCmd, writeFiles, probeTools } from './util.js';
import { stackById } from './catalog.js';
import { commonFiles } from './common.js';
import { ciFiles } from './ci.js';
import { pushRepo, PROVIDER_LABEL } from './remotes.js';

export const WORKSPACES_ROOT = process.env.SHIPYARD_WORKSPACES || path.join(os.homedir(), 'shipyard-workspaces');

export const STAGES = [
  { id: 'generate', label: 'Sinh khung dự án' },
  { id: 'overlay', label: 'Thêm cấu hình chung' },
  { id: 'verify', label: 'Build & chạy test' },
  { id: 'git', label: 'Khởi tạo Git' },
  { id: 'remote', label: 'Tạo repo & push' },
  { id: 'register', label: 'Đăng ký dự án' },
];
/** Stages that touch nothing local, so a failure there can be retried in place. */
const RETRYABLE = ['remote', 'register'];

export const stagesFor = spec => STAGES.filter(s => s.id !== 'remote' || (spec.git?.provider || 'local') !== 'local');

const MAX_LOG = 4000;
const MAX_JOBS = 30;

/** git with a fixed identity and no hooks/signing from the host's global config. */
export async function initRepo(dir, { authorName, authorEmail, stackId, run }) {
  const g = (...args) => run('git', ['-c', `user.name=${authorName}`, '-c', `user.email=${authorEmail}`,
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir });
  await g('init', '-q', '-b', 'main');
  await g('add', '-A');
  await g('commit', '-q', '-m', `chore: scaffold ${stackId} project via Shipyard`);
  await g('branch', 'development');
}

/**
 * In-memory job runner. One job per slug at a time; the project folder is written straight to
 * <root>/<slug> (moving it later would break virtualenvs) and removed on discard. A remote repo,
 * once created, is never deleted from here.
 */
export function createJobRunner({ root = WORKSPACES_ROOT, tools = () => probeTools(), fetchImpl = fetch,
  run = runCmd, registerProject, remotes = null, now = () => new Date() } = {}) {
  const jobs = new Map();
  const locks = new Set();

  const publicJob = j => j && ({
    id: j.id, slug: j.spec.slug, name: j.spec.name, stack: j.spec.stack, git: j.spec.git, status: j.status,
    stage: j.stage, stageList: j.stageList, stages: j.stages, error: j.error, errorTail: j.errorTail, dir: j.dir,
    remote: j.remote || null, project: j.project, retryable: j.status === 'failed' && RETRYABLE.includes(j.stage),
    startedAt: j.startedAt, finishedAt: j.finishedAt, log: j.log.slice(-400),
  });

  function prune() {
    const done = [...jobs.values()].filter(j => j.status !== 'running').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    while (jobs.size > MAX_JOBS && done.length) jobs.delete(done.shift().id);
  }

  function steps(j, user) {
    const stack = stackById(j.spec.stack);
    const ctx = j.ctx;
    const provider = j.spec.git?.provider || 'local';
    return {
      async generate() {
        j.created = true;
        await stack.generate(ctx);
        if (!fs.existsSync(j.dir)) throw new Error('công cụ sinh khung không tạo thư mục dự án');
      },
      overlay() {
        writeFiles(j.dir, stack.overlay(ctx));
        writeFiles(j.dir, commonFiles(ctx, stack, now().toISOString()));
        writeFiles(j.dir, ciFiles(provider, stack.id, ctx.options));
        // Same peer-dep mode for teammates and CI as the install that produced package-lock.json.
        if (fs.existsSync(path.join(j.dir, 'package.json')) && (ctx.tools?.npm?.major || 0) < 10) {
          writeFiles(j.dir, { '.npmrc': 'legacy-peer-deps=true\n' });
        }
      },
      verify: () => stack.verify(ctx),
      git: () => initRepo(j.dir, {
        authorName: user.name || user.email.split('@')[0], authorEmail: user.email, stackId: stack.id, run: ctx.run,
      }),
      async remote() {
        const g = j.spec.git;
        if (!j.remote) {
          ctx.log(`Tạo repo trên ${PROVIDER_LABEL[provider]} (${g.visibility === 'public' ? 'công khai' : 'riêng tư'})`);
          j.remote = await remotes.createRepo(provider, { owner: g.owner, name: j.spec.slug,
            description: j.spec.description || j.spec.name, visibility: g.visibility });
          ctx.log(`Đã tạo ${j.remote.webUrl}`);
        }
        if (!j.originSet) {
          await ctx.run('git', ['remote', 'add', 'origin', j.remote.cloneUrl], { cwd: j.dir });
          j.originSet = true;
        }
        await pushRepo(j.dir, remotes.authHeader(provider), ctx.run);
      },
      async register() {
        j.project = await registerProject({ slug: j.spec.slug, name: j.spec.name, repoUrl: j.remote?.cloneUrl || j.dir,
          defaultBranch: 'development' }, j.token);
        ctx.log(`Đã tạo dự án ${j.project?.id || ''}`);
      },
    };
  }

  async function execute(j, user, from = 0) {
    const fns = steps(j, user);
    try {
      for (const s of j.stageList.slice(from)) {
        if (j.abort.signal.aborted) throw new Error('đã huỷ');
        j.stage = s.id;
        j.stages[s.id] = 'running';
        j.ctx.log(`── ${s.label}`);
        await fns[s.id]();
        j.stages[s.id] = 'done';
      }
      Object.assign(j, { status: 'done', stage: null, error: null, errorTail: '' });
    } catch (e) {
      if (j.stage) j.stages[j.stage] = 'failed';
      j.status = j.abort.signal.aborted ? 'cancelled' : 'failed';
      j.error = e.message;
      j.errorTail = e.tail || '';
      j.ctx.log(`✗ ${e.message}`);
    } finally {
      j.finishedAt = now().toISOString();
      locks.delete(j.spec.slug);
    }
  }

  return {
    root,
    /** `token` is the caller's platform access token; polling refreshes it via touch(). */
    start(spec, user, token) {
      const provider = spec.git?.provider || 'local';
      if (provider !== 'local' && !remotes?.configured(provider)) {
        throw Object.assign(new Error(`Chưa kết nối ${PROVIDER_LABEL[provider] || provider}`), { status: 400 });
      }
      if (locks.has(spec.slug)) throw Object.assign(new Error('Dự án này đang được tạo'), { status: 409 });
      const dir = path.join(root, spec.slug);
      if (fs.existsSync(dir)) throw Object.assign(new Error(`Thư mục ${dir} đã tồn tại`), { status: 409 });
      fs.mkdirSync(root, { recursive: true });
      locks.add(spec.slug);
      const stageList = stagesFor(spec);
      const j = {
        id: `scf_${crypto.randomBytes(6).toString('hex')}`, spec, dir, status: 'running', stage: null, stageList,
        stages: Object.fromEntries(stageList.map(s => [s.id, 'pending'])), log: [], abort: new AbortController(),
        tools: tools(), startedAt: now().toISOString(), finishedAt: null, userId: user.id, user, token,
      };
      const log = line => { j.log.push(line); if (j.log.length > MAX_LOG) j.log.splice(0, j.log.length - MAX_LOG); };
      j.ctx = { ...spec, dir, parentDir: root, tools: j.tools, fetchImpl, log,
        run: (cmd, args, opts = {}) => run(cmd, args, { log, signal: j.abort.signal, ...opts }) };
      jobs.set(j.id, j);
      prune();
      j.done = execute(j, user);
      return publicJob(j);
    },
    get: id => publicJob(jobs.get(id)),
    owner: id => jobs.get(id)?.userId,
    touch(id, token) { const j = jobs.get(id); if (j && token) j.token = token; },
    /** Resume from a failed remote/register stage (session expired, network, repo name taken…). */
    async retry(id, token) {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.status !== 'failed' || !RETRYABLE.includes(j.stage)) {
        throw Object.assign(new Error('Chỉ thử lại được bước tạo repo hoặc đăng ký dự án'), { status: 409 });
      }
      if (locks.has(j.spec.slug)) throw Object.assign(new Error('Dự án này đang được tạo'), { status: 409 });
      locks.add(j.spec.slug);
      j.token = token || j.token;
      j.abort = new AbortController();
      Object.assign(j, { status: 'running', error: null, errorTail: '', finishedAt: null });
      j.done = execute(j, j.user, j.stageList.findIndex(s => s.id === j.stage));
      await j.done;
      return publicJob(j);
    },
    /** Wait for completion (tests). */
    wait: id => jobs.get(id)?.done,
    cancel(id) {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.status === 'running') j.abort.abort();
      return publicJob(j);
    },
    /** Remove the local folder of a failed/cancelled job (never a registered project's, never the remote repo). */
    discard(id) {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.status === 'running') throw Object.assign(new Error('Job đang chạy, hãy huỷ trước'), { status: 409 });
      if (j.status === 'done') throw Object.assign(new Error('Dự án đã được tạo, không xoá thư mục từ đây'), { status: 409 });
      if (j.created) fs.rmSync(j.dir, { recursive: true, force: true });
      jobs.delete(id);
      return { ok: true, remoteKept: j.remote?.webUrl || null };
    },
  };
}
