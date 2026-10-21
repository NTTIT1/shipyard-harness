// Architecture first: the wizard registers the project, pauses for the BLUEPRINT review, and only
// scaffolds (with docs/architecture.md) once a human approved the architecture.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createBlueprintRunner, requestDoc, architectPrompt } from '../server/services/scaffold/blueprint.js';
import { createJobRunner, stagesFor, stackLines } from '../server/services/scaffold/jobs.js';
import { validateRequest } from '../server/services/scaffold/catalog.js';
import { run as realRun } from '../server/services/scaffold/util.js';

const ALL = { java: { ok: true, major: 21, version: '21' }, node: { ok: true, major: 22 }, npm: { ok: true, major: 10 },
  git: { ok: true }, uv: { ok: true }, python: { ok: true, major: 3, minor: 12 }, mvn: { ok: true } };
const REQ = 'Hệ thống quản lý kho cho 3 chi nhánh: nhập, xuất, kiểm kê, báo cáo tồn.';
const spec = (slug, over = {}) => validateRequest({ name: 'Kho', slug, stack: 'python-fastapi', options: { db: 'sqlite' },
  aiTeam: false, archFirst: true, requirements: REQ, ...over }, ALL);
const user = { id: 'u1', email: 'lead@acme.io', name: 'Lead' };
const ARCH = '# Kiến trúc kho\n\n## Quyết định\n- FastAPI + SQLite cho bản đầu';

/** Orchestrator stub driven by a list of `next` answers; records calls. */
function fakeOrch(nexts) {
  const o = { calls: [] };
  o.createRun = async b => { o.calls.push(['create', b]); return { id: 'run_bp1', ...b }; };
  o.next = async () => { o.calls.push(['next']); return nexts.shift() || { mode: 'WAIT' }; };
  o.submit = async (id, b, step) => { o.calls.push(['submit', b, step]); return { revisionNo: 1 }; };
  o.release = async (id, s) => { o.calls.push(['release', s]); return {}; };
  return o;
}

/** Fake tools: real git, "claude" writes architecture.md, everything else is a no-op. */
const fakeRun = (onClaude = dir => fs.writeFileSync(path.join(dir, 'architecture.md'), ARCH)) => (cmd, args, opts) => {
  if (cmd === 'git') return realRun(cmd, args, opts);
  if (cmd.endsWith('claude')) {
    onClaude(opts.cwd, args);
    opts.log(JSON.stringify({ type: 'result', is_error: false, result: 'Kiến trúc kho 3 chi nhánh\nROLE-STEP: DONE architecture.md' }));
    return Promise.resolve();
  }
  opts.log(`(fake) ${cmd} ${args.join(' ')}`);
  return Promise.resolve();
};

let root, work, state;
const mem = () => ({ load: () => JSON.parse(JSON.stringify(state)), save: s => { state = s; } });
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-root-'));
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-work-'));
  state = {};
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(work, { recursive: true, force: true }); });
const until = async (fn, ms = 5000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise(r => setTimeout(r, 20)); } };

