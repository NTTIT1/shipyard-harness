import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { run as runCmd, writeFiles, probeTools } from './util.js';
import { stackById, choiceOf } from './catalog.js';
import { commonFiles } from './common.js';
import { ciFiles } from './ci.js';
import { teamFiles } from './team.js';
import { partsOf, frontendWiring, backendNaming, fullstackRootFiles, fullstackCiFiles, fullstackStarterRules } from './fullstack.js';
import { pushRepo, PROVIDER_LABEL } from './remotes.js';

export const WORKSPACES_ROOT = process.env.SHIPYARD_WORKSPACES || path.join(os.homedir(), 'shipyard-workspaces');

export const STAGES = [
  { id: 'reserve', label: 'Tạo repo trống' },
  { id: 'blueprint', label: 'Kiến trúc: AI soạn, người duyệt' },
  { id: 'generate', label: 'Sinh khung dự án' },
  { id: 'overlay', label: 'Thêm cấu hình chung' },
  { id: 'verify', label: 'Build & chạy test' },
  { id: 'git', label: 'Khởi tạo Git' },
  { id: 'remote', label: 'Tạo repo & push' },
  { id: 'register', label: 'Đăng ký dự án' },
  { id: 'team', label: 'Giao AI Manager soạn luật' },
];
/** Stages that touch nothing local, so a failure there can be retried in place. */
const RETRYABLE = ['reserve', 'register', 'blueprint', 'remote', 'team'];
/** An approved architecture-first job is rebuilt through its BLUEPRINT run, whatever stage failed. */
const afterApproval = j => !!j.spec.archFirst && j.stages.blueprint === 'done';

/**
 * Normal order: generate → … → register → team. Architecture first: the empty repo and the platform
 * project come first (the BLUEPRINT run needs a project to be reviewed in), the job pauses at
 * `blueprint` until a human approves, then generates the skeleton with the approved architecture.
 */
export function stagesFor(spec) {
  const remote = (spec.git?.provider || 'local') !== 'local';
  const ids = spec.archFirst
    ? [...(remote ? ['reserve'] : []), 'register', 'blueprint', 'generate', 'overlay', 'verify', 'git', ...(remote ? ['remote'] : []), 'team']
    : ['generate', 'overlay', 'verify', 'git', ...(remote ? ['remote'] : []), 'register', 'team'];
  return ids.filter(id => id !== 'team' || spec.aiTeam !== false).map(id => STAGES.find(s => s.id === id));
}

const PAUSE = Symbol('pause');

