/** test-results.json (bin/test-report.py) → what the TEST review shows above the documents; null when absent. */
export function testSummary(raw) {
  let d;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!d || typeof d !== 'object' || !d.summary) return null;
  const s = d.summary;
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const bugs = (Array.isArray(d.bugs) ? d.bugs : []).map(b => ({
    id: String(b.id || ''), title: String(b.title || ''), severity: String(b.severity || 'minor'), tc: String(b.tc || ''),
    tracker: b.tracker && typeof b.tracker === 'object'
      ? { key: String(b.tracker.key || b.tracker.kind || ''), url: /^https?:\/\//.test(b.tracker.url || '') ? b.tracker.url : '' } : null,
  }));
  return {
    pass: d.result === 'pass',
    reasons: Array.isArray(d.reasons) ? d.reasons.map(String) : [],
    total: num(s.total), passed: num(s.pass), failed: num(s.fail), blocked: num(s.blocked), notRun: num(s.not_run),
    rate: num(s.pass_rate), bugs,
    bySeverity: SEVERITIES.map(k => [k, bugs.filter(b => b.severity === k).length]).filter(([, n]) => n),
  };
}

export const SEVERITIES = ['blocker', 'major', 'minor', 'cosmetic'];
export const SEVERITY_LABEL = { blocker: 'Blocker', major: 'Major', minor: 'Minor', cosmetic: 'Cosmetic' };
export const SEVERITY_TONE = { blocker: 'danger', major: 'warn', minor: 'neutral', cosmetic: 'neutral' };

/** Documents shown as tabs: the machine-readable results are summarised instead. */
export const visibleDocs = names => names.filter(n => n !== 'test-results.json');
