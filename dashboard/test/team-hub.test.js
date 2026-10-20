// Phase 5: the "Đội AI" tab — view rules, propose edits, upload material, redraft, adopt an existing repo.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import express from 'express';
import { createTeamHub, providerFor, HUMAN_NAME } from '../server/services/scaffold/teamhub.js';
import { createSetupRunner } from '../server/services/scaffold/setup.js';
import { teamRouter } from '../server/routes/team.js';

const ID = ['-c', 'user.name=t', '-c', 'user.email=t@x', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...a) => {
  const r = spawnSync('git', [...ID, ...a], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const TEAM = { roles: { DEV: { label: 'AI Dev', reads: ['rules/project.md', 'rules/dev.md'], skills: [] }, TEST: { reads: ['rules/project.md'], skills: [] } } };

/** A bare "origin" on branch `develop`, optionally already carrying an AI team. */
function origin({ team = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-'));
  const work = path.join(tmp, 'seed');
  fs.mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(work, 'pom.xml'), '<project/>');
  if (team) {
    fs.mkdirSync(path.join(work, '.shipyard', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(work, '.shipyard', 'team.json'), JSON.stringify(TEAM));
    fs.writeFileSync(path.join(work, '.shipyard', 'rules', 'project.md'), '# chung');
    fs.writeFileSync(path.join(work, '.shipyard', 'rules', 'dev.md'), '# dev');
    fs.mkdirSync(path.join(work, '.claude', 'skills', 'spring-api'), { recursive: true });
    fs.writeFileSync(path.join(work, '.claude', 'skills', 'spring-api', 'SKILL.md'), '---\nname: spring-api\n---\n');
  }
  git(work, 'add', '-A');
  git(work, 'commit', '-qm', 'init');
  git(work, 'branch', 'develop');
  const bare = path.join(tmp, 'origin.git');
  git(tmp, 'clone', '-q', '--bare', work, bare);
  return { tmp, bare, root: path.join(tmp, 'ws') };
}

/** In-memory stand-in for the setup runner. */
function fakeSetup() {
  const runs = [];
  return {
    runs,
    forProject: pid => runs.filter(r => r.projectId === pid).slice().reverse(),
    async start(args) { const runId = `run_${runs.length + 1}`; runs.push({ runId, status: 'queued', ...args }); return runId; },
    work: () => {}, isBusy: () => false,
  };
}
const providers = { list: () => ({}), configured: () => false, authHeader: () => 'x' };
const project = bare => ({ id: 'p1', slug: 'hrm', name: 'HRM', repoUrl: bare, defaultBranch: 'develop' });
const user = { id: 'u1', email: 'lead@x' };

describe('team hub', () => {
  let o, setup, hub;
  beforeEach(() => { setup = fakeSetup(); });

  it('clones an existing repo and reports it has no AI team yet', async () => {
    o = origin();
    hub = createTeamHub({ setup, providers, root: o.root });
    const s = await hub.state(project(o.bare));
    expect(s.adopted).toBe(false);
    expect(s.branch).toBe('develop');
    expect(s.dir).toBe(path.join(o.root, '.team', 'hrm'));
    expect(s.provider).toBe('host');
    expect(git(s.dir, 'branch', '--show-current')).toBe('develop');
  });

  it('adopt writes the generic starter and asks the AI Manager to draft from the real code', async () => {
    o = origin();
    hub = createTeamHub({ setup, providers, root: o.root });
    const { runId } = await hub.adopt(project(o.bare), user, { note: 'dùng MapStruct' });
    expect(runId).toBe('run_1');
    const r = setup.runs[0];
    expect(r).toMatchObject({ adopt: true, branch: 'develop', provider: 'host', note: 'dùng MapStruct', createdBy: 'u1' });
    expect(fs.existsSync(path.join(r.dir, '.shipyard', 'team.json'))).toBe(true);
    expect(fs.readFileSync(path.join(r.dir, '.shipyard', 'rules', 'project.md'), 'utf8')).toContain('`develop`');
    await expect(hub.adopt(project(o.bare), user)).rejects.toThrow(/chờ soạn\/duyệt/);
  });

  it('shows the approved rules, the read matrix and the repo skills from the integration branch', async () => {
    o = origin({ team: true });
    hub = createTeamHub({ setup, providers, root: o.root });
    const s = await hub.state(project(o.bare));
    expect(s.adopted).toBe(true);
    expect(Object.keys(s.rules)).toEqual(['dev.md', 'project.md']);
    expect(s.team.roles.DEV.reads).toContain('rules/dev.md');
    expect(s.skills).toEqual(['spring-api']);
    await expect(hub.adopt(project(o.bare), user)).rejects.toThrow(/đã có đội AI/);
  });

  it('propose sends a person\'s edit for review with the full document set', async () => {
    o = origin({ team: true });
    hub = createTeamHub({ setup, providers, root: o.root });
    const team = structuredClone(TEAM);
    team.roles.TEST.reads.push('rules/test.md');
    team.roles.DEV.skills = ['spring-api'];
    await hub.propose(project(o.bare), user, { rules: { 'test.md': '# test', 'dev.md': '# dev v2' }, team });
    const docs = setup.runs[0].documents;
    expect(Object.keys(docs).sort()).toEqual(['dev.md', 'project.md', 'team.json', 'test.md']);
    expect(docs['dev.md']).toBe('# dev v2');
    expect(JSON.parse(docs['team.json']).roles.DEV.skills).toEqual(['spring-api']);
    expect(setup.runs[0].note).toMatch(/lead@x/);
  });

  it('propose refuses broken edits', async () => {
    o = origin({ team: true });
    hub = createTeamHub({ setup, providers, root: o.root });
    const p = project(o.bare);
    await expect(hub.propose(p, user, { rules: { 'dev.md': null } })).rejects.toThrow(/DEV đọc rules\/dev.md/);
    await expect(hub.propose(p, user, { rules: { 'project.md': null } })).rejects.toThrow(/project.md/);
    await expect(hub.propose(p, user, { rules: { '../x.md': 'x' } })).rejects.toThrow(/không hợp lệ/);
    await expect(hub.propose(p, user, { team: { roles: { DEV: { reads: ['../../etc/passwd'] } } } })).rejects.toThrow(/rules\/<tên>.md/);
    await expect(hub.propose(p, user, { team: { roles: { DEV: { reads: [], skills: ['a b'] } } } })).rejects.toThrow(/skill/);
    expect(setup.runs).toHaveLength(0);
  });

  it('human material: upload, list (uncommitted), read, delete; names are checked', async () => {
    o = origin({ team: true });
    hub = createTeamHub({ setup, providers, root: o.root });
    const p = project(o.bare);
    const list = await hub.putHuman(p, 'Quy định công ty.md', Buffer.from('# chuẩn').toString('base64'));
    expect(list).toEqual([{ name: 'Quy định công ty.md', size: 9, committed: false }]);
    expect(fs.readFileSync(await hub.readHuman(p, 'Quy định công ty.md'), 'utf8')).toBe('# chuẩn');
    await expect(hub.putHuman(p, '../evil.md', 'eA==')).rejects.toThrow(/không hợp lệ/);
    await expect(hub.putHuman(p, 'run.sh', 'eA==')).rejects.toThrow(/không hợp lệ/);
    await expect(hub.putHuman(p, 'a.md', '')).rejects.toThrow(/rỗng/);
    expect(await hub.deleteHuman(p, 'Quy định công ty.md')).toEqual([]);
    expect(HUMAN_NAME.test('.hidden.md')).toBe(false);
  });

  it('redraft passes the note; only one open run at a time; retry re-works it', async () => {
    o = origin({ team: true });
    hub = createTeamHub({ setup, providers, root: o.root });
    const p = project(o.bare);
    await hub.redraft(p, user, { note: 'Đã thêm tài liệu kiến trúc' });
    expect(setup.runs[0].note).toBe('Đã thêm tài liệu kiến trúc');
    expect(setup.runs[0].documents).toBeUndefined();
    await expect(hub.redraft(p, user)).rejects.toThrow(/chờ soạn\/duyệt/);
    let worked = null;
    setup.work = id => { worked = id; };
    expect(hub.retry(p)).toEqual({ runId: 'run_1' });
    expect(worked).toBe('run_1');
    setup.runs[0].status = 'done';
    expect(() => hub.retry(p)).toThrow(/Không có/);
  });

  it('picks the configured provider for its host', () => {
    const ps = { list: () => ({ gitlab: { url: 'https://git.acme.vn' } }), configured: id => id !== 'github' };
    expect(providerFor('https://git.acme.vn/a/b.git', ps)).toBe('gitlab');
    expect(providerFor('https://github.com/a/b.git', ps)).toBe('host');
    expect(providerFor('https://github.com/a/b.git', { ...ps, configured: () => true })).toBe('github');
  });
});

describe('team hub + real setup runner', () => {
  it('a person\'s edit is submitted without the AI, and approval pushes it to the project branch', async () => {
    const o = origin({ team: true });
    const state = {};
    const orch = { calls: [], nexts: [{ mode: 'WORK', revision: 1 }] };
    orch.createRun = async b => { orch.calls.push(['create', b]); return { id: 'run_x' }; };
    orch.next = async () => orch.nexts.shift() || { mode: 'WAIT' };
    orch.submit = async (_id, b) => { orch.calls.push(['submit', b]); };
    orch.release = async () => { orch.calls.push(['release']); };
    const setup = createSetupRunner({ orch, providers, host: 'h', claudeBin: '/bin/false',
      load: () => structuredClone(state), save: s => Object.assign(state, s) });
    const hub = createTeamHub({ setup, providers, root: o.root });
    const p = project(o.bare);
    await hub.putHuman(p, 'brief.md', Buffer.from('tài liệu').toString('base64'));
    await hub.propose(p, user, { rules: { 'dev.md': '# dev: constructor injection' } });
    while (setup.isBusy('run_x')) await new Promise(r => setTimeout(r, 20));
    expect(orch.calls[0][1]).toMatchObject({ kind: 'SETUP', laneRef: 'h:setup:hrm', title: 'Sửa luật đội AI — HRM' });
    const submitted = orch.calls.find(c => c[0] === 'submit')[1];
    expect(submitted.documents['dev.md']).toBe('# dev: constructor injection');
    expect(state.run_x.status).toBe('awaiting-review');

    // Approved (with the documents as submitted) → commit + push to `develop`.
    orch.nexts.push({ mode: 'RELEASE', priorApproved: { MANAGER: submitted.documents } });
    await setup.work('run_x');
    expect(state.run_x.status).toBe('done');
    expect(git(o.bare, 'show', 'develop:.shipyard/rules/dev.md')).toBe('# dev: constructor injection');
    expect(git(o.bare, 'show', 'develop:.shipyard/human/brief.md')).toBe('tài liệu');
    expect(orch.calls.at(-1)).toEqual(['release']);
  });
});

describe('team routes', () => {
  const app = (roles, role = 'USER', hub = {}) => {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => { req.user = { id: 'u1', email: 'a@x', role }; next(); });
    a.use(teamRouter({ authEnabled: true, providers, setup: fakeSetup(), lookup: async id => {
      if (id === 'nope') throw Object.assign(new Error('Không tìm thấy dự án'), { status: 404 });
      return { id, slug: 's', name: 'S', currentUserRoles: roles };
    }, hub: { state: async () => ({ adopted: true }), redraft: async () => ({ runId: 'r1' }), ...hub } }));
    return a;
  };
  const call = async (a, method, url, body) => {
    const srv = a.listen(0);
    try {
      const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    } finally { srv.close(); }
  };

  it('members can view; only OWNER/MAINTAINER/TECH_LEAD/SYS_ADMIN can change', async () => {
    expect(await call(app(['DEVELOPER']), 'GET', '/api/team/p1')).toEqual({ status: 200, body: { adopted: true, canManage: false } });
    expect((await call(app(['DEVELOPER']), 'POST', '/api/team/p1/redraft', {})).status).toBe(403);
    expect((await call(app(['TECH_LEAD']), 'POST', '/api/team/p1/redraft', {})).status).toBe(202);
    expect((await call(app([], 'SYS_ADMIN'), 'POST', '/api/team/p1/redraft', {})).status).toBe(202);
    expect((await call(app(['OWNER']), 'GET', '/api/team/nope')).status).toBe(404);
  });
});

describe('team hub + skill catalog', () => {
  it('a suggested skill the repo lacks is added as .claude/skills/<id>/SKILL.md on approval', async () => {
    const o = origin({ team: true });
    const setup = fakeSetup();
    const catalog = [{ id: 'jpa-safety', label: 'JPA', desc: 'Transaction an toàn', roles: ['DEV'], content: '# JPA' }];
    const hub = createTeamHub({ setup, providers, root: o.root, skillCatalog: catalog });
    const p = project(o.bare);
    expect((await hub.state(p)).skillCatalog).toEqual([{ id: 'jpa-safety', label: 'JPA', desc: 'Transaction an toàn', roles: ['DEV'] }]);
    const team = structuredClone(TEAM);
    team.roles.DEV.skills = ['spring-api', 'jpa-safety'];
    await hub.propose(p, user, { team });
    const r = setup.runs[0];
    expect(Object.keys(r.skillFiles)).toEqual(['.claude/skills/jpa-safety/SKILL.md']);
    expect(r.skillFiles['.claude/skills/jpa-safety/SKILL.md']).toContain('name: jpa-safety');
    expect(r.note).toMatch(/jpa-safety/);
    r.status = 'done';
    team.roles.DEV.skills = ['made-up'];
    await expect(hub.propose(p, user, { team })).rejects.toThrow(/không có trong repo/);
  });
});

it('the runner commits catalog skill files together with the approved rules', async () => {
  const o = origin({ team: true });
  const dir = path.join(o.tmp, 'clone');
  git(o.tmp, 'clone', '-q', '-b', 'develop', o.bare, dir);
  const docs = { 'project.md': '# chung', 'dev.md': '# dev', 'team.json': JSON.stringify(TEAM) };
  const state = { run_k: { projectId: 'p1', slug: 'hrm', name: 'HRM', dir, branch: 'develop', provider: 'host', status: 'awaiting-review',
    skillFiles: { '.claude/skills/jpa-safety/SKILL.md': '---\nname: jpa-safety\n---\n', '../evil/SKILL.md': 'x' } } };
  const orch = { next: async () => ({ mode: 'RELEASE', priorApproved: { MANAGER: docs } }), release: async () => {} };
  const setup = createSetupRunner({ orch, providers, host: 'h', load: () => structuredClone(state), save: s => Object.assign(state, s) });
  await setup.work('run_k');
  expect(state.run_k.status).toBe('done');
  expect(git(o.bare, 'show', 'develop:.claude/skills/jpa-safety/SKILL.md')).toContain('jpa-safety');
  expect(fs.existsSync(path.join(o.tmp, 'evil'))).toBe(false);
});
