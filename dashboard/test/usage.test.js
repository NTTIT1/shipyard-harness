// Token/cost tracking: per-turn deltas from cumulative modelUsage, phase mapping, aggregation.
import { describe, it, expect } from 'vitest';
import {
  diffModelUsage, toRecords, phaseOf, aggregate, normalizeEfforts, DEFAULT_SETTINGS, mergeSettings,
} from '../server/services/usage.js';

const mu = (i, o, cr, cw, usd) => ({ inputTokens: i, outputTokens: o, cacheReadInputTokens: cr, cacheCreationInputTokens: cw, costUSD: usd });

describe('diffModelUsage', () => {
  it('returns only the growth since the previous cumulative snapshot', () => {
    const prev = { opus: mu(100, 10, 1000, 50, 1.0) };
    const cur = { opus: mu(150, 30, 1500, 50, 1.5), haiku: mu(5, 1, 0, 0, 0.01) };
    const d = diffModelUsage(prev, cur);
    expect(d.opus).toEqual({ in: 50, out: 20, cacheRead: 500, cacheWrite: 0, usd: 0.5 });
    expect(d.haiku).toEqual({ in: 5, out: 1, cacheRead: 0, cacheWrite: 0, usd: 0.01 });
  });
  it('treats a shrinking total (reset / new session) as a fresh start and drops zero deltas', () => {
    const d = diffModelUsage({ opus: mu(500, 50, 0, 0, 5) }, { opus: mu(20, 2, 0, 0, 0.2), same: mu(0, 0, 0, 0, 0) });
    expect(d.opus.in).toBe(20);
    expect(d.same).toBeUndefined();
  });
});

describe('phaseOf', () => {
  it('maps role steps and sub-steps', () => {
    expect(phaseOf('pm')).toBe('PM');
    expect(phaseOf('plan-critic')).toBe('ARCH');
    expect(phaseOf('impl-worker')).toBe('DEV');
    expect(phaseOf('code-review')).toBe('DEV');
    expect(phaseOf('qc-local')).toBe('TEST');
    expect(phaseOf('ticketer')).toBe('ORCH');
  });
  it('maps the main session by lane stage', () => {
    expect(phaseOf('main', 'implementing')).toBe('DEV');
    expect(phaseOf('main', 'review-ba')).toBe('BA');
    expect(phaseOf('main', 'qc')).toBe('TEST');
    expect(phaseOf('main', 'booting')).toBe('ORCH');
  });
});

describe('toRecords', () => {
  it('tags each model delta with the lane context', () => {
    const recs = toRecords({ at: '2026-10-16T01:00:00Z', lane: 2, source: 'step', step: 'pm', runId: 'run_1', featureTitle: 'Chat', effort: 'high' },
      { opus: { in: 1, out: 2, cacheRead: 3, cacheWrite: 4, usd: 0.5 } });
    expect(recs).toEqual([{ at: '2026-10-16T01:00:00Z', lane: 2, source: 'step', step: 'pm', stage: '', phase: 'PM', model: 'opus',
      effort: 'high', runId: 'run_1', feature: 'run_1', featureTitle: 'Chat', in: 1, out: 2, cacheRead: 3, cacheWrite: 4, usd: 0.5 }]);
  });
  it('falls back to spec_dir / title for the feature key', () => {
    const [r] = toRecords({ lane: 1, step: 'main', specDir: 'specs/x', featureTitle: 'X' }, { m: { in: 1, out: 0, cacheRead: 0, cacheWrite: 0, usd: 0 } });
    expect(r.feature).toBe('lane1:specs/x');
  });
});

