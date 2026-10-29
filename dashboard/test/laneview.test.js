import { describe, it, expect } from 'vitest';
import { laneAttention, sortLanes, isFree, primaryActions, mergeSteps, workflowTrack, stageLabel } from '../src/lib/laneview.js';

const L = o => ({ lane: 1, status: 'idle', stage: 'idle', liveness: 'idle', ...o });

describe('laneAttention', () => {
  it('prioritises a live question over everything', () => {
    expect(laneAttention(L({ pending_kind: 'question', status: 'blocked', liveness: 'dead' }))).toBe('question');
    expect(laneAttention(L({ pending_kind: 'permission' }))).toBe('question');
  });
  it('spec approval, blocked, dead, needs_action, none', () => {
    expect(laneAttention(L({ stage: 'spec-review', status: 'waiting' }))).toBe('approve');
    expect(laneAttention(L({ status: 'blocked' }))).toBe('blocked');
    expect(laneAttention(L({ liveness: 'dead', status: 'running' }))).toBe('dead');
    expect(laneAttention(L({ needs_action: 'merge PR' }))).toBe('needs');
    expect(laneAttention(L({}))).toBe(null);
  });
});

describe('sortLanes', () => {
  it('attention first, then running, then the rest, by lane number', () => {
    const out = sortLanes([
      L({ lane: 1 }), L({ lane: 2, status: 'running' }), L({ lane: 3, status: 'blocked' }),
      L({ lane: 4 }), L({ lane: 5, status: 'provisioning' }),
    ]).map(l => l.lane);
    expect(out).toEqual([3, 2, 5, 1, 4]);
  });
  it('does not mutate its input', () => {
    const a = [L({ lane: 2 }), L({ lane: 1 })];
    sortLanes(a);
    expect(a.map(l => l.lane)).toEqual([2, 1]);
  });
});

describe('isFree / primaryActions', () => {
  it('free lane offers assign', () => {
    expect(isFree(L({}))).toBe(true);
    expect(primaryActions(L({}))).toEqual(['assign']);
  });
  it('running session offers stop; spec-review adds approve first', () => {
    expect(isFree(L({ session_running: true }))).toBe(false);
    expect(primaryActions(L({ session_running: true, status: 'running' }))).toEqual(['stop']);
    expect(primaryActions(L({ session_running: true, stage: 'spec-review', status: 'waiting' }))).toEqual(['approve', 'stop']);
  });
  it('resumable session offers resume; busy lane without session offers nothing', () => {
    expect(primaryActions(L({ session_resumable: true, status: 'running' }))).toEqual(['resume']);
    expect(primaryActions(L({ status: 'running' }))).toEqual([]);
  });
  it('archived snapshot offers no live action', () => {
    expect(primaryActions(L({}), { archived: true })).toEqual([]);
  });
});

describe('mergeSteps', () => {
  it('merges start/end by id in first-seen order and keeps the start time', () => {
    const out = mergeSteps([
      { id: 'a', step: 'qc-local', model: 'claude:x', event: 'start', at: 't1' },
      { id: 'b', step: 'code-review', model: 'openai:y', event: 'start', at: 't2' },
      { id: 'a', step: 'qc-local', model: 'claude:x', event: 'end', at: 't3', exit: 0, verdict: 'LOCAL-QC: PASS' },
    ]);
    expect(out.map(s => s.id)).toEqual(['a', 'b']);
    expect(out[0]).toMatchObject({ event: 'end', exit: 0, started: 't1', at: 't3' });
    expect(out[1]).toMatchObject({ event: 'start', started: 't2' });
  });
  it('tolerates missing/invalid input', () => {
    expect(mergeSteps(undefined)).toEqual([]);
    expect(mergeSteps('x')).toEqual([]);
  });
});

describe('workflowTrack', () => {
  // Doanh nghiệp preset: BA → Plan → Thiết kế UI → PM → Lập trình → Kiểm thử.
  const ENT = ['BA', 'ARCH', 'DESIGN', 'PM', 'DEV', 'TEST'];
  const view = (statuses, run = {}) => ({
    run: { id: 'run_1', status: 'RUNNING', ...run },
    steps: ENT.map((step, i) => ({ step, status: statuses[i] || 'PENDING' })),
  });

  it('shows the workflow steps in its own order, the current one marked', () => {
    const t = workflowTrack(view(['APPROVED', 'APPROVED', 'AWAITING_REVIEW'], { currentStep: 'DESIGN', status: 'WAITING_REVIEW' }), { status: 'waiting' });
    expect(t.steps.map(s => s.label)).toEqual(['BA — Nghiệp vụ', 'Plan — Kiến trúc', 'Thiết kế UI', 'PM — Yêu cầu', 'Lập trình', 'Kiểm thử']);
    expect(t.steps.map(s => s.state)).toEqual(['done', 'done', 'current', 'pending', 'pending', 'pending']);
    expect(t.current).toMatchObject({ id: 'DESIGN', sub: 'Chờ duyệt' });
    expect(t.progress).toBe(33);
  });

  it('hides steps the workflow left out, keeps DESIGN skipped for no UI', () => {
    const v = view(['APPROVED', 'APPROVED', 'SKIPPED', 'AI_WORKING'], { currentStep: 'PM' });
    v.steps[0] = { step: 'BA', status: 'SKIPPED', skipReason: 'workflow' };
    const t = workflowTrack(v, { status: 'running' });
    expect(t.steps.map(s => s.id)).toEqual(['ARCH', 'DESIGN', 'PM', 'DEV', 'TEST']);
    expect(t.steps[1].state).toBe('skipped');
    expect(t.current).toMatchObject({ id: 'PM', sub: 'AI đang làm' });
    expect(t.progress).toBe(40);
  });

  it('every step is done once all gates passed; RELEASING is the hand-over', () => {
    const t = workflowTrack(view(Array(6).fill('APPROVED'), { status: 'RELEASING' }), { stage: 'watching-pr', status: 'running' });
    expect(t.steps.every(s => s.state === 'done')).toBe(true);
    expect(t.progress).toBe(100);
    expect(t.releasing).toBe(true);
    expect(workflowTrack(view(Array(6).fill('APPROVED'), { status: 'RELEASING' }), { stage: 'done', status: 'passed' }).releasing).toBe(false);
  });

  it('null without a run view', () => {
    expect(workflowTrack(null)).toBe(null);
    expect(workflowTrack({ run: {}, steps: [] })).toBe(null);
  });
});

describe('stageLabel for role steps', () => {
  it('names the step like the review screen does', () => {
    expect(stageLabel('role-arch')).toBe('Plan — Kiến trúc');
    expect(stageLabel('review-design')).toBe('Chờ duyệt Thiết kế UI');
  });
});
