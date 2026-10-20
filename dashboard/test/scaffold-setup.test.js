// Phase 4: the AI Manager runner — draft rules, revise with the reviewer's edits, publish on approval.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createSetupRunner, collectDocuments, validateTeam, writeDocuments, parseVerdict, managerPrompt } from '../server/services/scaffold/setup.js';
import { createJobRunner } from '../server/services/scaffold/jobs.js';
import { validateRequest } from '../server/services/scaffold/catalog.js';
import { run as realRun } from '../server/services/scaffold/util.js';
import { platformRouter } from '../server/routes/platform.js';
import express from 'express';

const TEAM = JSON.stringify({ roles: { DEV: { reads: ['rules/project.md', 'rules/dev.md'] } } });
const sh = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' }).stdout.trim();

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-'));
  fs.mkdirSync(path.join(dir, '.shipyard', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.shipyard', 'team.json'), TEAM);
  fs.writeFileSync(path.join(dir, '.shipyard', 'rules', 'project.md'), '# starter');
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@x', '-c', 'commit.gpgsign=false', 'add', '-A'], { cwd: dir });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@x', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'init'], { cwd: dir });
  spawnSync('git', ['branch', 'development'], { cwd: dir });
  return dir;
}

/** Orchestrator stub driven by a list of `next` answers; records calls. */
function fakeOrch(nexts) {
  const o = { calls: [], created: null };
  o.createRun = async b => { o.calls.push(['create', b]); return (o.created = { id: 'run_s1', ...b }); };
  o.next = async () => { o.calls.push(['next']); return nexts.shift() || { mode: 'WAIT' }; };
  o.submit = async (id, b) => { o.calls.push(['submit', b]); return { revisionNo: 1 }; };
  o.release = async (id, s) => { o.calls.push(['release', s]); return {}; };
  return o;
}

/** "claude" that edits the rules like the AI Manager would, then prints its JSON result. */
const fakeClaude = (result, edit = dir => fs.writeFileSync(path.join(dir, '.shipyard', 'rules', 'dev.md'), '# DEV: constructor injection')) =>
  (cmd, args, opts) => {
    if (cmd === 'git') return realRun(cmd, args, opts);
    edit(opts.cwd, args);
    opts.log(JSON.stringify({ type: 'result', is_error: false, result }));
    return Promise.resolve();
  };

let state, dirs = [];
const mem = () => ({ load: () => JSON.parse(JSON.stringify(state)), save: s => { state = s; } });
beforeEach(() => { state = {}; });
afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); dirs = []; });
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise(r => setTimeout(r, 20)); } };

describe('documents', () => {
  it('collects rule files + team.json and refuses anything else', () => {
    const dir = repo(); dirs.push(dir);
    fs.writeFileSync(path.join(dir, '.shipyard', 'rules', 'Bad Name.md'), 'x');
    fs.writeFileSync(path.join(dir, '.shipyard', 'rules', 'dev.md'), 'D');
    expect(Object.keys(collectDocuments(dir))).toEqual(['dev.md', 'project.md', 'team.json']);
  });
  it('validates team.json reads', () => {
    expect(() => validateTeam('{"roles":{"DEV":{"reads":["human/brief.md"]}}}')).toThrow(/rules\/<tên>\.md/);
    expect(() => validateTeam('nope')).toThrow(/JSON/);
  });
  it('writes approved docs and prunes rules that were dropped', () => {
    const dir = repo(); dirs.push(dir);
    fs.writeFileSync(path.join(dir, '.shipyard', 'rules', 'old.md'), 'gone');
    writeDocuments(dir, { 'project.md': 'P2', 'team.json': TEAM, '../evil.md': 'x' }, { prune: true });
    expect(fs.readdirSync(path.join(dir, '.shipyard', 'rules'))).toEqual(['project.md']);
    expect(fs.existsSync(path.join(dir, '.shipyard', 'evil.md'))).toBe(false);
  });
  it('parses the verdict line', () => {
    expect(parseVerdict(JSON.stringify({ result: 'Đã thêm 5 luật\nROLE-STEP: DONE rules' }))).toEqual({ ok: true, summary: 'Đã thêm 5 luật' });
    expect(parseVerdict(JSON.stringify({ result: 'ROLE-STEP: BLOCKED thiếu tài liệu' })).error).toContain('thiếu tài liệu');
    expect(parseVerdict(JSON.stringify({ result: 'xong' })).ok).toBe(false);
    expect(managerPrompt({ name: 'Kho', slug: 'kho', stack: 'ts-nestjs' }, { mode: 'REVISE', revision: 2, feedback: 'thêm luật tên bảng' })).toContain('thêm luật tên bảng');
  });
});

