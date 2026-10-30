import { describe, it, expect } from 'vitest';
import { simpleStepIndex } from '../src/lib/constants.js';

// 0 Kế hoạch · 1 Lập trình · 2 Kiểm tra tự động · 3 Review & QC · 4 Pull Request · 5 Hoàn tất
describe('simpleStepIndex', () => {
  it('follows the map: every harness stage lands on its own customer stage', () => {
    const at = st => simpleStepIndex(st, 'running');
    expect(['intake', 'plan', 'spec-review', 'role-ba', 'review-arch'].map(at)).toEqual([0, 0, 0, 0, 0]);
    expect(['implementing', 'role-dev', 'fix', 'fixing'].map(at)).toEqual([1, 1, 1, 1]);
    expect(['pre-push-gate', 'e2e-feature', 'booting', 'live', 'integrated-testing', 'e2e-passed'].map(at)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(['review', 'qc-plan', 'qc', 'gate', 'role-test'].map(at)).toEqual([3, 3, 3, 3, 3]);
    expect(['publishing', 'pr-open', 'watching-pr', 'merged', 'qc-dev'].map(at)).toEqual([4, 4, 4, 4, 4]);
  });
  it('done/passed is the last stage; unknown or empty is not started', () => {
    expect(simpleStepIndex('done', 'running')).toBe(5);
    expect(simpleStepIndex('merged', 'passed')).toBe(5);
    expect(simpleStepIndex('no-state', 'idle')).toBe(-1);
    expect(simpleStepIndex('', 'idle')).toBe(-1);
  });
});
