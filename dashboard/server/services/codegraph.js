import fs from 'fs';
import path from 'path';
import { HARNESS_ROOT } from './config.js';
import { run as runCmd } from './scaffold/util.js';
import { WORKSPACES_ROOT } from './scaffold/jobs.js';
import { gitAuthEnv, serviceToken } from './scaffold/setup.js';
import { providerFor } from './scaffold/teamhub.js';
import { CONTEXT_URL } from './projectmemory.js';

/*
 * "Bản đồ mã nguồn & tài liệu" (feedback item 7): reads the project's integration branch with
 * bin/code-graph.py (standard library only — nothing installed) and hands the map to the project memory,
 * which replaces the previous one. The AI roles then find documents and code through it.
 */

const fail = (status, message) => Object.assign(new Error(message), { status });

export function createCodeGraph({ providers, run = runCmd, root = WORKSPACES_ROOT, contextUrl = CONTEXT_URL, token = serviceToken,
  fetchImpl = fetch, script = path.join(HARNESS_ROOT, 'bin', 'code-graph.py'), now = () => new Date().toISOString() } = {}) {
  const busy = new Set();
  const last = new Map(); // pid → { at, by, counts, source, error }

  /** A clean checkout of the project's integration branch, kept only for the map. */
  async function checkout(project) {
    const url = project.repoUrl || '';
    if (!url) throw fail(400, 'Dự án chưa khai báo repo');
    const provider = path.isAbsolute(url) ? 'host' : providerFor(url, providers);
    const env = gitAuthEnv(providers, provider);
    const dir = path.join(root, '.graph', String(project.slug || project.id).replace(/[^A-Za-z0-9_-]/g, '_'));
    const g = (args, o = {}) => run('git', args, { cwd: dir, extraEnv: env, timeoutMs: 10 * 60_000, ...o });
    if (!fs.existsSync(path.join(dir, '.git'))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.rmSync(dir, { recursive: true, force: true });
      await run('git', ['clone', '-q', url, dir], { extraEnv: env, timeoutMs: 10 * 60_000 })
        .catch(e => { throw fail(502, `Không clone được repo: ${String(e.message).split('\n').pop()}`); });
    }
    await g(['fetch', '-q', '--prune', 'origin']).catch(e => { throw fail(502, `Không lấy được repo: ${String(e.message).split('\n').pop()}`); });
    let sha = '';
    for (const b of [project.defaultBranch, 'development', 'develop', 'main', 'master'].filter(Boolean)) {
      try {
        let out = '';
        await g(['rev-parse', '--verify', '--quiet', `origin/${b}`], { log: l => { if (!l.startsWith('$ ')) out += l; } });
        if (out.trim()) { sha = out.trim(); await g(['checkout', '-q', '--force', '--detach', sha]); return { dir, branch: b, sha }; }
      } catch { /* try the next branch */ }
    }
    throw fail(400, 'Repo không có nhánh tích hợp (development, main…)');
  }

  return {
    status: pid => ({ running: busy.has(pid), last: last.get(pid) || null }),

    async build(project, user) {
      if (busy.has(project.id)) throw fail(409, 'Đang dựng bản đồ của dự án này');
      busy.add(project.id);
      try {
        const { dir, branch, sha } = await checkout(project);
        const out = path.join(path.dirname(dir), `${path.basename(dir)}.graph.json`);
        await run('python3', ['-I', script, dir, '--with-docs', '--title', project.name || project.slug || project.id, '--out', out],
          { timeoutMs: 10 * 60_000 });
        const g = JSON.parse(fs.readFileSync(out, 'utf8'));
        const source = `${branch}@${sha.slice(0, 7)}`;
        const r = await fetchImpl(`${contextUrl}/internal/v1/projects/${encodeURIComponent(project.id)}/code-graph`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token() },
          body: JSON.stringify({ source, title: g.title, report: g.report, nodes: g.nodes, edges: g.edges, docs: g.docs || [] }),
          signal: AbortSignal.timeout(120_000),
        }).catch(() => { throw fail(502, 'Không kết nối được bộ nhớ dự án (context-service)'); });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.success === false) throw fail(502, j.message || `Bộ nhớ dự án trả về HTTP ${r.status}`);
        const entry = { at: now(), by: user?.email || user?.id || '', source, files: g.files, truncated: g.truncated,
          stale: (g.stale || []).length, counts: j.data };
        last.set(project.id, entry);
        return entry;
      } catch (e) {
        last.set(project.id, { at: now(), by: user?.email || '', error: e.message });
        throw e;
      } finally { busy.delete(project.id); }
    },
  };
}