describe('request', () => {
  it('architecture first needs a real description of the system', () => {
    expect(() => spec('kho-a', { requirements: 'ngắn' })).toThrow(/20 ký tự/);
    expect(spec('kho-a')).toMatchObject({ archFirst: true, requirements: REQ });
    expect(validateRequest({ name: 'K', slug: 'kho-b', stack: 'python-fastapi', options: { db: 'sqlite' }, requirements: REQ }, ALL))
      .not.toHaveProperty('requirements');
  });
  it('registers and pauses before anything is generated; the remote repo is created empty first', () => {
    expect(stagesFor(spec('kho-a')).map(s => s.id)).toEqual(['register', 'blueprint', 'generate', 'overlay', 'verify', 'git']);
    const remote = { ...spec('kho-a'), git: { provider: 'github', owner: 'acme', visibility: 'private' }, aiTeam: true };
    expect(stagesFor(remote).map(s => s.id)).toEqual(['reserve', 'register', 'blueprint', 'generate', 'overlay', 'verify', 'git', 'remote', 'team']);
    expect(stagesFor({ ...spec('kho-a'), archFirst: false }).map(s => s.id)).toEqual(['generate', 'overlay', 'verify', 'git', 'register']);
  });
  it('tells the architect what was chosen', () => {
    expect(stackLines(spec('kho-a'))[0]).toMatch(/^Python · FastAPI \(.*SQLite/);
    const doc = requestDoc({ name: 'Kho', slug: 'kho-a', stackLines: ['Python · FastAPI'], requirements: REQ });
    expect(doc).toContain('## Công nghệ đã chọn (cố định)\n- Python · FastAPI');
    expect(doc).toContain(REQ);
    expect(architectPrompt({ name: 'Kho', slug: 'kho-a' }, { mode: 'REVISE', revision: 2, feedback: 'thêm phân quyền' })).toContain('thêm phân quyền');
  });
});

describe('architecture-first project', () => {
  it('drafts, waits for approval, then scaffolds with docs/architecture.md and releases the run', async () => {
    const orch = fakeOrch([{ mode: 'WORK', revision: 1 }]);
    const run = fakeRun();
    const bp = createBlueprintRunner({ orch, run, claudeBin: '/x/claude', ...mem(), workRoot: () => work, host: 'h1' });
    const registered = [];
    const jobs = createJobRunner({ root, tools: () => ALL, run, blueprint: bp,
      registerProject: async b => { registered.push(b); return { id: 'proj_k' }; } });
    bp.setBuilder((entry, a) => jobs.build(entry.snapshot, a));

    const j = jobs.start(spec('kho-a'), user, 'tok');
    await jobs.wait(j.id);
    let pub = jobs.get(j.id);
    expect(pub).toMatchObject({ status: 'waiting', blueprintRunId: 'run_bp1', project: { id: 'proj_k' } });
    expect(pub.stages).toMatchObject({ register: 'done', blueprint: 'waiting', generate: 'pending' });
    expect(fs.existsSync(path.join(root, 'kho-a'))).toBe(false);
    expect(registered[0]).toMatchObject({ slug: 'kho-a', repoUrl: path.join(root, 'kho-a') });
    expect(orch.calls[0][1]).toMatchObject({ projectId: 'proj_k', kind: 'BLUEPRINT', laneRef: 'h1:blueprint:kho-a' });
    expect(bp.owns('h1:blueprint:kho-a')).toBe(true);
    expect(bp.owns('h1:setup:kho-a')).toBe(false);

    await until(() => state.run_bp1?.status === 'awaiting-review');
    const submit = orch.calls.find(c => c[0] === 'submit');
    expect(submit[2]).toBe('BLUEPRINT');
    expect(submit[1].documents).toEqual({ 'architecture.md': ARCH });
    expect(fs.readFileSync(path.join(work, 'kho-a', 'request.md'), 'utf8')).toContain(REQ);

    // The tech lead approves → RELEASE: the paused job generates the project with the approved text.
    const approved = `${ARCH}\n\n(sửa bởi tech lead)`;
    orch.next = async () => ({ mode: 'RELEASE', priorApproved: { BLUEPRINT: { 'architecture.md': approved } } });
    await bp.work('run_bp1');
    expect(state.run_bp1.status).toBe('done');
    expect(orch.calls.at(-1)[0]).toBe('release');
    pub = jobs.get(j.id);
    expect(pub.status).toBe('done');
    const dir = path.join(root, 'kho-a');
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' }).stdout.trim();
    expect(git('show', 'HEAD:docs/architecture.md')).toBe(approved);
    expect(git('show', 'HEAD:.shipyard/human/requirements.md')).toContain(REQ);
    expect(registered).toHaveLength(1);
  });

  it('a reviewer edit is the base of the redraft; a failed draft is an error to retry', async () => {
    let seen = null;
    const orch = fakeOrch([{ mode: 'REVISE', revision: 2, feedback: 'thêm phân quyền', editedDocuments: { 'architecture.md': '# bản người sửa' } }]);
    const bp = createBlueprintRunner({ orch, claudeBin: '/x/claude', ...mem(), workRoot: () => work,
      run: fakeRun(dir => { seen = fs.readFileSync(path.join(dir, 'architecture.md'), 'utf8'); }) });
    state.run_x = { slug: 'kho-c', name: 'Kho', stackLines: ['x'], requirements: REQ, workDir: path.join(work, 'kho-c') };
    await bp.work('run_x');
    expect(seen).toBe('# bản người sửa');
    expect(orch.calls.find(c => c[0] === 'submit')[1].documents['architecture.md']).toBe('# bản người sửa');

    const bad = createBlueprintRunner({ orch: fakeOrch([{ mode: 'WORK', revision: 1 }]), claudeBin: '/x/claude', ...mem(),
      workRoot: () => work, run: fakeRun(() => {}) });
    state.run_y = { slug: 'kho-d', name: 'Kho', stackLines: ['x'], requirements: REQ, workDir: path.join(work, 'kho-d') };
    await bad.work('run_y');
    expect(state.run_y).toMatchObject({ status: 'error', error: expect.stringMatching(/architecture.md/) });
  });

  it('after a dashboard restart the approval rebuilds the job from its snapshot', async () => {
    const orch = fakeOrch([{ mode: 'WAIT' }]);
    const run = fakeRun();
    const bp1 = createBlueprintRunner({ orch, run, claudeBin: '/x/claude', ...mem(), workRoot: () => work });
    const jobs1 = createJobRunner({ root, tools: () => ALL, run, blueprint: bp1, registerProject: async () => ({ id: 'proj_r' }) });
    const j = jobs1.start(spec('kho-r'), user, 'tok');
    await jobs1.wait(j.id);
    expect(jobs1.get(j.id).status).toBe('waiting');

    // "restart": a fresh job runner that never saw the job, same persisted blueprint state.
    const bp2 = createBlueprintRunner({ orch, run, claudeBin: '/x/claude', ...mem(), workRoot: () => work });
    const jobs2 = createJobRunner({ root, tools: () => ALL, run, blueprint: bp2, registerProject: async () => { throw new Error('no second register'); } });
    bp2.setBuilder((entry, a) => jobs2.build(entry.snapshot, a));
    orch.next = async () => ({ mode: 'RELEASE', priorApproved: { BLUEPRINT: { 'architecture.md': ARCH } } });
    await bp2.work('run_bp1');
    expect(state.run_bp1.status).toBe('done');
    const rebuilt = jobs2.get(j.id);
    expect(rebuilt).toMatchObject({ status: 'done', project: { id: 'proj_r' } });
    expect(rebuilt.stages).toMatchObject({ register: 'done', blueprint: 'done', git: 'done' });
    expect(fs.readFileSync(path.join(root, 'kho-r', 'docs', 'architecture.md'), 'utf8')).toBe(ARCH);
  });

  it('a failed build leaves the run unreleased; retry rebuilds from a clean folder and releases', async () => {
    const orch = fakeOrch([{ mode: 'WAIT' }]);
    let fail = true;
    const base = fakeRun();
    const run = (cmd, args, opts) => (fail && cmd === 'uv' ? Promise.reject(Object.assign(new Error('pytest đỏ'), { tail: 'x' })) : base(cmd, args, opts));
    const bp = createBlueprintRunner({ orch, run, claudeBin: '/x/claude', ...mem(), workRoot: () => work });
    const jobs = createJobRunner({ root, tools: () => ALL, run, blueprint: bp, registerProject: async () => ({ id: 'proj_f' }) });
    bp.setBuilder((entry, a) => jobs.build(entry.snapshot, a));
    const j = jobs.start(spec('kho-f'), user, 'tok');
    await jobs.wait(j.id);
    orch.next = async () => ({ mode: 'RELEASE', priorApproved: { BLUEPRINT: { 'architecture.md': ARCH } } });
    await bp.work('run_bp1');
    expect(state.run_bp1).toMatchObject({ status: 'error', error: expect.stringMatching(/verify/) });
    expect(orch.calls.some(c => c[0] === 'release')).toBe(false);
    const failed = jobs.get(j.id);
    expect(failed).toMatchObject({ status: 'failed', retryable: true });

    fail = false;
    const after = await jobs.retry(j.id, 'tok');
    expect(after.status).toBe('done');
    expect(state.run_bp1.status).toBe('done');
    expect(orch.calls.filter(c => c[0] === 'release')).toHaveLength(1);
  });
});

describe('workflow from the wizard', () => {
  it('is saved on the project right after it is registered, with the creator\'s token', async () => {
    const pct = [{ step: 'ARCH', mode: 'REQUIRED' }, { step: 'PM', mode: 'SKIP' }, { step: 'BA', mode: 'SKIP' },
      { step: 'DESIGN', mode: 'SKIP' }, { step: 'DEV', mode: 'AUTO' }, { step: 'TEST', mode: 'AUTO' }];
    const set = [];
    const orch = fakeOrch([{ mode: 'WAIT' }]);
    const bp = createBlueprintRunner({ orch, run: fakeRun(), claudeBin: '/x/claude', ...mem(), workRoot: () => work });
    const jobs = createJobRunner({ root, tools: () => ALL, run: fakeRun(), blueprint: bp,
      registerProject: async () => ({ id: 'proj_w' }), setWorkflow: async (...a) => { set.push(a); } });
    const j = jobs.start(spec('kho-w', { workflow: pct }), user, 'tok-w');
    await jobs.wait(j.id);
    expect(set).toEqual([['proj_w', pct, 'tok-w']]);
    expect(jobs.get(j.id).log.some(l => l.includes('Quy trình: ARCH → DEV → TEST'))).toBe(true);
  });
});