describe('setup runner', () => {
  it('starts a SETUP run on development, drafts with the agent and submits for review', async () => {
    const dir = repo(); dirs.push(dir);
    const orch = fakeOrch([{ mode: 'WORK', step: 'MANAGER', revision: 1 }]);
    const calls = [];
    const run = (cmd, args, opts) => { if (cmd !== 'git') calls.push(args); return fakeClaude('Soạn 6 luật\nROLE-STEP: DONE rules')(cmd, args, opts); };
    const s = createSetupRunner({ orch, run, host: 'h', claudeBin: 'claude', agentPrompt: () => 'AGENT', ...mem() });
    const id = await s.start({ projectId: 'p1', slug: 'kho', name: 'Kho', stack: 'ts-nestjs', dir, provider: 'local', createdBy: 'u1' });
    expect(orch.created).toMatchObject({ kind: 'SETUP', laneRef: 'h:setup:kho', projectId: 'p1' });
    await until(() => s.get(id)?.status === 'awaiting-review');
    expect(sh(dir, 'branch', '--show-current')).toBe('development');
    const sub = orch.calls.find(c => c[0] === 'submit')[1];
    expect(sub.summary).toBe('Soạn 6 luật');
    expect(sub.documents['dev.md']).toBe('# DEV: constructor injection');
    expect(sub.documents['team.json']).toBe(TEAM);
    expect(calls[0]).toEqual(expect.arrayContaining(['--disallowedTools', 'Bash,WebFetch,WebSearch', '--permission-mode', 'acceptEdits', '--append-system-prompt', 'AGENT']));
    expect(s.owns('h:setup:kho')).toBe(true);
    expect(s.owns('h:lane1')).toBe(false);
  });

  it('applies the reviewer edits before redrafting', async () => {
    const dir = repo(); dirs.push(dir);
    state = { run_s1: { dir, slug: 'kho', name: 'Kho', stack: 'x', provider: 'local' } };
    let seen = '';
    const orch = fakeOrch([{ mode: 'REVISE', revision: 2, feedback: 'ngắn hơn', editedDocuments: { 'project.md': '# HUMAN EDIT' } }]);
    const s = createSetupRunner({ orch, run: fakeClaude('ok\nROLE-STEP: DONE rules', d => { seen = fs.readFileSync(path.join(d, '.shipyard/rules/project.md'), 'utf8'); }), agentPrompt: () => '', ...mem() });
    await s.work('run_s1');
    expect(seen).toBe('# HUMAN EDIT');
    expect(s.get('run_s1').status).toBe('awaiting-review');
  });

  it('records an error when the agent does not finish, and can retry', async () => {
    const dir = repo(); dirs.push(dir);
    state = { run_s1: { dir, slug: 'kho', name: 'Kho', stack: 'x' } };
    const orch = fakeOrch([{ mode: 'WORK', revision: 1 }, { mode: 'WORK', revision: 1 }]);
    let verdict = 'ROLE-STEP: BLOCKED cần thêm tài liệu';
    const s = createSetupRunner({ orch, run: (c, a, o) => fakeClaude(verdict)(c, a, o), agentPrompt: () => '', ...mem() });
    await s.work('run_s1');
    expect(s.get('run_s1')).toMatchObject({ status: 'error', error: 'AI Manager bị chặn: cần thêm tài liệu' });
    verdict = 'xong\nROLE-STEP: DONE rules';
    await s.work('run_s1');
    expect(s.get('run_s1').status).toBe('awaiting-review');
  });

  it('on approval commits the approved rules to development and releases the run', async () => {
    const dir = repo(); dirs.push(dir);
    sh(dir, 'switch', '-q', 'development');
    state = { run_s1: { dir, slug: 'kho', name: 'Kho', stack: 'x', provider: 'local' } };
    const approved = { 'project.md': '# APPROVED', 'team.json': TEAM };
    const orch = fakeOrch([{ mode: 'RELEASE', priorApproved: { MANAGER: approved } }]);
    const s = createSetupRunner({ orch, run: fakeClaude(''), ...mem() });
    await s.work('run_s1');
    expect(s.get('run_s1').status).toBe('done');
    expect(sh(dir, 'show', 'development:.shipyard/rules/project.md')).toBe('# APPROVED');
    expect(sh(dir, 'log', '-1', '--format=%s', 'development')).toBe('docs(rules): project AI-team rules approved in Shipyard');
    expect(sh(dir, 'log', '-1', '--format=%s', 'main')).toBe('init');
    expect(orch.calls.at(-1)[0]).toBe('release');
  });
});

describe('wizard job', () => {
  it('hands the new project to the AI Manager and writes the brief into human/', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scj-')); dirs.push(root);
    const ALL = { node: { ok: true, major: 22 }, npm: { ok: true, major: 10 }, uv: { ok: true }, git: { ok: true }, unzip: { ok: true }, java: { ok: true, major: 21 } };
    const started = [];
    const setup = { start: async a => { started.push(a); return 'run_s9'; } };
    const fake = (cmd, args, opts) => (cmd === 'git' ? realRun(cmd, args, opts) : Promise.resolve());
    const r = createJobRunner({ root, tools: () => ALL, run: fake, setup, registerProject: async () => ({ id: 'proj_9' }) });
    const spec = validateRequest({ name: 'Kho', slug: 'kho-app', stack: 'python-fastapi', options: { db: 'none' }, brief: 'Công ty dùng chuẩn REST nội bộ' }, ALL);
    const j = r.start(spec, { id: 'u1', email: 'a@b.c' }, 't');
    await r.wait(j.id);
    expect(r.get(j.id)).toMatchObject({ status: 'done', setupRunId: 'run_s9' });
    expect(started[0]).toMatchObject({ projectId: 'proj_9', slug: 'kho-app', provider: 'local', createdBy: 'u1' });
    expect(sh(path.join(root, 'kho-app'), 'show', 'HEAD:.shipyard/human/brief.md')).toContain('chuẩn REST nội bộ');
  });
});

describe('approval proxy', () => {
  it('routes decisions on a setup run to the AI Manager runner instead of a lane', async () => {
    const worked = [];
    const setup = { owns: ref => ref.startsWith('h:setup:'), work: id => worked.push(id) };
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { runId: 'run_s1', laneRef: 'h:setup:kho', mode: 'RELEASE' } }) });
    const app = express(); app.use(express.json());
    app.use(platformRouter({ gatewayUrl: 'http://gw', fetchImpl, hostname: 'h', setup, sessions: {} }));
    const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/platform/approvals/apr_1/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'APPROVE' }) });
    srv.close();
    expect((await r.json()).resumed).toBe(true);
    expect(worked).toEqual(['run_s1']);
  });
});
