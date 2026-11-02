// A project's feature queue (run/projects/<pid>/queue.json): features approved in the project chat wait
// here; the first free lane of that project takes the next one, with the project docs and the approved spec.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, Q, D;
beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-pqueue-'));
  process.env.HARNESS_ROOT = tmp;
  Q = await import('../server/services/projectqueue.js');
  D = await import('../server/services/projectdocs.js');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => fs.rmSync(path.join(tmp, 'run'), { recursive: true, force: true }));

const laneDir = n => path.join(tmp, `lane${n}`);
const profileDir = n => path.join(tmp, 'profiles', `p${n}`);
const lane = (n, pid, over = {}) => ({ lane: n, run_project_id: pid, bound_profile: 'p', status: 'idle', stage: 'idle', ...over });
const deps = (lanes, over = {}) => {
  const calls = { assign: [], stop: [], state: [] };
  return { calls, d: {
    projects: () => Q.queuedProjects(), lanes: async () => lanes, isRunning: () => false,
    stopSession: n => calls.stop.push(n), state: (n, a) => calls.state.push([n, a]),
    assign: async (n, body) => { calls.assign.push([n, body]); }, laneDir, profileDir, laneQueue: () => ({ items: [] }), docs: D, ...over,
  } };
};
const feat = (slug, title) => ({ slug, title, sessionId: 'stu_1', spec: `# ${title}\n\n## Tiêu chí chấp nhận\n1. Có nút` });
const seed = pid => {
  D.seedDocs(pid, { brief: '# Bán hàng', architecture: '# Kiến trúc\n\n## Lộ trình tính năng\n1. **Đăng nhập** — x', design: '', mockups: [] });
  D.addFeature(pid, { slug: 'xuat-excel', title: 'Xuất Excel', brief: '# Xuất Excel', architecture: '# đổi', design: '', mockups: [] });
};

