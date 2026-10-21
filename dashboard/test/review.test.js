import { describe, it, expect } from 'vitest';
import { validateDecision, sendBackTargets, pendingRevision, previousRevision, lineDiff, STEP_LABEL, runSteps, runProgress, moveStep, workflowProblem } from '../src/lib/review.js';

const steps = [
  { step: 'PM', status: 'APPROVED' }, { step: 'BA', status: 'APPROVED' }, { step: 'ARCH', status: 'APPROVED' },
  { step: 'DESIGN', status: 'SKIPPED' }, { step: 'DEV', status: 'APPROVED' }, { step: 'TEST', status: 'AWAITING_REVIEW' },
];

describe('validateDecision', () => {
  it('requires feedback for changes and send-back', () => {
    expect(validateDecision({ action: 'REQUEST_CHANGES', feedback: '  ', currentStep: 'TEST', steps })).toMatch(/góp ý/);
    expect(validateDecision({ action: 'SEND_BACK', feedback: 'x', sendBackTo: '', currentStep: 'TEST', steps })).toMatch(/bước/);
    expect(validateDecision({ action: 'APPROVE', currentStep: 'TEST', steps })).toBe('');
  });
  it('refuses edits with send-back/cancel and send-back to skipped or later steps', () => {
    expect(validateDecision({ action: 'SEND_BACK', feedback: 'x', sendBackTo: 'BA', edits: { 'a.md': 'x' }, currentStep: 'TEST', steps })).toMatch(/sửa/);
    expect(validateDecision({ action: 'SEND_BACK', feedback: 'x', sendBackTo: 'DESIGN', currentStep: 'TEST', steps })).toMatch(/bước/);
    expect(validateDecision({ action: 'CANCEL', edits: { 'a.md': 'x' }, currentStep: 'TEST', steps })).toMatch(/sửa/);
  });
});

describe('sendBackTargets', () => {
  it('lists earlier non-skipped steps', () => {
    expect(sendBackTargets('TEST', steps)).toEqual(['PM', 'BA', 'ARCH', 'DEV']);
    expect(sendBackTargets('PM', steps)).toEqual([]);
  });
});

describe('revisions', () => {
  const view = { revisions: [
    { id: 'r1', step: 'PM', revisionNo: 1, approvalStatus: 'CHANGES_REQUESTED' },
    { id: 'r2', step: 'PM', revisionNo: 2, approvalStatus: 'APPROVED' },
    { id: 'r3', step: 'BA', revisionNo: 1, approvalStatus: 'PENDING', approvalId: 'a3' },
  ] };
  it('finds the pending revision and the previous revision of a step', () => {
    expect(pendingRevision(view).id).toBe('r3');
    expect(previousRevision(view, view.revisions[1]).id).toBe('r1');
    expect(previousRevision(view, view.revisions[0])).toBeNull();
  });
});

describe('lineDiff', () => {
  it('marks added and removed lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual([
      { t: 'same', s: 'a' }, { t: 'del', s: 'b' }, { t: 'add', s: 'B' }, { t: 'same', s: 'c' }]);
    expect(lineDiff('', 'x')).toEqual([{ t: 'add', s: 'x' }]);
  });
  it('falls back to whole-text replace for huge inputs', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `l${i}`).join('\n');
    const d = lineDiff(big, big + '\nz');
    expect(d.filter(x => x.t === 'add').length).toBeGreaterThan(0);
  });
});

describe('labels', () => {
  it('has Vietnamese labels for every step', () => {
    for (const s of ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST']) expect(STEP_LABEL[s]).toBeTruthy();
  });
});

import { inboxItemFor, hasUiToSend, isMember, safeImageSrc } from '../src/lib/review.js';

describe('review screen helpers', () => {
  it('finds the inbox item for the revision being reviewed, however the screen was opened', () => {
    const items = [{ approvalId: 'a1' }, { approvalId: 'a2' }];
    expect(inboxItemFor(items, { approvalId: 'a2' })).toBe(items[1]);
    expect(inboxItemFor(items, { approvalId: null })).toBeUndefined();
  });
  it('sends hasUi only when the reviewer changed the AI\'s answer', () => {
    expect(hasUiToSend(true, true)).toBeUndefined();
    expect(hasUiToSend(true, false)).toBe(false);
    expect(hasUiToSend(null, true)).toBe(true);
  });
  it('detects existing members', () => {
    expect(isMember([{ userId: 'u1' }], 'u1')).toBe(true);
    expect(isMember([{ userId: 'u1' }], 'u2')).toBe(false);
  });
  it('only serves lane images', () => {
    expect(safeImageSrc('/spec/2/specs/x/design/a.png')).toBe('/spec/2/specs/x/design/a.png');
    expect(safeImageSrc('/proof/2/x/qc/1.png')).toBe('/proof/2/x/qc/1.png');
    expect(safeImageSrc('https://evil.example/a.png')).toBe('');
    expect(safeImageSrc('javascript:alert(1)')).toBe('');
  });
});

describe('configurable workflow', () => {
  const custom = [
    { step: 'ARCH', status: 'APPROVED' }, { step: 'PM', status: 'SKIPPED', skipReason: 'workflow' },
    { step: 'BA', status: 'APPROVED' }, { step: 'DESIGN', status: 'SKIPPED', skipReason: 'has_ui=false' },
    { step: 'DEV', status: 'AWAITING_REVIEW' }, { step: 'TEST', status: 'SKIPPED', skipReason: 'workflow' },
  ];
  it('shows the run in its own order and hides left-out steps (not has_ui skips)', () => {
    expect(runSteps(custom)).toEqual(['ARCH', 'BA', 'DESIGN', 'DEV']);
    expect(runSteps([{ step: 'MANAGER', status: 'AI_WORKING' }])).toEqual(['MANAGER']);
  });
  it('sends back along the run order', () => {
    expect(sendBackTargets('DEV', custom)).toEqual(['ARCH', 'BA']);
  });
  it('measures progress on the frozen workflow', () => {
    expect(runProgress({ status: 'RUNNING', currentStep: 'ARCH', workflow: ['ARCH', 'DEV'] })).toBe(50);
    expect(runProgress({ status: 'RUNNING', currentStep: 'PM' })).toBe(17);
    expect(runProgress({ status: 'DONE' })).toBe(100);
  });
  const wf = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'].map(step => ({ step, mode: 'REQUIRED' }));
  it('moves only document steps, and only among themselves', () => {
    expect(moveStep(wf, 'ARCH', -1).map(w => w.step)).toEqual(['PM', 'ARCH', 'BA', 'DESIGN', 'DEV', 'TEST']);
    expect(moveStep(wf, 'DESIGN', 1)).toBe(wf);
    expect(moveStep(wf, 'DEV', -1)).toBe(wf);
    expect(moveStep(wf, 'PM', -1)).toBe(wf);
  });
  it('validates like the orchestrator', () => {
    expect(workflowProblem(wf)).toBe('');
    expect(workflowProblem(wf.map(w => (w.step === 'DEV' ? { ...w, mode: 'SKIP' } : w)))).toMatch(/Lập trình/);
    expect(workflowProblem([...wf.slice(0, 3), wf[4], wf[3], wf[5]])).toMatch(/trước Lập trình/);
    expect(workflowProblem(wf.slice(1))).toMatch(/6 bước/);
  });
});
