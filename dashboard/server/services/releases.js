import fs from 'fs';
import path from 'path';
import { STATE_DIR } from './config.js';
import { run as runCmd } from './scaffold/util.js';
import { WORKSPACES_ROOT } from './scaffold/jobs.js';
import { gitAuthEnv } from './scaffold/setup.js';
import { providerFor } from './scaffold/teamhub.js';
import { VERSION_RE, nextVersion, draftNotes, envGate, isProd } from '../../src/lib/releases.js';

export { VERSION_RE, nextVersion, cmpVersion, draftNotes, envGate, isProd } from '../../src/lib/releases.js';

/*
 * Releases of a project (feedback item 6): finished features are grouped into a version, frozen as one
 * commit (branch release/v<version> cut from the integration branch), then promoted environment by
 * environment — UAT first, a person confirms it on UAT, then Production (merge into the production
 * branch + tag v<version>). The repo's own CI deploys each branch it receives; Shipyard can wait for the
 * deploy status it reports. Nothing is installed or deployed by Shipyard itself.
 */

const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/;
const CONTEXT_RE = /^[A-Za-z0-9 ._:/()-]{1,100}$/;
const URL_RE = /^https?:\/\/[^\s'"`<>\\]{1,300}$/;
const ENV_ID = /^[a-z][a-z0-9-]{0,19}$/;
const MAX_NOTES = 20_000;
const MAX_RELEASES = 200;

export const DEFAULT_SETTINGS = {
  source: 'development',
  envs: [
    { id: 'uat', label: 'UAT', branch: 'uat', url: '', deployContext: '' },
    { id: 'prod', label: 'Production', branch: 'main', url: '', deployContext: '' },
  ],
};

const fail = (status, message) => Object.assign(new Error(message), { status });
const okBranch = b => BRANCH_RE.test(b) && !b.startsWith('-') && !b.includes('..') && !b.endsWith('/') && !b.endsWith('.lock');

/** Settings from the screen → checked settings (two or more environments, the last one is production). */
export function normalizeSettings(input = {}) {
  const source = String(input.source ?? DEFAULT_SETTINGS.source).trim();
  if (!okBranch(source)) throw fail(400, 'Nhánh nguồn không hợp lệ');
  const list = Array.isArray(input.envs) ? input.envs : DEFAULT_SETTINGS.envs;
  if (list.length < 1 || list.length > 4) throw fail(400, 'Cần từ 1 đến 4 môi trường');
  const seen = new Set();
  const envs = list.map((e, i) => {
    const id = String(e?.id || '').trim().toLowerCase();
    const branch = String(e?.branch || '').trim();
    const url = String(e?.url || '').trim();
    const deployContext = String(e?.deployContext || '').trim();
    const label = String(e?.label || id).trim().slice(0, 40);
    if (!ENV_ID.test(id) || seen.has(id)) throw fail(400, `Môi trường ${i + 1}: mã không hợp lệ hoặc bị trùng`);
    if (!okBranch(branch) || branch === source || branch.startsWith('release/')) throw fail(400, `${label}: nhánh không hợp lệ`);
    if (url && !URL_RE.test(url)) throw fail(400, `${label}: địa chỉ phải là http(s)://…`);
    if (deployContext && !CONTEXT_RE.test(deployContext)) throw fail(400, `${label}: tên trạng thái deploy không hợp lệ`);
    seen.add(id);
    return { id, label: label || id, branch, url, deployContext };
  });
  if (new Set(envs.map(e => e.branch)).size !== envs.length) throw fail(400, 'Mỗi môi trường một nhánh riêng');
  return { source, envs };
}

function fileStore(dir = path.join(STATE_DIR, 'releases')) {
  const file = pid => path.join(dir, `${String(pid).replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
  return {
    read(pid) {
      try {
        const d = JSON.parse(fs.readFileSync(file(pid), 'utf8'));
        return { settings: d.settings || null, releases: Array.isArray(d.releases) ? d.releases : [] };
      } catch { return { settings: null, releases: [] }; }
    },
    write(pid, d) {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file(pid)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
      fs.renameSync(tmp, file(pid));
    },
  };
}

/** owner/repo of a github.com remote, else null. */
export function githubRepo(url) {
  const m = String(url || '').match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function createReleaseManager({ providers, run = runCmd, store = fileStore(), root = WORKSPACES_ROOT,
  now = () => new Date().toISOString(), fetchImpl = fetch } = {}) {
  const locks = new Map();
  const locked = async (pid, fn) => {
    if (locks.get(pid)) throw fail(409, 'Đang có thao tác phát hành khác trên dự án này — thử lại sau ít phút');
    locks.set(pid, true);
    try { return await fn(); } finally { locks.delete(pid); }
  };

  const settingsOf = (d, project) => d.settings || { ...DEFAULT_SETTINGS, source: project.defaultBranch || DEFAULT_SETTINGS.source };

  /** A clone of the project repo Shipyard keeps only for releases (never a lane's working tree). */
  async function repo(project) {
    const url = project.repoUrl || '';
    if (!url) throw fail(400, 'Dự án chưa khai báo repo');
    const provider = path.isAbsolute(url) ? 'host' : providerFor(url, providers);
    const env = gitAuthEnv(providers, provider);
    const dir = path.join(root, '.release', String(project.slug || project.id).replace(/[^A-Za-z0-9_-]/g, '_'));
    const g = (args, opts = {}) => run('git', args, { cwd: dir, extraEnv: env, timeoutMs: 5 * 60_000, ...opts });
    if (!fs.existsSync(path.join(dir, '.git'))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.rmSync(dir, { recursive: true, force: true });
      await run('git', ['clone', '-q', '--no-checkout', url, dir], { extraEnv: env, timeoutMs: 10 * 60_000 })
        .catch(e => { throw fail(502, `Không clone được repo: ${e.message.split('\n').pop()}`); });
    }
    await g(['fetch', '-q', '--prune', '--tags', 'origin']).catch(e => { throw fail(502, `Không lấy được repo: ${e.message.split('\n').pop()}`); });
    const out = async args => {
      let s = '';
      await g(args, { log: l => { if (!l.startsWith('$ ')) s += `${l}\n`; } });
      return s.trim();
    };
    const has = ref => out(['rev-parse', '--verify', '--quiet', ref]).then(Boolean, () => false);
    return { dir, g, out, has, github: githubRepo(url), provider };
  }

  /** The CI status `context` reports for a commit (GitHub): success | pending | failure | unknown. */
  async function deployState(gh, sha, context) {
    if (!gh || !context || !sha || !providers?.configured?.('github')) return 'unknown';
    const headers = { Authorization: providers.authHeader('github').replace(/^Authorization:\s*/i, ''), Accept: 'application/vnd.github+json' };
    try {
      const r = await fetchImpl(`https://api.github.com/repos/${gh}/commits/${sha}/status`, { headers, signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      const s = (j.statuses || []).find(x => x.context === context);
      if (s) return s.state === 'error' ? 'failure' : s.state;
      const c = await fetchImpl(`https://api.github.com/repos/${gh}/commits/${sha}/check-runs`, { headers, signal: AbortSignal.timeout(10000) }).then(x => x.json());
      const run = (c.check_runs || []).find(x => x.name === context);
      if (!run) return 'pending';
      return run.status !== 'completed' ? 'pending' : run.conclusion === 'success' ? 'success' : 'failure';
    } catch { return 'unknown'; }
  }

  return {
    /** Everything the screen shows; `doneRuns` = the project's finished features (from the platform). */
    async state(project, doneRuns = []) {
      const d = store.read(project.id);
      const settings = settingsOf(d, project);
      const released = new Set(d.releases.filter(r => r.status !== 'cancelled').flatMap(r => r.features.map(f => f.runId)));
      return {
        settings, configured: !!d.settings,
        releases: [...d.releases].reverse(),
        candidates: doneRuns.filter(r => !released.has(r.id)).map(r => ({ runId: r.id, title: r.title, doneAt: r.updatedAt })),
        nextVersion: nextVersion(d.releases),
      };
    },

    saveSettings(project, input) {
      const d = store.read(project.id);
      d.settings = normalizeSettings(input);
      store.write(project.id, d);
      return d.settings;
    },

    /** Freezes the integration branch as release/v<version> and records what it carries. */
    create(project, user, { version, runIds = [], notes } = {}, doneRuns = []) {
      return locked(project.id, async () => {
        const d = store.read(project.id);
        const settings = settingsOf(d, project);
        const v = String(version || '').trim().replace(/^v/i, '');
        if (!VERSION_RE.test(v)) throw fail(400, 'Phiên bản dạng 1.2.3');
        if (d.releases.some(r => r.version === v)) throw fail(409, `Đã có phiên bản ${v}`);
        const byId = new Map(doneRuns.map(r => [r.id, r]));
        const ids = [...new Set((Array.isArray(runIds) ? runIds : []).map(String))];
        const unknown = ids.filter(id => !byId.has(id));
        if (unknown.length) throw fail(400, 'Chỉ gom được các tính năng đã hoàn tất');
        const features = ids.map(id => ({ runId: id, title: byId.get(id).title || id }));
        const r = await repo(project);
        if (!await r.has(`origin/${settings.source}`)) throw fail(400, `Repo không có nhánh ${settings.source}`);
        const branch = `release/v${v}`;
        if (await r.has(`origin/${branch}`)) throw fail(409, `Repo đã có nhánh ${branch}`);
        const sha = await r.out(['rev-parse', `origin/${settings.source}`]);
        await r.g(['push', '-q', 'origin', `${sha}:refs/heads/${branch}`]).catch(e => { throw fail(502, `Không đẩy được ${branch}: ${e.message.split('\n').pop()}`); });
        const rel = {
          id: `rel_${v.replace(/\./g, '_')}_${Date.now().toString(36)}`, version: v, branch, sha, source: settings.source,
          features, notes: String(notes || draftNotes(v, features)).slice(0, MAX_NOTES),
          createdBy: user?.email || user?.id || '', createdAt: now(), status: 'open', envs: {}, history: [],
        };
        rel.history.push({ at: now(), by: rel.createdBy, what: `Tạo bản ${v} từ ${settings.source} (${sha.slice(0, 7)})` });
        d.releases.push(rel);
        if (d.releases.length > MAX_RELEASES) d.releases.splice(0, d.releases.length - MAX_RELEASES);
        store.write(project.id, d);
        return rel;
      });
    },

    /** Merges the frozen release into the environment's branch (its CI deploys it); production is also tagged. */
    deploy(project, user, releaseId, envId) {
      return locked(project.id, async () => {
        const d = store.read(project.id);
        const settings = settingsOf(d, project);
        const rel = d.releases.find(x => x.id === releaseId);
        if (!rel) throw fail(404, 'Không tìm thấy bản phát hành');
        const gate = envGate(settings, rel, envId);
        if (!gate.ok) throw fail(409, gate.why);
        const env = settings.envs[gate.index];
        const r = await repo(project);
        const by = user?.email || user?.id || '';
        const ident = ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'user.name=Shipyard', '-c', `user.email=${by && /^[^\s<>]+@[^\s<>]+$/.test(by) ? by : 'release@shipyard.local'}`];
        let merged;
        if (!await r.has(`origin/${env.branch}`)) {
          // First release to this environment: its branch starts at the release.
          await r.g(['push', '-q', 'origin', `${rel.sha}:refs/heads/${env.branch}`]);
          merged = rel.sha;
        } else {
          await r.g(['checkout', '-q', '--detach', `origin/${env.branch}`]);
          try {
            await r.g([...ident, 'merge', '-q', '--no-ff', '-m', `Release v${rel.version} → ${env.label}`, rel.sha]);
          } catch (e) {
            await r.g(['merge', '--abort']).catch(() => {});
            throw fail(409, `Không gộp được v${rel.version} vào ${env.branch} (xung đột) — cần người xử lý trên repo`);
          }
          merged = await r.out(['rev-parse', 'HEAD']);
          await r.g(['push', '-q', 'origin', `HEAD:refs/heads/${env.branch}`]).catch(e => {
            throw fail(502, `Không đẩy được lên ${env.branch} (nhánh có bảo vệ?): ${e.message.split('\n').pop()}`);
          });
        }
        if (gate.last) {
          const tag = `v${rel.version}`;
          if (!await r.has(`refs/tags/${tag}`)) {
            await r.g([...ident, 'tag', '-a', tag, '-m', rel.notes.slice(0, 5000), rel.sha]);
            await r.g(['push', '-q', 'origin', `refs/tags/${tag}`]).catch(() => {});
          }
          rel.tag = tag;
        }
        rel.envs[env.id] = { status: 'deployed', sha: merged, by, at: now() };
        rel.history.push({ at: now(), by, what: `Đưa lên ${env.label} (${env.branch} @ ${merged.slice(0, 7)})` });
        store.write(project.id, d);
        return rel;
      });
    },

    /** A person confirms (or rejects) the release on an environment after checking it there. */
    verify(project, user, releaseId, envId, { ok, note } = {}) {
      const d = store.read(project.id);
      const settings = settingsOf(d, project);
      const rel = d.releases.find(x => x.id === releaseId);
      if (!rel) throw fail(404, 'Không tìm thấy bản phát hành');
      const env = settings.envs.find(e => e.id === envId);
      const cur = rel.envs?.[envId];
      if (!env || !cur || !['deployed', 'rejected'].includes(cur.status)) throw fail(409, 'Bản này chưa được đưa lên môi trường đó');
      const text = String(note || '').trim().slice(0, 2000);
      if (!ok && !text) throw fail(400, 'Ghi lý do không đạt');
      const by = user?.email || user?.id || '';
      Object.assign(cur, { status: ok ? 'verified' : 'rejected', verifiedBy: by, verifiedAt: now(), note: text });
      rel.history.push({ at: now(), by, what: `${ok ? 'Xác nhận đạt' : 'Không đạt'} trên ${env.label}${text ? `: ${text}` : ''}` });
      if (ok && isProd(settings, envId)) rel.status = 'released';
      store.write(project.id, d);
      return rel;
    },

    cancel(project, user, releaseId) {
      const d = store.read(project.id);
      const rel = d.releases.find(x => x.id === releaseId);
      if (!rel) throw fail(404, 'Không tìm thấy bản phát hành');
      if (rel.status === 'released') throw fail(409, 'Bản đã lên production — phát hành bản mới để sửa');
      rel.status = 'cancelled';
      rel.history.push({ at: now(), by: user?.email || user?.id || '', what: 'Huỷ bản phát hành' });
      store.write(project.id, d);
      return rel;
    },

    /** Deploy status per environment from the repo's CI (only environments with a deploy status name). */
    async deployStatus(project, releaseId) {
      const d = store.read(project.id);
      const settings = settingsOf(d, project);
      const rel = d.releases.find(x => x.id === releaseId);
      if (!rel) throw fail(404, 'Không tìm thấy bản phát hành');
      const gh = githubRepo(project.repoUrl);
      const out = {};
      for (const e of settings.envs) {
        const cur = rel.envs?.[e.id];
        if (cur?.sha && e.deployContext) out[e.id] = await deployState(gh, cur.sha, e.deployContext);
      }
      return out;
    },
  };
}
