import { describe, it, expect } from 'vitest';
import { featureStats, activeAgents, attentionItems, projectCost, recentRuns } from '../src/lib/overview.js';

const runs = [
  { id: 'a', status: 'RUNNING', updatedAt: '2026-11-05T09:00:00Z' },
  { id: 'b', status: 'WAITING_REVIEW', updatedAt: '2026-11-05T10:00:00Z' },
  { id: 'c', status: 'DONE', kind: 'FEATURE', updatedAt: '2026-11-04T10:00:00Z' },
  { id: 'd', status: 'DONE', updatedAt: '2026-11-03T10:00:00Z' },
  { id: 'e', status: 'CANCELLED', updatedAt: '2026-11-02T10:00:00Z' },
  { id: 's', status: 'DONE', kind: 'SETUP', updatedAt: '2026-11-06T10:00:00Z' },
  { id: 'p', status: 'RUNNING', kind: 'BLUEPRINT' },
];

describe('project overview', () => {
  it('counts feature runs by status, leaving setup and blueprint runs out', () => {
    expect(featureStats(runs)).toEqual({ running: 1, waiting: 1, releasing: 0, done: 2, cancelled: 1, total: 5, open: 2, donePct: 40 });
    expect(featureStats([]).donePct).toBeNull();
  });

  it('lists the lanes with an AI at work, live sessions first, then the longest in their step', () => {
    const lanes = [
      { lane: 1, status: 'idle' },
      { lane: 2, status: 'running', feature_title: 'Xuất bảng lương', session_running: true, stage: 'implement', stage_age_sec: 60 },
      { lane: 3, status: 'waiting', feature_title: 'Báo cáo', stage: 'review-pm', stage_age_sec: 600 },
      { lane: 4, status: 'running', feature_title: 'SSO', session_active: true, stage: 'qc', stage_age_sec: 300 },
    ];
    expect(activeAgents(lanes).map(a => a.lane)).toEqual([4, 2, 3]);
    expect(activeAgents(lanes)[2]).toMatchObject({ live: false, stage: 'review-pm', since: 600 });
  });

  it('collects what needs a person, including PRs not merged yet', () => {
    const items = attentionItems([
      { lane: 1, status: 'blocked', feature_title: 'A', notes: 'CI đỏ' },
      { lane: 2, status: 'running', pr_url: 'https://x/pull/7', stage: 'watching-pr' },
      { lane: 3, status: 'idle', pr_url: 'https://x/pull/6', stage: 'done' },
      { lane: 4, status: 'running' },
    ]);
    expect(items.map(i => [i.lane, i.kind])).toEqual([[1, 'blocked'], [2, 'pr']]);
    expect(items[0].note).toBe('CI đỏ');
  });

  it('shows the cost only when the server sent it (project OWNER / admin)', () => {
    const pc = { month: '2026-11', byProject: [{ projectId: 'P1', vnd: 120000, usd: 4.8, tokens: { in: 10, out: 5 }, quotaPct: 12 }] };
    expect(projectCost(pc, 'P1')).toEqual({ vnd: 120000, usd: 4.8, tokens: 15, quotaPct: 12, month: '2026-11' });
    expect(projectCost({ byProject: [] }, 'P1', [{ lane: 1 }])).toBeNull();
    expect(projectCost({}, 'P1', [{ lane: 1, cost_vnd: 1000, cost_usd: 0.04 }])).toMatchObject({ vnd: 1000, usd: 0.04 });
  });

  it('lists the latest feature runs first', () => {
    expect(recentRuns(runs, 3).map(r => r.id)).toEqual(['b', 'a', 'c']);
  });
});