describe('project queue', () => {
  it('validates what is queued', () => {
    expect(() => Q.writeProjectQueue('proj_9', 'x')).toThrow(/thao tác/);
    expect(() => Q.enqueue('proj_9', { title: 'A' })).toThrow(/thiếu/);
    Q.enqueue('proj_9', feat('a', 'A'));
    Q.enqueue('proj_9', feat('b', 'B'));
    expect(Q.readProjectQueue('proj_9').items.map(x => x.slug)).toEqual(['a', 'b']);
  });

  it('a free lane of the project takes the feature with its docs and approved spec, skipping PM/BA/DESIGN', async () => {
    seed('proj_9');
    Q.enqueue('proj_9', feat('xuat-excel', 'Xuất Excel'));
    const { calls, d } = deps([lane(1, 'proj_9', { status: 'running', stage: 'implementing' }), lane(2, 'proj_9'), lane(3, 'proj_X')]);
    await Q.tickProjectQueues(d);
    expect(calls.assign).toHaveLength(1);
    const [n, body] = calls.assign[0];
    expect(n).toBe(2);
    expect(body).toMatchObject({ requirement: 'Tính năng "Xuất Excel"', gates: { PM: 'SKIP', BA: 'SKIP', DESIGN: 'SKIP' } });
    expect(body.spec_dir).toMatch(/^specs\/\d{4}-\d{2}-\d{2}-xuat-excel$/);
    expect(fs.readFileSync(path.join(laneDir(2), body.spec_dir, 'spec.md'), 'utf8')).toContain('## Tiêu chí chấp nhận');
    expect(fs.readFileSync(path.join(laneDir(2), '.shipyard-docs/architecture.md'), 'utf8')).toContain('Xuất Excel');
    const q = Q.readProjectQueue('proj_9');
    expect(q.items).toEqual([]);
    expect(q.assigned).toEqual([expect.objectContaining({ slug: 'xuat-excel', title: 'Xuất Excel', lane: 2 })]);
  });

  it('a lane with its own queue, or of another project, does not take it; it waits for one', async () => {
    Q.enqueue('proj_9', feat('a', 'A'));
    let { calls, d } = deps([lane(1, 'proj_9'), lane(3, 'proj_X')], { laneQueue: n => ({ items: n === 1 ? [{ title: 'riêng' }] : [] }) });
    await Q.tickProjectQueues(d);
    expect(calls.assign).toEqual([]);
    ({ calls, d } = deps([lane(1, 'proj_9', { status: 'running' })]));
    await Q.tickProjectQueues(d);
    expect(calls.assign).toEqual([]);
    ({ calls, d } = deps([lane(1, 'proj_9', { status: 'passed', stage: 'done' })]));
    await Q.tickProjectQueues(d);
    expect(calls.state).toEqual([[1, ['set', 'status=idle']]]);
    expect(calls.assign.map(([n]) => n)).toEqual([1]);
  });

  it('two free lanes take two features in one pass', async () => {
    Q.enqueue('proj_9', feat('a', 'A'));
    Q.enqueue('proj_9', feat('b', 'B'));
    const { calls, d } = deps([lane(1, 'proj_9'), lane(2, 'proj_9')]);
    await Q.tickProjectQueues(d);
    expect(calls.assign.map(([n, b]) => [n, b.requirement])).toEqual([[1, 'Tính năng "A"'], [2, 'Tính năng "B"']]);
  });

  it('a roadmap item without an approved spec goes by its requirement and the project workflow', async () => {
    Q.enqueue('proj_9', { slug: 'dang-nhap', title: 'Đăng nhập', requirement: 'Tính năng "Đăng nhập" của dự án X:\nđăng nhập' });
    const { calls, d } = deps([lane(1, 'proj_9')]);
    await Q.tickProjectQueues(d);
    expect(calls.assign[0][1]).toEqual({ requirement: 'Tính năng "Đăng nhập" của dự án X:\nđăng nhập' });
  });

  it('a refused assignment stays queued with its reason', async () => {
    Q.enqueue('proj_9', feat('xuat-excel', 'Xuất Excel'));
    const { d } = deps([lane(1, 'proj_9')], { assign: async () => { throw new Error('lane 1 đang bận'); } });
    await Q.tickProjectQueues(d);
    const q = Q.readProjectQueue('proj_9');
    expect(q.items.map(x => x.slug)).toEqual(['xuat-excel']);
    expect(q.error).toBe('Chưa giao được "Xuất Excel": lane 1 đang bận');
  });

  it('a feature is built when its lane is done; dropping one from the queue marks it dropped', async () => {
    seed('proj_9');
    Q.enqueue('proj_9', feat('xuat-excel', 'Xuất Excel'));
    let { d } = deps([lane(2, 'proj_9')]);
    await Q.tickProjectQueues(d);
    // ship-feature resets the lane's title on init: "built" goes by the lane reaching done after the hand-off.
    ({ d } = deps([lane(2, 'proj_9', { status: 'passed', stage: 'done', feature_title: 'xuat-excel', stage_since: new Date(Date.now() + 1000).toISOString() })],
      { laneQueue: () => ({ items: [{ title: 'x' }] }) }));
    await Q.tickProjectQueues(d);
    expect(D.readDocs('proj_9').features[0].status).toBe('done');
    expect(Q.readProjectQueue('proj_9').assigned).toEqual([]);

    D.addFeature('proj_9', { slug: 'in-hd', title: 'In hoá đơn', brief: '# In', architecture: '', design: '', mockups: [] });
    Q.enqueue('proj_9', feat('in-hd', 'In hoá đơn'));
    Q.writeProjectQueue('proj_9', { remove: 'in-hd' });
    expect(D.readDocs('proj_9').features.find(f => f.slug === 'in-hd').status).toBe('dropped');
  });

  it('a done lane from before the hand-off does not count as built', async () => {
    seed('proj_9');
    Q.enqueue('proj_9', feat('xuat-excel', 'Xuất Excel'));
    let { d } = deps([lane(2, 'proj_9')]);
    await Q.tickProjectQueues(d);
    ({ d } = deps([lane(2, 'proj_9', { status: 'passed', stage: 'done', stage_since: '2020-01-01T00:00:00Z' })]));
    await Q.tickProjectQueues(d);
    expect(D.readDocs('proj_9').features[0].status).toBe('approved');
  });

  it('a feature queued while a lane is being assigned is kept', async () => {
    Q.enqueue('proj_9', feat('a', 'A'));
    const { d } = deps([lane(1, 'proj_9')], { assign: async () => { Q.enqueue('proj_9', feat('b', 'B')); } });
    await Q.tickProjectQueues(d);
    const q = Q.readProjectQueue('proj_9');
    expect(q.items.map(x => x.slug)).toEqual(['b']);
    expect(q.assigned.map(x => x.slug)).toEqual(['a']);
  });

  it('reordering from a stale list never drops a feature it did not know', () => {
    seed('proj_9');
    D.addFeature('proj_9', { slug: 'b', title: 'B', brief: '# B', architecture: '', design: '', mockups: [] });
    Q.enqueue('proj_9', feat('a', 'A'));
    Q.enqueue('proj_9', feat('b', 'B'));
    Q.enqueue('proj_9', feat('c', 'C'));                       // queued after the client loaded [a, b]
    Q.writeProjectQueue('proj_9', { order: ['b', 'a'] });
    expect(Q.readProjectQueue('proj_9').items.map(x => x.slug)).toEqual(['b', 'a', 'c']);
    Q.writeProjectQueue('proj_9', { remove: 'b' });
    expect(Q.readProjectQueue('proj_9').items.map(x => x.slug)).toEqual(['a', 'c']);
    expect(D.readDocs('proj_9').features.find(f => f.slug === 'b').status).toBe('dropped');
  });

  it('the lane gets the approved change design next to the spec, and the docs outside git', async () => {
    seed('proj_9');
    const work = fs.mkdtempSync(path.join(tmp, 'stu-'));
    fs.writeFileSync(path.join(work, 'architecture.md'), '# Xuất Excel — thay đổi');
    fs.writeFileSync(path.join(work, 'design.md'), '# Nút xuất');
    Q.enqueue('proj_9', { ...feat('xuat-excel', 'Xuất Excel'), designDir: work });
    fs.mkdirSync(path.join(laneDir(4), '.git', 'info'), { recursive: true });
    const { calls, d } = deps([lane(4, 'proj_9')]);
    await Q.tickProjectQueues(d);
    const dir = path.join(laneDir(4), calls.assign[0][1].spec_dir);
    expect(fs.readFileSync(path.join(dir, 'feature-architecture.md'), 'utf8')).toBe('# Xuất Excel — thay đổi');
    expect(fs.readFileSync(path.join(dir, 'design', 'design.md'), 'utf8')).toBe('# Nút xuất');
    expect(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8')).toContain('feature-architecture.md');
    expect(fs.existsSync(path.join(laneDir(4), 'docs'))).toBe(false);       // tracked docs/ is never touched
    expect(fs.readFileSync(path.join(laneDir(4), '.git/info/exclude'), 'utf8')).toContain('/.shipyard-docs/');
    expect(JSON.parse(fs.readFileSync(path.join(profileDir(4), 'project-docs.json'), 'utf8')))
      .toMatchObject({ brief: '.shipyard-docs/product-brief.md', architecture: '.shipyard-docs/architecture.md' });
  });

  it('never closes a session on an idle lane; only on a lane that finished its feature', async () => {
    Q.enqueue('proj_9', feat('a', 'A'));
    let { calls, d } = deps([lane(1, 'proj_9')], { isRunning: () => true });
    await Q.tickProjectQueues(d);
    expect(calls.stop).toEqual([]);
    expect(calls.assign).toEqual([]);
    ({ calls, d } = deps([lane(1, 'proj_9', { status: 'passed', stage: 'done' })], { isRunning: () => true }));
    await Q.tickProjectQueues(d);
    expect(calls.stop).toEqual([1]);
  });
});
