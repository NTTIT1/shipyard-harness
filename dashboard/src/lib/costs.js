// Formatting + labels for the Costs screen.
export const PHASE_LABEL = { PM: 'PM', BA: 'BA', ARCH: 'Kiến trúc', DESIGN: 'Thiết kế UI', DEV: 'Lập trình', TEST: 'Kiểm thử', ORCH: 'Điều phối' };
export const PHASE_ORDER = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST', 'ORCH'];
export const ROLE_LABEL = { PM: 'PM', BA: 'BA', TECH_LEAD: 'Kiến trúc sư', DESIGNER: 'Designer', DEVELOPER: 'Lập trình viên', TESTER: 'Tester' };
export const EFFORT_LABEL = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', xhigh: 'Rất cao', max: 'Tối đa' };

export const fmtVnd = v => `${Math.round(v || 0).toLocaleString('de-DE')} đ`;
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