/** One line per generated app, for the architect: what was chosen and with which options. */
export function stackLines(spec) {
  const describe = (role, id, options) => {
    const st = stackById(id);
    const opts = (st.options || []).map(o => {
      const v = options?.[o.id];
      const label = o.type === 'bool' ? (v ? 'có' : 'không') : (o.choices?.map(choiceOf).find(c => c.id === v)?.label ?? v);
      return `${o.label}: ${label}`;
    });
    return `${role}${st.languageLabel} · ${st.label}${opts.length ? ` (${opts.join('; ')})` : ''}`;
  };
  if (spec.kind === 'fullstack') {
    return ['Fullstack: một repo, backend/ + frontend/ (frontend gọi backend qua /api)',
      describe('backend/: ', spec.stack, spec.options), describe('frontend/: ', spec.frontend.stack, spec.frontend.options)];
  }
  return [describe('', spec.stack, spec.options)];
}

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
  run = runCmd, registerProject, setWorkflow = null, setDelivery = null, remotes = null, setup = null, blueprint = null, now = () => new Date() } = {}) {
  const jobs = new Map();
  const locks = new Set();

  const publicJob = j => j && ({
    id: j.id, slug: j.spec.slug, name: j.spec.name, kind: j.spec.kind || 'single', stack: j.spec.stack,
    frontend: j.spec.frontend?.stack || null, git: j.spec.git, status: j.status,
    stage: j.stage, stageList: j.stageList, stages: j.stages, error: j.error, errorTail: j.errorTail, dir: j.dir,
    remote: j.remote || null, project: j.project, setupRunId: j.setupRunId || null, blueprintRunId: j.blueprintRunId || null,
    archFirst: !!j.spec.archFirst, retryable: j.status === 'failed' && (RETRYABLE.includes(j.stage) || afterApproval(j)),
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
    const fullstack = j.spec.kind === 'fullstack';
    // One part = one generated app: the root itself, or backend/ and frontend/ of a fullstack repo.
    const parts = partsOf(j.spec, j.dir, stackById);
    const partCtx = part => ({ ...ctx, dir: part.dir, parentDir: path.dirname(part.dir), options: part.options });
    const [backend, frontend] = parts;
    const createRemote = async () => {
      const g = j.spec.git;
      ctx.log(`Tạo repo trên ${PROVIDER_LABEL[provider]} (${g.visibility === 'public' ? 'công khai' : 'riêng tư'})`);
      j.remote = await remotes.createRepo(provider, { owner: g.owner, name: j.spec.slug,
        description: j.spec.description || j.spec.name, visibility: g.visibility });
      ctx.log(`Đã tạo ${j.remote.webUrl}`);
    };
    return {
      async reserve() {
        if (!j.remote) await createRemote();
      },
      async blueprint() {
        if (!j.blueprintRunId) {
          j.blueprintRunId = await blueprint.start({ projectId: j.project.id, slug: j.spec.slug, name: j.spec.name,
            stackLines: stackLines(j.spec), requirements: j.spec.requirements, brief: j.spec.brief, createdBy: user.id,
            snapshot: snapshotOf(j) });
        }
        ctx.log(`Kiến trúc sư AI đang soạn kiến trúc (run ${j.blueprintRunId}). Duyệt trong "Chờ duyệt" — duyệt xong Shipyard tự tạo khung dự án.`);
        return PAUSE;
      },
      async generate() {
        j.created = true;
        if (fullstack) fs.mkdirSync(j.dir, { recursive: true });
        for (const part of parts) {
          if (fullstack) ctx.log(`── ${part.role}: ${part.stack.label}`);
          await part.stack.generate(partCtx(part));
          if (!fs.existsSync(part.dir)) throw new Error(`công cụ sinh khung không tạo thư mục ${part.sub || 'dự án'}`);
        }
      },
      overlay() {
        for (const part of parts) writeFiles(part.dir, part.stack.overlay(partCtx(part)));
        if (fullstack) {
          writeFiles(frontend.dir, frontendWiring(ctx, backend, frontend));
          writeFiles(backend.dir, backendNaming(ctx, backend));
          writeFiles(j.dir, fullstackRootFiles(ctx, backend, frontend, now().toISOString()));
          fs.chmodSync(path.join(j.dir, 'dev.sh'), 0o755);
          writeFiles(j.dir, fullstackCiFiles(provider, parts));
          writeFiles(j.dir, teamFiles(ctx, backend.stack, fullstackStarterRules(ctx, backend, frontend)));
        } else {
          writeFiles(j.dir, commonFiles(ctx, stack, now().toISOString()));
          writeFiles(j.dir, ciFiles(provider, stack.id, ctx.options));
          writeFiles(j.dir, teamFiles(ctx, stack));
        }
        if (j.spec.brief) writeFiles(j.dir, { '.shipyard/human/brief.md': `# Mô tả từ người tạo dự án\n\n${j.spec.brief}\n` });
        // Documents approved in the product studio (brief, architecture, UI design + mockups).
        if (j.spec.docs) writeFiles(j.dir, j.spec.docs);
        if (j.architecture) {
          writeFiles(j.dir, {
            'docs/architecture.md': j.architecture,
            '.shipyard/human/requirements.md': `# Yêu cầu ban đầu của dự án\n\nKiến trúc đã duyệt: docs/architecture.md\n\n${j.spec.requirements}\n`,
          });
        }
        // Same peer-dep mode for teammates and CI as the install that produced package-lock.json.
        for (const part of parts) {
          if (fs.existsSync(path.join(part.dir, 'package.json')) && (ctx.tools?.npm?.major || 0) < 10) {
            writeFiles(part.dir, { '.npmrc': 'legacy-peer-deps=true\n' });
          }
        }
      },
      async verify() {
        for (const part of parts) {
          if (fullstack) ctx.log(`── kiểm tra ${part.role}`);
          await part.stack.verify(partCtx(part));
        }
      },
      git: () => initRepo(j.dir, {
        authorName: user.name || user.email.split('@')[0], authorEmail: user.email,
        stackId: fullstack ? `fullstack (${backend.stack.id} + ${frontend.stack.id})` : stack.id, run: ctx.run,
      }),
      async remote() {
        if (!j.remote) await createRemote();
        if (!j.originSet) {
          await ctx.run('git', ['remote', 'add', 'origin', j.remote.cloneUrl], { cwd: j.dir });
          j.originSet = true;
        }
        await pushRepo(j.dir, remotes.authHeader(provider), ctx.run);
      },
      async register() {
        if (!j.project) {
          j.project = await registerProject({ slug: j.spec.slug, name: j.spec.name, repoUrl: j.remote?.cloneUrl || j.dir,
            defaultBranch: 'development' }, j.token);
          ctx.log(`Đã tạo dự án ${j.project?.id || ''}`);
        }
        // The feature workflow chosen in the wizard (Plan → Code → Test, …) — every lane follows it.
        if (j.spec.workflow && setWorkflow && !j.workflowSet) {
          await setWorkflow(j.project.id, j.spec.workflow, j.token);
          j.workflowSet = true;
          ctx.log(`Quy trình: ${j.spec.workflow.filter(w => w.mode !== 'SKIP').map(w => w.step).join(' → ')}`);
        }
        // What lanes do after the code (e.g. the local demo: merge on this machine and run the app).
        if (j.spec.delivery && setDelivery && !j.deliverySet) {
          await setDelivery(j.project.id, j.spec.delivery, j.token);
          j.deliverySet = true;
          if (j.spec.delivery.localMerge) ctx.log('Lane: code xong gộp vào development trên máy và chạy app — không PR, không đẩy lên Git');
        }
      },
      async team() {
        if (!j.setupRunId) {
          j.setupRunId = await setup.start({ projectId: j.project.id, slug: j.spec.slug, name: j.spec.name,
            stack: fullstack ? `fullstack: backend/ ${backend.stack.id} + frontend/ ${frontend.stack.id}` : stack.id,
            dir: j.dir, provider, createdBy: user.id });
        }
        ctx.log(`AI Manager đang soạn luật (run ${j.setupRunId}); xong sẽ có trong "Chờ duyệt".`);
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
        if (await fns[s.id]() === PAUSE) {
          j.stages[s.id] = 'waiting';
          j.status = 'waiting';
          return;
        }
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
      if (j.status !== 'waiting') j.finishedAt = now().toISOString();
      locks.delete(j.spec.slug);
    }
  }

  /** What a paused (architecture-first) job needs to be rebuilt after a dashboard restart. */
  const snapshotOf = j => ({ jobId: j.id, spec: j.spec, dir: j.dir, project: j.project, remote: j.remote || null,
    user: { id: j.user.id, name: j.user.name || '', email: j.user.email } });

  function makeJob({ id, spec, dir, user, token }) {
    const stageList = stagesFor(spec);
    const j = {
      id: id || `scf_${crypto.randomBytes(6).toString('hex')}`, spec, dir, status: 'running', stage: null, stageList,
      stages: Object.fromEntries(stageList.map(s => [s.id, 'pending'])), log: [], abort: new AbortController(),
      tools: tools(), startedAt: now().toISOString(), finishedAt: null, userId: user.id, user, token,
    };
    const log = line => { j.log.push(line); if (j.log.length > MAX_LOG) j.log.splice(0, j.log.length - MAX_LOG); };
    j.ctx = { ...spec, dir, parentDir: root, tools: j.tools, fetchImpl, log,
      run: (cmd, args, opts = {}) => run(cmd, args, { log, signal: j.abort.signal, ...opts }) };
    jobs.set(j.id, j);
    prune();
    return j;
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
      if (spec.archFirst && !blueprint) throw Object.assign(new Error('Chưa bật được bước duyệt kiến trúc'), { status: 503 });
      locks.add(spec.slug);
      const j = makeJob({ spec, dir, user, token });
      j.done = execute(j, user);
      return publicJob(j);
    },
    get: id => publicJob(jobs.get(id)),
    /**
     * Architecture approved: scaffold the paused project with it (the same job when it is still in
     * memory, else rebuilt from the blueprint's snapshot). A failed earlier attempt resumes at its
     * retryable stage, or starts over from `generate` with a clean folder. Throws when the build fails.
     */
    async build(snapshot, architecture) {
      if (locks.has(snapshot.spec.slug)) throw new Error('Dự án này đang được dựng');
      let j = jobs.get(snapshot.jobId);
      if (!j) {
        j = makeJob({ id: snapshot.jobId, spec: snapshot.spec, dir: snapshot.dir, user: snapshot.user, token: null });
        Object.assign(j, { project: snapshot.project, remote: snapshot.remote || undefined });
        for (const s of j.stageList) { j.stages[s.id] = 'pending'; if (s.id === 'generate') break; j.stages[s.id] = 'done'; }
      }
      let from = j.stageList.findIndex(s => s.id === 'generate');
      if (j.status === 'failed' && RETRYABLE.includes(j.stage)) from = j.stageList.findIndex(s => s.id === j.stage);
      else if (j.created) { fs.rmSync(j.dir, { recursive: true, force: true }); j.created = false; j.originSet = false; }
      j.architecture = architecture;
      j.stages.blueprint = 'done';
      locks.add(j.spec.slug);
      j.abort = new AbortController();
      Object.assign(j, { status: 'running', error: null, errorTail: '', finishedAt: null });
      j.ctx.log('── Kiến trúc đã được duyệt — bắt đầu tạo khung dự án');
      j.done = execute(j, j.user, from);
      await j.done;
      if (j.status !== 'done') throw new Error(`Tạo khung dự án lỗi ở bước ${j.stage}: ${j.error}`);
      return { jobId: j.id };
    },
    owner: id => jobs.get(id)?.userId,
    touch(id, token) { const j = jobs.get(id); if (j && token) j.token = token; },
    /** Resume from a failed remote/register stage (session expired, network, repo name taken…). */
    async retry(id, token) {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.status === 'failed' && afterApproval(j)) {
        // The BLUEPRINT run is still waiting to be released: let its runner rebuild and release it.
        j.ctx.log('── Thử dựng lại dự án theo kiến trúc đã duyệt');
        await blueprint.work(j.blueprintRunId);
        return publicJob(j);
      }
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
