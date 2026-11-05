// Feedback item 6: releases frozen from the integration branch, promoted UAT → Production.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import express from 'express';
import { createReleaseManager, normalizeSettings, nextVersion, envGate, draftNotes, githubRepo } from '../server/services/releases.js';
import { releasesRouter } from '../server/routes/releases.js';

const ID = ['-c', 'user.name=t', '-c', 'user.email=t@x', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...a) => {
  const r = spawnSync('git', [...ID, ...a], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** A bare origin with `development` ahead of `main`, and no `uat` branch yet. */
function origin() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
  const work = path.join(tmp, 'seed');
  fs.mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(work, 'a.txt'), 'v0');
  git(work, 'add', '-A'); git(work, 'commit', '-qm', 'init');
  git(work, 'checkout', '-qb', 'development');
  fs.writeFileSync(path.join(work, 'b.txt'), 'feature');
  git(work, 'add', '-A'); git(work, 'commit', '-qm', 'feat: nghỉ phép');
  const bare = path.join(tmp, 'origin.git');
  git(tmp, 'clone', '-q', '--bare', work, bare);
  return { tmp, bare, work };
}

const memStore = () => { const m = new Map(); return { read: pid => structuredClone(m.get(pid) || { settings: null, releases: [] }), write: (pid, d) => m.set(pid, structuredClone(d)) }; };
const done = [{ id: 'run_1', title: 'Nghỉ phép', status: 'DONE', updatedAt: 't' }, { id: 'run_2', title: 'Chấm công', status: 'DONE' }];

describe('release rules', () => {
  it('checks the environments and keeps production last', () => {
    expect(normalizeSettings({}).envs.map(e => e.id)).toEqual(['uat', 'prod']);
    expect(() => normalizeSettings({ source: 'development', envs: [{ id: 'uat', branch: 'development' }] })).toThrow(/nhánh/);
    expect(() => normalizeSettings({ envs: [{ id: 'uat', branch: 'x' }, { id: 'uat', branch: 'y' }] })).toThrow(/trùng/);
    expect(() => normalizeSettings({ envs: [{ id: 'uat', branch: 'x', url: 'javascript:1' }] })).toThrow(/http/);
    expect(() => normalizeSettings({ envs: [{ id: 'uat', branch: '--force' }] })).toThrow(/nhánh/);
  });
  it('suggests the next version and drafts notes', () => {
    expect(nextVersion([])).toBe('0.1.0');
    expect(nextVersion([{ version: '1.9.0' }, { version: '1.10.2' }])).toBe('1.10.3');
    expect(draftNotes('1.0.0', [{ runId: 'r', title: 'Nghỉ phép' }])).toContain('- Nghỉ phép');
    expect(githubRepo('https://github.com/acme/hrm.git')).toBe('acme/hrm');
    expect(githubRepo('/srv/git/hrm')).toBeNull();
  });
  it('production waits for UAT to be confirmed', () => {
    const s = normalizeSettings({});
    expect(envGate(s, { envs: {} }, 'prod')).toMatchObject({ ok: false, why: 'Cần xác nhận UAT trước' });
    expect(envGate(s, { envs: { uat: { status: 'deployed' } } }, 'prod').ok).toBe(false);
    expect(envGate(s, { envs: { uat: { status: 'verified' } } }, 'prod')).toMatchObject({ ok: true, last: true });
    expect(envGate(s, { envs: { uat: { status: 'deployed' } } }, 'uat').ok).toBe(false);
  });
});

