import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { run as runCmd, writeFiles, probeTools } from './util.js';
import { stackById } from './catalog.js';
import { commonFiles } from './common.js';

export const WORKSPACES_ROOT = process.env.SHIPYARD_WORKSPACES || path.join(os.homedir(), 'shipyard-workspaces');

export const STAGES = [
  { id: 'generate', label: 'Sinh khung dự án' },
  { id: 'overlay', label: 'Thêm cấu hình chung' },
  { id: 'verify', label: 'Build & chạy test' },
  { id: 'git', label: 'Khởi tạo Git' },
  { id: 'register', label: 'Đăng ký dự án' },
];

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
 * <root>/<slug> (moving it later would break virtualenvs) and removed on discard.
 */
export function createJobRunner({ root = WORKSPACES_ROOT, tools = () => probeTools(), fetchImpl = fetch,
  run = runCmd, registerProject, now = () => new Date() } = {}) {
  const jobs = new Map();

  const publicJob = j => j && ({
    id: j.id, slug: j.spec.slug, name: j.spec.name, stack: j.spec.stack, status: j.status,
    stage: j.stage, stages: j.stages, error: j.error, errorTail: j.errorTail, dir: j.dir,
    project: j.project, startedAt: j.startedAt, finishedAt: j.finishedAt, log: j.log.slice(-400),
  });

  function prune() {
    const done = [...jobs.values()].filter(j => j.status !== 'running').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    while (jobs.size > MAX_JOBS && done.length) jobs.delete(done.shift().id);
  }

  async function execute(j, user) {
    const stack = stackById(j.spec.stack);
    const log = line => { j.log.push(line); if (j.log.length > MAX_LOG) j.log.splice(0, j.log.length - MAX_LOG); };
    const ctx = {
      ...j.spec, dir: j.dir, parentDir: root, tools: j.tools, fetchImpl, log,
      run: (cmd, args, opts = {}) => run(cmd, args, { log, signal: j.abort.signal, ...opts }),
    };
    const stage = async (id, fn) => {
      if (j.abort.signal.aborted) throw new Error('đã huỷ');
      j.stage = id;
      j.stages[id] = 'running';
      log(`── ${STAGES.find(s => s.id === id).label}`);
      await fn();
      j.stages[id] = 'done';
    };
    try {
      await stage('generate', async () => {
        j.created = true;
        await stack.generate(ctx);
        if (!fs.existsSync(j.dir)) throw new Error('công cụ sinh khung không tạo thư mục dự án');
      });
      await stage('overlay', () => {
        writeFiles(j.dir, stack.overlay(ctx));
        writeFiles(j.dir, commonFiles(ctx, stack, now().toISOString()));
      });
      await stage('verify', () => stack.verify(ctx));
      await stage('git', () => initRepo(j.dir, {
        authorName: user.name || user.email.split('@')[0], authorEmail: user.email, stackId: stack.id, run: ctx.run,
      }));
      await stage('register', () => register(j));
      j.status = 'done';
      j.stage = null;
    } catch (e) {
      if (j.stage) j.stages[j.stage] = 'failed';
      j.status = j.abort.signal.aborted ? 'cancelled' : 'failed';
      j.error = e.message;
      j.errorTail = e.tail || '';
      log(`✗ ${e.message}`);
    } finally {
      j.finishedAt = now().toISOString();
      locks.delete(j.spec.slug);
    }
  }

  const locks = new Set();

  async function register(j) {
    j.project = await registerProject({ slug: j.spec.slug, name: j.spec.name, repoUrl: j.dir, defaultBranch: 'development' }, j.token);
    j.log.push(`Đã tạo dự án ${j.project?.id || ''}`);
  }

  return {
    root,
    /** `token` is the caller's platform access token; polling refreshes it via touch(). */
    start(spec, user, token) {
      if (locks.has(spec.slug)) throw Object.assign(new Error('Dự án này đang được tạo'), { status: 409 });
      const dir = path.join(root, spec.slug);
      if (fs.existsSync(dir)) throw Object.assign(new Error(`Thư mục ${dir} đã tồn tại`), { status: 409 });
      fs.mkdirSync(root, { recursive: true });
      locks.add(spec.slug);
      const j = {
        id: `scf_${crypto.randomBytes(6).toString('hex')}`, spec, dir, status: 'running', stage: null,
        stages: Object.fromEntries(STAGES.map(s => [s.id, 'pending'])), log: [], abort: new AbortController(),
        tools: tools(), startedAt: now().toISOString(), finishedAt: null, userId: user.id, token,
      };
      jobs.set(j.id, j);
      prune();
      j.done = execute(j, user);
      return publicJob(j);
    },
    get: id => publicJob(jobs.get(id)),
    owner: id => jobs.get(id)?.userId,
    touch(id, token) { const j = jobs.get(id); if (j && token) j.token = token; },
    /** Registration failed (e.g. session expired, slug taken): retry it with a fresh token. */
    async retryRegister(id, token) {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.status !== 'failed' || j.stage !== 'register') throw Object.assign(new Error('Chỉ thử lại được bước đăng ký dự án'), { status: 409 });
      j.token = token || j.token;
      j.stages.register = 'running';
      try {
        await register(j);
        Object.assign(j, { status: 'done', stage: null, error: null, errorTail: '', finishedAt: now().toISOString() });
        j.stages.register = 'done';
      } catch (e) {
        j.stages.register = 'failed';
        j.error = e.message;
        j.log.push(`✗ ${e.message}`);
      }
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
    /** Remove the folder of a failed/cancelled job (never a registered project's). */
    discard(id) {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.status === 'running') throw Object.assign(new Error('Job đang chạy, hãy huỷ trước'), { status: 409 });
      if (j.status === 'done') throw Object.assign(new Error('Dự án đã được tạo, không xoá thư mục từ đây'), { status: 409 });
      if (j.created) fs.rmSync(j.dir, { recursive: true, force: true });
      jobs.delete(id);
      return { ok: true };
    },
  };
}