describe('aggregate', () => {
  const recs = [
    { at: '2026-10-10T03:00:00Z', lane: 2, step: 'pm', phase: 'PM', model: 'opus', feature: 'run_1', featureTitle: 'Chat', in: 100, out: 10, cacheRead: 0, cacheWrite: 0, usd: 3 },
    { at: '2026-10-11T03:00:00Z', lane: 2, step: 'main', phase: 'DEV', model: 'opus', feature: 'run_1', featureTitle: 'Chat', in: 200, out: 20, cacheRead: 50, cacheWrite: 5, usd: 6 },
    { at: '2026-10-11T05:00:00Z', lane: 1, step: 'main', phase: 'DEV', model: 'sonnet', feature: 'run_2', featureTitle: 'CV', in: 10, out: 1, cacheRead: 0, cacheWrite: 0, usd: 1 },
    { at: '2026-09-30T05:00:00Z', lane: 1, step: 'main', phase: 'DEV', model: 'sonnet', feature: 'run_0', featureTitle: 'Old', in: 10, out: 1, cacheRead: 0, cacheWrite: 0, usd: 4 },
  ];
  const settings = mergeSettings({ usdToVnd: 25000, planFeeVnd: 5_000_000,
    rates: { PM: 100000, BA: 100000, TECH_LEAD: 100000, DESIGNER: 100000, DEVELOPER: 200000, TESTER: 100000 },
    hours: { PM: 2, BA: 0, ARCH: 0, DESIGN: 6, DEV: 10, TEST: 0 } });

  it('totals the month and allocates the plan fee by share of API-equivalent value', () => {
    const a = aggregate(recs, settings, { month: '2026-10' });
    expect(a.totals.usd).toBe(10);
    expect(a.totals.tokens).toEqual({ in: 310, out: 31, cacheRead: 50, cacheWrite: 5 });
    expect(a.totals.vnd).toBe(5_000_000);
    const chat = a.features.find(f => f.key === 'run_1');
    expect(chat.vnd).toBe(4_500_000);
    expect(chat.phases.PM.usd).toBe(3);
    expect(chat.phases.DEV.steps.main.usd).toBe(6);
  });
  it('compares with human cost (design hours only when the feature had a design phase)', () => {
    const chat = aggregate(recs, settings, { month: '2026-10' }).features.find(f => f.key === 'run_1');
    expect(chat.humanVnd).toBe(2 * 100000 + 10 * 200000);
    expect(chat.ratio).toBeCloseTo(4_500_000 / 2_200_000);
    expect(chat.aiHours).toBeCloseTo(4_500_000 / 200000);
  });
  it('uses per-feature hour overrides', () => {
    const s = { ...settings, featureHours: { run_1: { DEV: 40 } } };
    const chat = aggregate(recs, s, { month: '2026-10' }).features.find(f => f.key === 'run_1');
    expect(chat.humanVnd).toBe(2 * 100000 + 40 * 200000);
  });
  it('falls back to API price × rate when no plan fee is set, and groups by day/lane/model', () => {
    const a = aggregate(recs, mergeSettings({ usdToVnd: 25000 }), { month: '2026-10' });
    expect(a.totals.vnd).toBe(250000);
    expect(a.byDay.map(d => d.day)).toEqual(['2026-10-10', '2026-10-11']);
    expect(a.byLane.find(l => l.lane === 2).usd).toBe(9);
    expect(a.byModel.map(m => m.model)).toEqual(['opus', 'sonnet']);
  });
});

describe('settings & effort', () => {
  it('fills defaults', () => {
    expect(mergeSettings({}).rates.DEVELOPER).toBe(DEFAULT_SETTINGS.rates.DEVELOPER);
    expect(mergeSettings({ rates: { PM: 1 } }).rates.PM).toBe(1);
  });
  it('validates effort levels and drops "default"', () => {
    expect(normalizeEfforts({ pm: 'HIGH', main: '', ba: 'default' }, ['pm', 'main', 'ba'])).toEqual({ pm: 'high' });
    expect(() => normalizeEfforts({ pm: 'turbo' }, ['pm'])).toThrow(/effort/);
    expect(() => normalizeEfforts({ nope: 'low' }, ['pm'])).toThrow(/bước/);
  });
});

describe('records from run-step (python) carry no phase', () => {
  it('derives the phase from step/stage', () => {
    const a = aggregate([{ at: '2026-10-10T03:00:00Z', lane: 2, step: 'qc-local', model: 'opus', feature: 'f', in: 1, out: 1, cacheRead: 0, cacheWrite: 0, usd: 1 }],
      mergeSettings(), { month: '2026-10' });
    expect(Object.keys(a.features[0].phases)).toEqual(['TEST']);
  });
});

describe('vnd rounding', () => {
  it('rounds only the final sums so a fully allocated fee adds up exactly', () => {
    const recs = [1, 2, 3].map(i => ({ at: `2026-10-1${i}T03:00:00Z`, lane: 1, step: 'main', model: 'm', feature: 'f', in: 1, out: 0, cacheRead: 0, cacheWrite: 0, usd: 1 }));
    const a = aggregate(recs, mergeSettings({ planFeeVnd: 1000000 }), { month: '2026-10' });
    expect(a.totals.vnd).toBe(1000000);
    expect(a.features[0].vnd).toBe(1000000);
    expect(a.byDay[0].vnd).toBe(333333);
  });
});
