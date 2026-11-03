import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as G from '../server/services/quotaguard.js';
import { readHold } from '../server/services/quota.js';
import { readSettings, writeSettings } from '../server/services/usage.js';

const now = new Date('2026-11-20T03:00:00Z');
let tmp, records, laneState, calls, running, ctx;

function fakeSessions() {
  return {
    isRunning: () => running,
    stopSession: n => { calls.push(['stop', n]); running = false; },
    startSession: (n, o) => { calls.push(['start', n, o.resume, o.prompt, o.model]); running = true; },
    sendMessage: (n, t, o) => calls.push(['send', n, t, o]),
    sessionInfo: () => ({ model: 'claude:claude-opus-5-5', session_id: 'sess-1' }),
    notify: (n, ev) => calls.push(['notify', n, ev.kind, ev.level]),
    cancelLimitWake: n => calls.push(['nowake', n]),
  };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-'));
  process.env.HARNESS_ROOT = tmp;
  records = []; laneState = { status: 'running', notes: 'đang code' }; calls = []; running = true; ctx = {};
  G.configureQuotaGuard({
    sessions: fakeSessions(),
    state: (n, args) => {
      calls.push(['state', n, ...args]);
      if (args[0] === 'set') { const [k, ...v] = args[1].split('='); laneState[k] = v.join('='); }
      if (args[0] === 'set-json') ctx.stepConfig = JSON.parse(args[2]);
      return { status: 0 };
    },
    readLaneState: () => ({ ...laneState }),
    records: () => records,
    plan: () => ({}),
    context: () => ctx,
    now: () => now,
  });
  writeSettings({ monthlyBudgetUsd: 10, monthlyTokenLimit: 0 });
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); delete process.env.HARNESS_ROOT; });

const spend = (usd, o = {}) => records.push({ at: '2026-11-19T00:00:00Z', lane: 3, step: 'main', model: 'claude-opus-5-5', in: 1, out: 1, cacheRead: 0, cacheWrite: 0, usd, ...o });

describe('checkLane', () => {
  it('warns once at the threshold and the lane keeps working', () => {
    spend(8.5);
    G.checkLane(3);
    G.checkLane(3);
    expect(calls.filter(c => c[0] === 'notify')).toEqual([['notify', 3, 'quota', 'warn']]);
    expect(readHold(3)).toBe(null);
    expect(running).toBe(true);
  });

  it('over the limit: holds the lane, blocks its state, posts the card, stops the session', () => {
    spend(10.5);
    G.checkLane(3);
    const hold = readHold(3);
    expect(hold.checks[0].id).toBe('month:all');
    expect(hold).toMatchObject({ prevStatus: 'running', prevNotes: 'đang code', posted: true, sessionStopped: true });
    expect(laneState.status).toBe('blocked');
    expect(laneState.needs_action).toBe('quota');
    expect(calls).toContainEqual(['notify', 3, 'quota', 'blocked']);
    expect(calls).toContainEqual(['nowake', 3]);
    expect(calls).toContainEqual(['stop', 3]);
  });

  it("counts the turn still in progress (it is not in usage.jsonl yet)", () => {
    spend(9);
    G.checkLane(3, { turn: { in: 100000, out: 40000, cacheRead: 0, cacheWrite: 0 } });   // ≈ $1.5 on Opus
    expect(readHold(3)?.checks[0].id).toBe('month:all');
  });

  it("Claude's plan refusal is not a hold (Anthropic lifts it; the wake-up handles it)", () => {
    G.configureQuotaGuard({ plan: () => ({ five_hour: { status: 'rejected', resetsAt: '2026-11-20T05:00:00Z' } }) });
    G.checkLane(3);
    expect(readHold(3)).toBe(null);
  });
});

describe('quotaGate', () => {
  it('refuses new work while held or over a limit', () => {
    expect(G.quotaGate(3)).toBe('');
    spend(11);
    expect(G.quotaGate(3)).toMatch(/hết hạn mức/);
  });
});

describe('admin actions', () => {
  beforeEach(() => { spend(10.5); G.checkLane(3); calls = []; });

  it('grant raises the limit above what was used, then the lane goes on where it stopped', () => {
    const r = G.grantQuota(3, 'month:all', 5, { by: 'admin@x' });
    expect(readSettings().monthlyBudgetUsd).toBe(15.5);
    expect(r.hold).toBe(null);
    expect(readHold(3)).toBe(null);
    expect(laneState).toMatchObject({ status: 'running', notes: 'đang code', needs_action: '' });
    expect(calls.find(c => c[0] === 'start')).toEqual(['start', 3, 'sess-1', G.RESUME_MSG, 'claude:claude-opus-5-5']);
    expect(calls).toContainEqual(['notify', 3, 'quota', 'released']);
  });

  it('a grant that is not enough keeps the lane held', () => {
    writeSettings({ laneLimits: { '3': { usd: 1 } } });
    const r = G.grantQuota(3, 'month:all', 5);
    expect(r.hold).not.toBe(null);
    expect(calls.find(c => c[0] === 'start')).toBeUndefined();
  });

  it('reset counts the limit again from now', () => {
    G.resetQuota(3, 'month:all');
    expect(readSettings().quotaResets['month:all']).toBe(now.toISOString());
    expect(readHold(3)).toBe(null);
  });

  it('continue refuses while still over the limit', () => {
    expect(() => G.releaseLane(3)).toThrow(/vẫn hết hạn mức/);
    writeSettings({ monthlyBudgetUsd: 100 });
    G.releaseLane(3);
    expect(readHold(3)).toBe(null);
  });

  it('switching the main model away from a blocked model lets the lane go on, on the new model', () => {
    G.grantQuota(3, 'month:all', 100);
    writeSettings({ modelLimits: { 'claude-opus-5-5': { usd: 5 } } });
    G.checkLane(3);
    expect(readHold(3).checks.map(c => c.id)).toEqual(['model:claude-opus-5-5']);
    running = false; calls = [];
    ctx = { models: { main: 'claude:claude-sonnet-5-5' } };
    G.releaseLane(3);
    expect(readHold(3)).toBe(null);
    expect(calls.find(c => c[0] === 'start')[4]).toBe('claude:claude-sonnet-5-5');
  });

  it("grant on a workflow step's budget goes to the lane's step_config", () => {
    G.grantQuota(3, 'month:all', 100);
    ctx = { runId: 'r1', stage: 'implement', stepConfig: { DEV: { budgetVnd: 100000, model: 'x' } } };
    spend(5, { runId: 'r1', phase: 'DEV' });
    G.checkLane(3);
    expect(readHold(3).checks.map(c => c.id)).toEqual(['phase:DEV']);
    G.grantQuota(3, 'phase:DEV', 200000);
    expect(ctx.stepConfig.DEV).toEqual({ budgetVnd: Math.max(100000, Math.round(5 * 26000)) + 200000, model: 'x' });
    expect(readHold(3)).toBe(null);
  });
});

describe('a hold left by a headless step', () => {
  it('is posted by the dashboard tick: card + session stopped', () => {
    G.configureQuotaGuard({ sessions: null });
    spend(11);
    G.holdLane(3, G.laneQuota(3).blocking, { source: 'step' });
    expect(readHold(3).posted).toBe(false);
    G.configureQuotaGuard({ sessions: fakeSessions() });
    G.tickQuotas([{ lane: 3, status: 'blocked' }]);
    expect(readHold(3).posted).toBe(true);
    expect(calls).toContainEqual(['stop', 3]);
  });
});
