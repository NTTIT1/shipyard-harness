// Feedback item 7: the code & document map is built from the integration branch and sent to the project memory.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createCodeGraph } from '../server/services/codegraph.js';

const ID = ['-c', 'user.name=t', '-c', 'user.email=t@x', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...a) => { const r = spawnSync('git', [...ID, ...a], { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim(); };
const put = (dir, f, text) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); };

function repo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
  const w = path.join(tmp, 'w'); fs.mkdirSync(w);
  git(w, 'init', '-q', '-b', 'main');
  put(w, 'src/main/java/com/acme/leave/LeaveController.java', `package com.acme.leave;
import com.acme.leave.LeaveService;
@RestController
@RequestMapping("/api/leaves")
public class LeaveController {
  @PostMapping public void create() {}
  @GetMapping("/{id}") public void get() {}
}`);
  put(w, 'src/main/java/com/acme/leave/LeaveService.java', 'package com.acme.leave;\npublic class LeaveService {}\n');
  put(w, 'src/main/java/com/acme/leave/LeaveRequest.java', 'package com.acme.leave;\n@Entity\n@Table(name = "leave_requests")\npublic class LeaveRequest {}\n');
  put(w, 'docs/nghi-phep.md', '# Nghỉ phép\nĐơn đi qua `LeaveService` rồi lưu vào `leave_requests`. Xem [API](api.md). `LeaveApprovalService` gửi mail.\n');
  put(w, 'docs/api.md', '# API\nPOST /api/leaves tạo đơn.\n');
  git(w, 'add', '-A'); git(w, 'commit', '-qm', 'init');
  git(w, 'checkout', '-qb', 'development');
  put(w, 'docs/moi.md', '# Chỉ có trên development\n'); git(w, 'add', '-A'); git(w, 'commit', '-qm', 'dev');
  const bare = path.join(tmp, 'o.git');
  git(tmp, 'clone', '-q', '--bare', w, bare);
  return { tmp, bare };
}

describe('code & document map', () => {
  it('reads the integration branch and replaces the map in the project memory', async () => {
    const o = repo();
    const sent = [];
    const fetchImpl = async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body), token: opts.headers['X-Service-Token'] });
      return { ok: true, status: 200, json: async () => ({ success: true, data: { nodes: 9, edges: 7, docs: 3 } }) }; };
    const cg = createCodeGraph({ providers: { configured: () => false }, root: path.join(o.tmp, 'ws'), contextUrl: 'http://ctx', token: () => 'svc', fetchImpl,
      script: path.resolve('../bin/code-graph.py') });
    const r = await cg.build({ id: 'p1', slug: 'hrm', name: 'HRM', repoUrl: o.bare, defaultBranch: 'development' }, { email: 'lead@x' });
    expect(r).toMatchObject({ by: 'lead@x', counts: { nodes: 9 } });
    expect(r.source).toMatch(/^development@[0-9a-f]{7}$/);
    expect(r.stale).toBe(1); // `LeaveApprovalService` no longer exists
    const { url, body, token } = sent[0];
    expect(url).toBe('http://ctx/internal/v1/projects/p1/code-graph');
    expect(token).toBe('svc');
    expect(body.docs.map(d => d.path).sort()).toEqual(['docs/api.md', 'docs/moi.md', 'docs/nghi-phep.md']);
    const keys = body.nodes.map(n => `${n.type}:${n.key}`);
    expect(keys).toEqual(expect.arrayContaining(['API:post /api/leaves', 'API:get /api/leaves/{}', 'TABLE:leave_requests', 'MODULE:leaveservice']));
    const e = body.edges.map(x => `${x.from}>${x.type}>${x.to}`);
    expect(e).toEqual(expect.arrayContaining([
      'MODULE:leavecontroller>IMPLEMENTS>API:post /api/leaves', 'MODULE:leavecontroller>DEPENDS_ON>MODULE:leaveservice',
      'MODULE:leaverequest>TOUCHES>TABLE:leave_requests', 'DOC:docs/nghi-phep.md>MENTIONS>MODULE:leaveservice',
      'DOC:docs/nghi-phep.md>MENTIONS>TABLE:leave_requests', 'DOC:docs/nghi-phep.md>LINKS>DOC:docs/api.md', 'DOC:docs/api.md>MENTIONS>API:post /api/leaves']));
    expect(body.report).toMatch(/Tài liệu có thể đã cũ[\s\S]*LeaveApprovalService/);
    expect(cg.status('p1').last.source).toBe(r.source);
  });
  it('reports a repo it cannot read, and one build at a time', async () => {
    const cg = createCodeGraph({ providers: { configured: () => false }, root: fs.mkdtempSync(path.join(os.tmpdir(), 'cg2-')), fetchImpl: async () => ({}) });
    await expect(cg.build({ id: 'p2', slug: 'x', repoUrl: '/nope/repo' })).rejects.toThrow(/clone/);
    expect(cg.status('p2').last.error).toMatch(/clone/);
    await expect(cg.build({ id: 'p3', slug: 'y' })).rejects.toThrow(/repo/);
  });
});