describe('release manager on a real repo', () => {
  it('freezes development, merges it into UAT, then into main with a tag', async () => {
    const o = origin();
    const project = { id: 'p1', slug: 'hrm', repoUrl: o.bare, defaultBranch: 'development' };
    const m = createReleaseManager({ providers: { configured: () => false }, store: memStore(), root: path.join(o.tmp, 'ws') });
    const user = { email: 'lead@x.vn' };
    await expect(m.create(project, user, { version: 'abc' }, done)).rejects.toThrow(/1.2.3/);
    await expect(m.create(project, user, { version: '1.0.0', runIds: ['run_9'] }, done)).rejects.toThrow(/hoàn tất/);
    const rel = await m.create(project, user, { version: 'v1.0.0', runIds: ['run_1'] }, done);
    const devSha = git(o.bare, 'rev-parse', 'development');
    expect(rel).toMatchObject({ version: '1.0.0', branch: 'release/v1.0.0', sha: devSha, status: 'open' });
    expect(git(o.bare, 'rev-parse', 'release/v1.0.0')).toBe(devSha);
    await expect(m.create(project, user, { version: '1.0.0' }, done)).rejects.toThrow(/Đã có/);

    let st = await m.state(project, done);
    expect(st.candidates.map(c => c.runId)).toEqual(['run_2']);
    expect(st.nextVersion).toBe('1.0.1');

    // later work on development does not leak into the frozen release
    git(o.work, 'remote', 'add', 'origin', o.bare);
    fs.writeFileSync(path.join(o.work, 'c.txt'), 'later'); git(o.work, 'add', '-A'); git(o.work, 'commit', '-qm', 'later');
    git(o.work, 'push', '-q', 'origin', 'development');

    await expect(m.deploy(project, user, rel.id, 'prod')).rejects.toThrow(/xác nhận UAT/);
    let r = await m.deploy(project, user, rel.id, 'uat');
    expect(r.envs.uat.status).toBe('deployed');
    expect(git(o.bare, 'rev-parse', 'uat')).toBe(devSha); // first release: the branch starts at it
    expect(() => m.verify(project, user, rel.id, 'uat', { ok: false })).toThrow(/lý do/);
    r = m.verify(project, user, rel.id, 'uat', { ok: true });
    expect(r.envs.uat).toMatchObject({ status: 'verified', verifiedBy: 'lead@x.vn' });

    r = await m.deploy(project, user, rel.id, 'prod');
    expect(r.tag).toBe('v1.0.0');
    expect(r.envs.prod.status).toBe('deployed');
    const files = git(o.bare, 'ls-tree', '--name-only', 'main').split('\n');
    expect(files).toEqual(['a.txt', 'b.txt']); // the release, not the later commit
    expect(git(o.bare, 'rev-parse', 'v1.0.0^{commit}')).toBe(devSha);
    r = m.verify(project, user, rel.id, 'prod', { ok: true });
    expect(r.status).toBe('released');
    expect(() => m.cancel(project, user, rel.id)).toThrow(/production/);
    expect(r.history.map(h => h.what).join('\n')).toMatch(/Tạo bản 1.0.0[\s\S]*UAT[\s\S]*Production/);
  });
});

describe('releases API', () => {
  const app = roles => {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => { req.user = { id: 'u', email: 'u@x' }; next(); });
    const calls = [];
    const manager = {
      state: async () => ({ settings: normalizeSettings({}), releases: [], candidates: [] }),
      create: async () => { calls.push('create'); return { id: 'r1' }; },
      deploy: async (_p, _u, _r, env) => { calls.push(`deploy:${env}`); return { id: 'r1' }; },
      verify: () => { calls.push('verify'); return { id: 'r1' }; },
      saveSettings: () => ({}), cancel: () => ({}), deployStatus: async () => ({}),
    };
    a.use(releasesRouter({ authEnabled: true, manager, lookup: async () => ({ id: 'p1', currentUserRoles: roles }), doneRuns: async () => done }));
    return { a, calls };
  };
  const call = async (a, method, url, body) => {
    const srv = a.listen(0); const port = srv.address().port;
    try {
      const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    } finally { srv.close(); }
  };
  it('a tech lead releases to UAT but not to production', async () => {
    const { a, calls } = app(['TECH_LEAD']);
    expect((await call(a, 'GET', '/api/releases/p1')).body.can).toEqual({ release: true, verify: false, prod: false });
    expect((await call(a, 'POST', '/api/releases/p1/r1/deploy', { env: 'uat' })).status).toBe(200);
    expect((await call(a, 'POST', '/api/releases/p1/r1/deploy', { env: 'prod' })).status).toBe(403);
    expect((await call(a, 'POST', '/api/releases/p1/r1/verify', { env: 'uat', ok: true })).status).toBe(403);
    expect((await call(a, 'PUT', '/api/releases/p1/settings', {})).status).toBe(403);
    expect(calls).toEqual(['deploy:uat']);
  });
  it('a tester confirms UAT; a developer can only look', async () => {
    expect((await call(app(['TESTER']).a, 'POST', '/api/releases/p1/r1/verify', { env: 'uat', ok: true })).status).toBe(200);
    const dev = app(['DEVELOPER']);
    expect((await call(dev.a, 'GET', '/api/releases/p1')).status).toBe(200);
    expect((await call(dev.a, 'POST', '/api/releases/p1', { version: '1.0.0' })).status).toBe(403);
  });
  it('an owner releases to production', async () => {
    const { a, calls } = app(['OWNER']);
    expect((await call(a, 'POST', '/api/releases/p1/r1/deploy', { env: 'prod' })).status).toBe(200);
    expect(calls).toEqual(['deploy:prod']);
  });
});
