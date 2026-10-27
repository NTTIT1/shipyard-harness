import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, Q;
beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-queue-'));
  process.env.HARNESS_ROOT = tmp;
  Q = await import('../server/services/lanequeue.js');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const deps = (lanes, over = {}) => {
  const calls = { assign: [], stop: [], state: [] };
  return { calls, d: {
    lanes: async () => lanes, isRunning: () => false,
    stopSession: n => calls.stop.push(n), state: (n, a) => calls.state.push([n, a]),
    assign: async (n, body) => { calls.assign.push([n, body]); }, ...over,
  } };
};
const item = t => ({ title: t, requirement: `Tính năng "${t}"` });

describe('lane queue', () => {
  it('validates what is queued', () => {
    expect(() => Q.writeQueue(4, 'x')).toThrow(/danh sách/);
    expect(() => Q.writeQueue(4, [{ title: 'A' }])).toThrow(/thiếu/);
    expect(Q.writeQueue(4, [item('A'), item('B')]).items.map(x => x.title)).toEqual(['A', 'B']);
  });
  it('a finished lane gets the next feature; a busy one waits', async () => {
    Q.writeQueue(4, [item('A'), item('B')]);
    let { calls, d } = deps([{ lane: 4, status: 'running', stage: 'implementing' }]);
    await Q.tickQueues(d);
    expect(calls.assign).toEqual([]);
    ({ calls, d } = deps([{ lane: 4, status: 'passed', stage: 'done' }]));
    await Q.tickQueues(d);
    expect(calls.state).toEqual([[4, ['set', 'status=idle']]]);
    expect(calls.assign.map(([n, b]) => [n, b.requirement])).toEqual([[4, 'Tính năng "A"']]);
    expect(Q.readQueue(4).items.map(x => x.title)).toEqual(['B']);
  });
  it('closes a finished lane\'s open session first, and waits on a lane that asks something', async () => {
    Q.writeQueue(4, [item('B')]);
    let { calls, d } = deps([{ lane: 4, status: 'passed', stage: 'done' }], { isRunning: () => true });
    await Q.tickQueues(d);
    expect(calls.stop).toEqual([4]);
    expect(calls.assign).toEqual([]);
    ({ calls, d } = deps([{ lane: 4, status: 'idle', stage: 'idle', needs_action: 'duyệt ARCH' }]));
    await Q.tickQueues(d);
    expect(calls.assign).toEqual([]);
  });
  it('a refused assignment stays queued with its reason', async () => {
    Q.writeQueue(4, [item('B')]);
    const { d } = deps([{ lane: 4, status: 'idle' }], { assign: async () => { throw new Error('lane 4 đang bận'); } });
    await Q.tickQueues(d);
    expect(Q.readQueue(4)).toEqual({ items: [item('B')], error: 'Chưa giao được "B": lane 4 đang bận' });
  });
});
