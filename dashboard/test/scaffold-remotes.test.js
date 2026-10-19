// Phase 2: GitHub / GitLab connections, CI files, and the remote stage of a job.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createProviderStore, publicProviders, normalizeUrl, github, gitlab } from '../server/services/scaffold/remotes.js';
import { githubWorkflow, gitlabCi, ciFiles } from '../server/services/scaffold/ci.js';
import { validateGit, validateRequest } from '../server/services/scaffold/catalog.js';
import { createJobRunner, stagesFor } from '../server/services/scaffold/jobs.js';
import { run as realRun } from '../server/services/scaffold/util.js';

const ALL = { java: { ok: true, major: 21 }, node: { ok: true, major: 22 }, npm: { ok: true, major: 10 }, uv: { ok: true }, git: { ok: true }, unzip: { ok: true } };

/** fetch stub: routes "METHOD url" → [status, body]; records calls. */
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${url}`;
    calls.push({ key, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : undefined });
    const [status, body] = routes[key] || [404, { message: 'Not Found' }];
    return { ok: status < 300, status, json: async () => body };
  };
  f.calls = calls;
  return f;
}

describe('git validation', () => {
  it('defaults to local and checks owners per provider', () => {
    expect(validateGit()).toEqual({ provider: 'local' });
    expect(validateGit({ provider: 'github', owner: 'acme-co' })).toEqual({ provider: 'github', owner: 'acme-co', visibility: 'private' });
    expect(validateGit({ provider: 'gitlab', owner: '42', visibility: 'public' })).toEqual({ provider: 'gitlab', owner: '42', visibility: 'public' });
    expect(() => validateGit({ provider: 'github', owner: '../x' })).toThrow(/GitHub/);
    expect(() => validateGit({ provider: 'gitlab', owner: 'acme' })).toThrow(/GitLab/);
    expect(() => validateGit({ provider: 'bitbucket' })).toThrow(/không hợp lệ/);
  });
  it('is part of the wizard request', () => {
    const s = validateRequest({ name: 'A', slug: 'abc', stack: 'ts-react-vite', git: { provider: 'github', owner: 'me' } }, ALL);
    expect(s.git).toEqual({ provider: 'github', owner: 'me', visibility: 'private' });
  });
});

describe('provider store', () => {
  let file;
  beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gp-')), 'git-providers.json'); });

  it('verifies the token, saves it with mode 600 and never exposes it', async () => {
    const f = fakeFetch({ 'GET https://api.github.com/user': [200, { login: 'octo' }] });
    const st = createProviderStore({ file, fetchImpl: f });
    const pub = await st.save('github', { token: 'ghp_secret1234' });
    expect(pub).toEqual({ configured: true, login: 'octo', url: 'https://api.github.com', tokenHint: '…1234' });
    expect(f.calls[0].headers.Authorization).toBe('Bearer ghp_secret1234');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(st.list())).not.toContain('ghp_secret');
    expect(st.list().gitlab).toEqual({ configured: false, url: 'https://gitlab.com' });
  });
  it('rejects a bad token without saving', async () => {
    const st = createProviderStore({ file, fetchImpl: fakeFetch({ 'GET https://gitlab.com/api/v4/user': [401, { message: '401 Unauthorized' }] }) });
    await expect(st.save('gitlab', { token: 'glpat-bad' })).rejects.toThrow(/không hợp lệ/);
    expect(fs.existsSync(file)).toBe(false);
  });
  it('keeps the old token when only the URL changes, and removes', async () => {
    const f = fakeFetch({ 'GET https://gitlab.com/api/v4/user': [200, { username: 'me' }], 'GET https://git.acme.io/api/v4/user': [200, { username: 'me2' }] });
    const st = createProviderStore({ file, fetchImpl: f });
    await st.save('gitlab', { token: 'glpat-1' });
    const p = await st.save('gitlab', { token: '', url: 'https://git.acme.io/' });
    expect(p).toMatchObject({ login: 'me2', url: 'https://git.acme.io' });
    expect(f.calls[1].headers['PRIVATE-TOKEN']).toBe('glpat-1');
    expect(st.remove('gitlab')).toEqual({ configured: false, url: 'https://gitlab.com' });
    expect(st.configured('gitlab')).toBe(false);
  });
  it('requires https for remote hosts', () => {
    expect(() => normalizeUrl('gitlab', 'http://git.acme.io')).toThrow(/https/);
    expect(normalizeUrl('gitlab', 'http://localhost:8929/')).toBe('http://localhost:8929');
    expect(publicProviders({}).github.configured).toBe(false);
  });
});

describe('GitHub client', () => {
  const conn = { url: 'https://api.github.com', token: 't', login: 'octo' };
  it('lists the user then their orgs', async () => {
    const f = fakeFetch({ 'GET https://api.github.com/user/orgs?per_page=100': [200, [{ login: 'acme' }]] });
    expect(await github.owners(conn, f)).toEqual([
      { id: 'octo', label: 'octo (cá nhân)', kind: 'user' }, { id: 'acme', label: 'acme', kind: 'org' }]);
  });
  it('creates under the user or an org, private by default', async () => {
    const f = fakeFetch({
      'POST https://api.github.com/user/repos': [201, { clone_url: 'https://github.com/octo/shop.git', html_url: 'https://github.com/octo/shop' }],
      'POST https://api.github.com/orgs/acme/repos': [201, { clone_url: 'c', html_url: 'h' }],
    });
    expect(await github.createRepo(conn, f, { owner: 'octo', name: 'shop', description: 'd', visibility: 'private' }))
      .toEqual({ cloneUrl: 'https://github.com/octo/shop.git', webUrl: 'https://github.com/octo/shop' });
    expect(f.calls[0].body).toEqual({ name: 'shop', description: 'd', private: true, auto_init: false });
    await github.createRepo(conn, f, { owner: 'acme', name: 'shop', visibility: 'public' });
    expect(f.calls[1].body.private).toBe(false);
  });
  it('explains a name clash', async () => {
    const f = fakeFetch({ 'POST https://api.github.com/user/repos': [422, { message: 'Repository creation failed.', errors: [{ message: 'name already exists on this account' }] }] });
    await expect(github.createRepo(conn, f, { owner: 'octo', name: 'shop' })).rejects.toThrow(/đã tồn tại/);
  });
  it('builds a basic-auth header', () => {
    expect(github.authHeader(conn)).toBe(`Authorization: Basic ${Buffer.from('octo:t').toString('base64')}`);
  });
});

describe('GitLab client', () => {
  const conn = { url: 'https://gitlab.com', token: 't', login: 'me' };
  it('lists namespaces and creates in one', async () => {
    const f = fakeFetch({
      'GET https://gitlab.com/api/v4/namespaces?per_page=100': [200, [{ id: 1, full_path: 'me', kind: 'user' }, { id: 7, full_path: 'acme/team', kind: 'group' }]],
      'POST https://gitlab.com/api/v4/projects': [201, { http_url_to_repo: 'https://gitlab.com/acme/team/shop.git', web_url: 'https://gitlab.com/acme/team/shop' }],
    });
    expect(await gitlab.owners(conn, f)).toEqual([{ id: '1', label: 'me (cá nhân)', kind: 'user' }, { id: '7', label: 'acme/team', kind: 'group' }]);
    const r = await gitlab.createRepo(conn, f, { owner: '7', name: 'shop', description: 'd', visibility: 'private' });
    expect(r.cloneUrl).toBe('https://gitlab.com/acme/team/shop.git');
    expect(f.calls[1].body).toEqual({ name: 'shop', path: 'shop', namespace_id: 7, description: 'd', visibility: 'private', initialize_with_readme: false });
    expect(gitlab.authHeader(conn)).toContain(Buffer.from('oauth2:t').toString('base64'));
  });
  it('explains a taken path', async () => {
    const f = fakeFetch({ 'POST https://gitlab.com/api/v4/projects': [400, { message: { path: ['has already been taken'] } }] });
    await expect(gitlab.createRepo(conn, f, { owner: '7', name: 'shop' })).rejects.toThrow(/đã tồn tại/);
  });
});

describe('CI files', () => {
  it('GitHub Actions per stack', () => {
    const java = githubWorkflow('java-spring', { build: 'maven', javaVersion: '21' });
    expect(java).toContain("java-version: '21'");
    expect(java).toContain('cache: maven');
    expect(java).toContain('- run: ./mvnw -B verify');
    expect(githubWorkflow('python-fastapi', { python: '3.12' })).toContain('- run: uv run pytest -q');
    expect(githubWorkflow('ts-react-vite', { tests: false })).not.toContain('npm test');
    expect(githubWorkflow('ts-nestjs', {})).toContain('- run: npm test');
  });
  it('GitLab CI per stack', () => {
    const g = gitlabCi('java-spring', { build: 'gradle', javaVersion: '25' });
    expect(g).toContain('image: eclipse-temurin:25-jdk');
    expect(g).toContain('    - ./gradlew --no-daemon build');
    expect(gitlabCi('ts-nestjs', {})).toContain('image: node:22');
  });
  it('picks the file by provider', () => {
    expect(Object.keys(ciFiles('github', 'ts-nestjs', {}))).toEqual(['.github/workflows/ci.yml']);
    expect(Object.keys(ciFiles('gitlab', 'ts-nestjs', {}))).toEqual(['.gitlab-ci.yml']);
    expect(ciFiles('local', 'ts-nestjs', {})).toEqual({});
  });
});

describe('job with a remote', () => {
  let root, bare;
  const fakeRun = (cmd, args, opts) => (cmd === 'git' ? realRun(cmd, args, opts) : (opts.log(`(fake) ${cmd}`), Promise.resolve()));
  const spec = (slug, git = { provider: 'github', owner: 'octo', visibility: 'private' }) =>
    validateRequest({ name: 'Py', slug, stack: 'python-fastapi', options: { db: 'none' }, git }, ALL);
  const user = { id: 'u1', email: 'dev@acme.io' };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scr-'));
    bare = path.join(root, 'remote.git');
    spawnSync('git', ['init', '-q', '--bare', bare]);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const remotes = (over = {}) => {
    const r = { created: 0, configured: () => true, authHeader: () => 'Authorization: Basic c2VjcmV0',
      createRepo: async () => { r.created++; return { cloneUrl: bare, webUrl: 'https://github.com/octo/x' }; }, ...over };
    return r;
  };

  it('only has a remote stage when a provider is chosen', () => {
    expect(stagesFor({ git: { provider: 'local' } }).map(s => s.id)).not.toContain('remote');
    expect(stagesFor({ git: { provider: 'gitlab' } }).map(s => s.id)).toContain('remote');
  });

  it('creates the repo, pushes main + development, adds CI, registers the clone URL', async () => {
    const reg = [];
    const rm = remotes();
    const r = createJobRunner({ root, tools: () => ALL, run: fakeRun, remotes: rm, registerProject: async b => { reg.push(b); return { id: 'p1' }; } });
    const j = r.start(spec('gh-app'), user, 't');
    await r.wait(j.id);
    const done = r.get(j.id);
    expect(done.status).toBe('done');
    expect(done.remote).toEqual({ cloneUrl: bare, webUrl: 'https://github.com/octo/x' });
    expect(reg[0].repoUrl).toBe(bare);
    const heads = spawnSync('git', ['branch', '--format=%(refname:short)'], { cwd: bare, encoding: 'utf8' }).stdout.trim().split('\n').sort();
    expect(heads).toEqual(['development', 'main']);
    const files = spawnSync('git', ['ls-tree', '-r', '--name-only', 'main'], { cwd: bare, encoding: 'utf8' }).stdout;
    expect(files).toContain('.github/workflows/ci.yml');
    expect(fs.readFileSync(path.join(root, 'gh-app', '.git', 'config'), 'utf8')).not.toMatch(/extraHeader|c2VjcmV0/i);
    expect(done.log.join('\n')).not.toContain('c2VjcmV0');
  });

  it('retries a failed push without creating the repo twice', async () => {
    let pushes = 0;
    const flaky = (cmd, args, opts) => (cmd === 'git' && args[0] === 'push' && pushes++ === 0
      ? Promise.reject(new Error('git push thất bại: mã lỗi 128')) : fakeRun(cmd, args, opts));
    const rm = remotes();
    const r = createJobRunner({ root, tools: () => ALL, run: flaky, remotes: rm, registerProject: async () => ({ id: 'p2' }) });
    const j = r.start(spec('retry-app'), user, 't');
    await r.wait(j.id);
    expect(r.get(j.id)).toMatchObject({ status: 'failed', stage: 'remote', retryable: true });
    const again = await r.retry(j.id, 't2');
    expect(again).toMatchObject({ status: 'done', project: { id: 'p2' } });
    expect(rm.created).toBe(1);
  });

  it('refuses a provider that is not connected, and keeps the remote on discard', async () => {
    const r1 = createJobRunner({ root, tools: () => ALL, run: fakeRun, remotes: remotes({ configured: () => false }), registerProject: async () => ({}) });
    expect(() => r1.start(spec('nc-app'), user, 't')).toThrow(/Chưa kết nối GitHub/);
    const r2 = createJobRunner({ root, tools: () => ALL, run: fakeRun, remotes: remotes(), registerProject: async () => { throw new Error('slug trùng'); } });
    const j = r2.start(spec('keep-app'), user, 't');
    await r2.wait(j.id);
    expect(r2.discard(j.id)).toEqual({ ok: true, remoteKept: 'https://github.com/octo/x' });
  });
});
