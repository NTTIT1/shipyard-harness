import { describe, it, expect } from 'vitest';
import { evaluateQuota, grantPatch, usageModelName, describeCheck, pctOf, quotaBoard } from '../server/services/quota.js';
import { mergeSettings } from '../server/services/usage.js';

const now = new Date('2026-11-20T03:00:00Z');
const rec = (o) => ({ at: '2026-11-10T03:00:00Z', lane: 1, step: 'main', model: 'claude-opus-5-5', in: 100, out: 100, cacheRead: 0, cacheWrite: 0, usd: 1, ...o });

describe('evaluateQuota', () => {
  it('blocks the lane once the shared month budget is used up, warns from quotaWarnPct', () => {
    const s = mergeSettings({ monthlyBudgetUsd: 10, monthlyTokenLimit: 0 });
    const warn = evaluateQuota({ records: [rec({ usd: 8.5 })], settings: s, lane: 1, models: ['claude:claude-opus-5-5'], now });
    expect(warn.level).toBe('warn');
    expect(warn.warning[0].id).toBe('month:all');
    const block = evaluateQuota({ records: [rec({ usd: 6 }), rec({ lane: 2, usd: 4 })], settings: s, lane: 1, models: [], now });
    expect(block.level).toBe('blocked');
    expect(block.blocking[0]).toMatchObject({ scope: 'month', pct: 100 });
  });

  it('only counts the current month', () => {
    const s = mergeSettings({ monthlyBudgetUsd: 10 });
    const q = evaluateQuota({ records: [rec({ at: '2026-10-30T03:00:00Z', usd: 50 })], settings: s, lane: 1, now });
    expect(q.level).toBe('ok');
  });

  it("checks the lane's own limit, its project's and the model it runs on", () => {
    const s = mergeSettings({
      monthlyBudgetUsd: 1000,
      laneLimits: { '1': { usd: 5 } },
      projectLimits: { p1: { usd: 100 } },
      modelLimits: { 'claude-opus-5-5': { usd: 3 } },
    });
    const records = [rec({ usd: 2, projectId: 'p1' }), rec({ lane: 2, usd: 2, projectId: 'p1' })];
    const q = evaluateQuota({ records, settings: s, lane: 1, models: ['claude:claude-opus-5-5'], ctx: { projectId: 'p1' }, now });
    const byId = Object.fromEntries(q.checks.map(c => [c.id, c]));
    expect(byId['lane:1'].used).toBe(2);
    expect(byId['project:p1'].used).toBe(4);
    expect(byId['model:claude-opus-5-5']).toMatchObject({ used: 4, level: 'blocked' });
    expect(q.level).toBe('blocked');
    // A lane on another model is not stopped by Opus's limit.
    const sonnet = evaluateQuota({ records, settings: s, lane: 1, models: ['claude:claude-sonnet-5-5'], ctx: { projectId: 'p1' }, now });
    expect(sonnet.level).toBe('ok');
  });

  it('measures priced usage in USD and free gateway usage in tokens', () => {
    expect(pctOf({ usd: 1, tokens: 10e6, limitUsd: 10, limitTokens: 1e6 })).toBe(10);
    expect(pctOf({ usd: 0, tokens: 2e6, limitUsd: 10, limitTokens: 1e6 })).toBe(200);
    const s = mergeSettings({ monthlyBudgetUsd: 0, monthlyTokenLimit: 0, modelLimits: { 'gemini/flash': { tokens: 1000 } } });
    const q = evaluateQuota({ records: [rec({ model: 'gemini/flash', usd: 0, in: 900, out: 200 })], settings: s, lane: 1, models: ['gemini:flash'], now });
    expect(q.blocking[0]).toMatchObject({ id: 'model:gemini/flash', unit: 'tokens' });
  });

  it('a reset counts the limit again from that moment', () => {
    const s = mergeSettings({ monthlyBudgetUsd: 1000, laneLimits: { '1': { usd: 5 } }, quotaResets: { 'lane:1': '2026-11-15T00:00:00Z' } });
    const q = evaluateQuota({ records: [rec({ usd: 9 }), rec({ at: '2026-11-16T00:00:00Z', usd: 1 })], settings: s, lane: 1, now });
    expect(q.checks.find(c => c.id === 'lane:1').used).toBe(1);
    expect(q.level).toBe('ok');
  });

  it("enforces the workflow step's VND budget for the run", () => {
    const s = mergeSettings({ monthlyBudgetUsd: 1000, usdToVnd: 25000 });
    const records = [rec({ runId: 'r1', phase: 'DEV', usd: 4 }), rec({ runId: 'r1', phase: 'PM', usd: 4 }), rec({ runId: 'r0', phase: 'DEV', usd: 4 })];
    const q = evaluateQuota({ records, settings: s, lane: 1, ctx: { runId: 'r1', phase: 'DEV', stepConfig: { DEV: { budgetVnd: 100000 } } }, now });
    expect(q.blocking.map(c => c.id)).toEqual(['phase:DEV']);
    expect(q.blocking[0]).toMatchObject({ used: 100000, limit: 100000, unit: 'vnd' });
  });

  it("stops Claude models while Anthropic refuses the plan window, not gateway models", () => {
    const s = mergeSettings({ monthlyBudgetUsd: 1000 });
    const plan = { five_hour: { status: 'rejected', utilization: 1, resetsAt: '2026-11-20T05:00:00Z' }, seven_day: { status: 'allowed_warning', utilization: 0.9, resetsAt: '2026-11-25T00:00:00Z' } };
    const q = evaluateQuota({ records: [], settings: s, lane: 1, models: ['claude:claude-opus-5-5'], plan, now });
    expect(q.blocking[0]).toMatchObject({ id: 'plan:five_hour', resetsAt: '2026-11-20T05:00:00Z', grantable: false });
    expect(q.warning[0].id).toBe('plan:seven_day');
    expect(evaluateQuota({ records: [], settings: s, lane: 1, models: ['gemini:flash'], plan, now }).level).toBe('ok');
    // A refusal whose reset time has passed no longer counts.
    const old = { five_hour: { status: 'rejected', resetsAt: '2026-11-19T00:00:00Z' } };
    expect(evaluateQuota({ records: [], settings: s, lane: 1, models: ['claude-opus-5-5'], plan: old, now }).level).toBe('ok');
  });
});

