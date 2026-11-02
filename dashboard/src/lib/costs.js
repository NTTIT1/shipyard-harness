import { tr } from './i18n.js';
// Formatting + labels for the Costs screen.
export const PHASE_LABEL = { PM: 'PM', BA: 'BA', ARCH: tr('Kiến trúc'), DESIGN: tr('Thiết kế UI'), DEV: tr('Lập trình'), TEST: tr('Kiểm thử'), ORCH: tr('Điều phối') };
export const PHASE_ORDER = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST', 'ORCH'];
export const ROLE_LABEL = { PM: 'PM', BA: 'BA', TECH_LEAD: tr('Kiến trúc sư'), DESIGNER: 'Designer', DEVELOPER: tr('Lập trình viên'), TESTER: 'Tester' };
export const EFFORT_LABEL = { low: tr('Thấp'), medium: tr('Trung bình'), high: 'Cao', xhigh: tr('Rất cao'), max: tr('Tối đa') };

export const fmtVnd = v => tr('{0} đ', [Math.round(v || 0).toLocaleString('de-DE')]);
export function fmtTokens(n) {
  n = n || 0;
  const f = (v, s) => `${(+v.toPrecision(3)).toString().replace('.', ',')}${s}`;
  if (n >= 1e6) return f(n / 1e6, 'M');
  if (n >= 1e3) return f(n / 1e3, 'K');
  return String(n);
}
export const fmtUsd = v => (v > 0 && v < 0.01 ? '<$0.01' : `$${(v || 0).toFixed(2)}`);
export const sumTokens = t => (t ? (t.in || 0) + (t.out || 0) + (t.cacheRead || 0) + (t.cacheWrite || 0) : 0);
/** AI cost ÷ estimated human cost: < .5 fine, < 1 watch it, ≥ 1 AI is dearer than people. */
export const ratioTone = r => (r == null ? 'neutral' : r < 0.5 ? 'ok' : r < 1 ? 'warn' : 'danger');

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
export const FEATURE_SORTS = [
  { id: 'cost', label: tr('Chi phí cao nhất') },
  { id: 'ratio', label: tr('AI so với người cao nhất') },
  { id: 'title', label: tr('Tên A–Z') },
];
/** The features list after search (accent-insensitive, title or run id), lane filter and sort. */
export function featureView(features, { q = '', lane = 'all', sort = 'cost' } = {}) {
  const needle = fold(q).trim();
  const rows = (features || []).filter(f => (lane === 'all' || String(f.lane) === String(lane))
    && (!needle || fold(f.title || f.key).includes(needle) || fold(f.runId).includes(needle)));
  const by = {
    cost: (a, b) => (b.vnd || 0) - (a.vnd || 0),
    ratio: (a, b) => (b.ratio ?? -1) - (a.ratio ?? -1),
    title: (a, b) => (a.title || a.key).localeCompare(b.title || b.key, 'vi'),
  }[sort] || (() => 0);
  return [...rows].sort(by);
}
/** Lanes that have features this month, with how many each, for the filter. */
export const featureLanes = features => Object.entries((features || []).reduce((m, f) => ({ ...m, [f.lane]: (m[f.lane] || 0) + 1 }), {}))
  .map(([lane, count]) => ({ lane: Number(lane), count })).sort((a, b) => a.lane - b.lane);
