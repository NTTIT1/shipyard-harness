import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, A, P;
const MODELS = {
  main: 'claude:claude-opus-5-5', 'plan-critic': 'claude:claude-opus-5-5', 'impl-worker': 'claude:claude-opus-5-5',
  'code-review': 'claude:claude-opus-5-5', 'qc-local': 'claude:claude-opus-5-5', 'senior-gate': 'claude:claude-opus-5-5',
  ticketer: 'claude:claude-opus-5-5', 'dev-qc': 'claude:claude-opus-5-5',
};

function deps(over = {}) {
  const calls = { state: [], up: [], start: [], gw: 0 };
  return {
    calls,
    d: {
      lane: async n => ({ lane: n, status: 'idle', stage: 'idle', api_up: false }),
      isRunning: () => false,
      ensureGateway: async () => { calls.gw++; return { ok: true, output: '' }; },
      state: args => calls.state.push(args),
      laneUp: n => calls.up.push(n),
      startSession: (n, o) => calls.start.push([n, o]),
      ...over,
    },
  };
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-assign-'));
  process.env.HARNESS_ROOT = tmp;
  fs.mkdirSync(path.join(tmp, 'config'));
  A = await import('../server/services/assign.js');
  P = await import('../server/services/providers.js');
  P.writeProviders({ openai: { api_key: 'sk-test-0000000000' } });
  P.setProviderModels('openai', ['gpt-x']);
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('assignLane', () => {
  it('writes state, boots the stack and starts /ship-feature on the main model', async () => {
    const { d, calls } = deps();
    await A.assignLane(1, { requirement: 'Thêm màn hình nghỉ phép', models: MODELS, impl_agents: 3 }, d);
    expect(calls.state[0]).toEqual(['init']);
    expect(calls.state[1]).toEqual(['set', 'status=assigned', 'stage=assigned', 'impl_agents=3', 'feature_title=Thêm màn hình nghỉ phép']);
    expect(calls.state[2][0]).toBe('set-json');
    expect(JSON.parse(calls.state[2][2])).toEqual(MODELS);
    expect(calls.up).toEqual([1]);
    expect(calls.start).toEqual([[1, { model: 'claude-opus-5-5', prompt: '/ship-feature Thêm màn hình nghỉ phép' }]]);
    expect(calls.gw).toBe(0);
  });
  it('uses the spec dir as the /ship-feature argument', () => {
    expect(A.buildPrompt({ spec_dir: 'specs/2026-10-13-x' })).toBe('/ship-feature specs/2026-10-13-x');
  });
  it('ensures the gateway when a non-Claude model is chosen', async () => {
    const { d, calls } = deps();
    await A.assignLane(2, { requirement: 'x', models: { ...MODELS, 'code-review': 'openai:gpt-x' } }, d);
    expect(calls.gw).toBe(1);
  });
  it('409 when the lane state is busy', async () => {
    const { d } = deps({ lane: async n => ({ lane: n, status: 'running', stage: 'implementing' }) });
    await expect(A.assignLane(1, { requirement: 'x', models: MODELS }, d)).rejects.toMatchObject({ status: 409 });
  });
  it('409 when a session is live even though state reads idle', async () => {
    const { d } = deps({ isRunning: () => true });
    await expect(A.assignLane(1, { requirement: 'x', models: MODELS }, d)).rejects.toMatchObject({ status: 409 });
  });
  it('400 on invalid models, empty requirement, or a non-Claude main', async () => {
    const { d } = deps();
    await expect(A.assignLane(1, { requirement: '', models: MODELS }, d)).rejects.toMatchObject({ status: 400 });
    await expect(A.assignLane(1, { requirement: 'x', models: { ...MODELS, main: 'openai:gpt-x' } }, d))
      .rejects.toMatchObject({ status: 400, message: 'main: phiên chính chỉ dùng model Claude' });
    await expect(A.assignLane(1, { spec_dir: '../etc', models: MODELS }, d)).rejects.toMatchObject({ status: 400 });
  });
  it('503 when the gateway cannot start, before any state is written', async () => {
    const { d, calls } = deps({ ensureGateway: async () => ({ ok: false, output: 'docker: not found' }) });
    await expect(A.assignLane(1, { requirement: 'x', models: { ...MODELS, 'qc-local': 'openai:gpt-x' } }, d))
      .rejects.toMatchObject({ status: 503 });
    expect(calls.state).toEqual([]);
  });
});
