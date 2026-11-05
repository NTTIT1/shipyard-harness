import { describe, it, expect } from 'vitest';
import { testSummary, visibleDocs } from '../src/lib/testing.js';

describe('test report summary', () => {
  const raw = JSON.stringify({
    result: 'fail', reasons: ['1 ca không đạt'], summary: { total: 4, pass: 3, fail: 1, blocked: 0, not_run: 0, pass_rate: 75 },
    bugs: [{ id: 'BUG-1', title: 'Lưu sai ngày', severity: 'major', tc: 'TC-2', tracker: { kind: 'jira', key: 'HRM-7', url: 'https://x.atlassian.net/browse/HRM-7' } },
      { id: 'BUG-2', title: 'Lệch nút', severity: 'cosmetic', tracker: { kind: 'github', key: '#3', url: 'javascript:alert(1)' } }],
  });
  it('reads counts, reasons and bugs with safe links', () => {
    const s = testSummary(raw);
    expect(s).toMatchObject({ pass: false, total: 4, passed: 3, failed: 1, rate: 75, reasons: ['1 ca không đạt'] });
    expect(s.bugs[0].tracker).toEqual({ key: 'HRM-7', url: 'https://x.atlassian.net/browse/HRM-7' });
    expect(s.bugs[1].tracker.url).toBe('');
    expect(s.bySeverity).toEqual([['major', 1], ['cosmetic', 1]]);
  });
  it('is null for anything that is not a report', () => {
    expect(testSummary('{oops')).toBeNull();
    expect(testSummary('{}')).toBeNull();
    expect(testSummary(undefined)).toBeNull();
  });
  it('hides the raw results from the document tabs', () => {
    expect(visibleDocs(['test-report.md', 'test-results.json', 'qc-plan.md'])).toEqual(['test-report.md', 'qc-plan.md']);
  });
});