describe('grantPatch', () => {
  it('raises the limit to what was used plus the grant', () => {
    const s = mergeSettings({ modelLimits: { m: { usd: 3, tokens: 9 } } });
    expect(grantPatch(s, { scope: 'model', key: 'm', unit: 'usd', used: 3.5, limit: 3 }, 5)).toEqual({ modelLimits: { m: { usd: 8.5, tokens: 9 } } });
    expect(grantPatch(s, { scope: 'month', key: 'all', unit: 'usd', used: 10, limit: 10 }, 20)).toEqual({ monthlyBudgetUsd: 30 });
    expect(grantPatch(s, { scope: 'lane', key: '2', unit: 'tokens', used: 10, limit: 10 }, 5)).toEqual({ laneLimits: { '2': { tokens: 15 } } });
    expect(grantPatch(s, { scope: 'phase', key: 'DEV', unit: 'vnd', used: 120000, limit: 100000 }, 50000)).toEqual({ phase: 'DEV', budgetVnd: 170000 });
  });
  it('refuses nonsense and the Claude plan', () => {
    expect(() => grantPatch(mergeSettings(), { scope: 'lane', key: '1', unit: 'usd', used: 1, limit: 1 }, 0)).toThrow();
    expect(() => grantPatch(mergeSettings(), { scope: 'plan', key: 'five_hour' }, 5)).toThrow(/Anthropic/);
  });
});

describe('helpers', () => {
  it('maps a lane model to the name usage rows carry', () => {
    expect(usageModelName('claude:claude-opus-5-5')).toBe('claude-opus-5-5');
    expect(usageModelName('gemini:gemini-2.5-pro')).toBe('gemini/gemini-2.5-pro');
    expect(usageModelName('claude-haiku-5-5')).toBe('claude-haiku-5-5');
  });
  it('describes a check in one line', () => {
    expect(describeCheck({ label: 'Hạn mức lane 1', unit: 'usd', used: 10.2, limit: 10, pct: 102, scope: 'lane' })).toBe('Hạn mức lane 1: $10.20 / $10.00 (102%)');
  });
});

describe('quotaBoard', () => {
  it('lists every limit, set or not, and the held lanes', () => {
    const s = mergeSettings({ monthlyBudgetUsd: 20, laneLimits: { '2': { usd: 1 } }, modelLimits: { 'claude-opus-5-5': { usd: 100 } } });
    const records = [rec({ usd: 3, projectId: 'p1' }), rec({ lane: 2, usd: 2, model: 'claude-sonnet-5-5' })];
    const lanes = [{ lane: 1, run_project_id: 'p1', feature_title: 'Đăng nhập' }, { lane: 2, run_project_id: 'p1', quota_hold: { at: 'x', checks: [{ id: 'lane:2' }] } }];
    const b = quotaBoard({ records, settings: s, lanes, now, defaultProjectId: 'p0' });
    expect(b.rows.month[0]).toMatchObject({ used: 5, limit: 20, pct: 25, enforced: true });
    expect(b.rows.lane.map(l => [l.key, l.enforced, l.level])).toEqual([['1', false, 'ok'], ['2', true, 'blocked']]);
    expect(b.rows.lane[0]).toMatchObject({ usd: 3, feature: 'Đăng nhập', projectId: 'p1' });
    expect(b.rows.model.map(m => m.key)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
    expect(b.rows.project.map(p => [p.key, p.usd, p.lanes])).toEqual([['p1', 3, [1, 2]], ['p0', 2, []]]);
    expect(b.held).toEqual([{ lane: 2, at: 'x', checks: [{ id: 'lane:2' }], feature: '', projectId: 'p1' }]);
  });
});
