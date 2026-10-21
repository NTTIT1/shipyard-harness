import { describe, it, expect } from 'vitest';
import { finalRevisions, finalDocuments, mdDownloadName } from '../src/lib/docs.js';

const view = {
  steps: [{ step: 'PM', status: 'APPROVED' }, { step: 'BA', status: 'AWAITING_REVIEW' }, { step: 'ARCH', status: 'PENDING' },
    { step: 'DESIGN', status: 'SKIPPED' }, { step: 'DEV', status: 'PENDING' }, { step: 'TEST', status: 'PENDING' }],
  revisions: [
    { id: 'r1', step: 'PM', revisionNo: 1, approvalStatus: 'CHANGES_REQUESTED' },
    { id: 'r2', step: 'PM', revisionNo: 2, approvalStatus: 'APPROVED', decidedBy: 'u1' },
    { id: 'r3', step: 'BA', revisionNo: 1, approvalStatus: 'PENDING' },
  ],
};

describe('finalRevisions', () => {
  it('picks the approved revision per step, else the latest, and keeps the step status', () => {
    const f = finalRevisions(view);
    expect(f.find(x => x.step === 'PM')).toMatchObject({ revision: { id: 'r2' }, approved: true, count: 2, status: 'APPROVED' });
    expect(f.find(x => x.step === 'BA')).toMatchObject({ revision: { id: 'r3' }, approved: false, count: 1 });
    expect(f.find(x => x.step === 'DESIGN')).toMatchObject({ revision: null, status: 'SKIPPED' });
    expect(f.map(x => x.step)).toEqual(['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST']);
  });
  it('follows the run\'s workflow order and leaves out steps the workflow skipped', () => {
    const f = finalRevisions({ steps: [{ step: 'ARCH', status: 'APPROVED' }, { step: 'PM', status: 'SKIPPED', skipReason: 'workflow' },
      { step: 'DEV', status: 'PENDING' }], revisions: [] });
    expect(f.map(x => x.step)).toEqual(['ARCH', 'DEV']);
  });
});

describe('finalDocuments', () => {
  it('prefers the approved set (with human edits) and flags edited files', () => {
    const d = finalDocuments({ documents: { 'spec.md': 'ai' }, approvedDocuments: { 'spec.md': 'human' }, editedDocuments: { 'spec.md': 'human' } });
    expect(d).toEqual([{ name: 'spec.md', text: 'human', edited: true }]);
    expect(finalDocuments({ documents: { 'a.md': 'x' } })).toEqual([{ name: 'a.md', text: 'x', edited: false }]);
  });
  it('names downloads safely', () => {
    expect(mdDownloadName('Chat HR AI / v2', 'PM', 'spec.md')).toBe('Chat-HR-AI-v2_PM_spec.md');
  });
});
