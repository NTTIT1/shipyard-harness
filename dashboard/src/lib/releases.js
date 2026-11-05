// Release rules shared by the server (services/releases.js) and the Phát hành screen.

export const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;

/** The next version after the last one: patch + 1 (1.4.2 → 1.4.3); 0.1.0 for the first release. */
export function nextVersion(releases) {
  const last = (releases || []).map(r => r.version).filter(v => VERSION_RE.test(v))
    .sort((a, b) => cmpVersion(b, a))[0];
  if (!last) return '0.1.0';
  const [x, y, z] = last.split('.').map(Number);
  return `${x}.${y}.${z + 1}`;
}
export function cmpVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Release notes from the features it carries (the person may edit them before creating it). */
export function draftNotes(version, features) {
  const lines = [`# Phiên bản ${version}`, '', '## Tính năng', ''];
  for (const f of features) lines.push(`- ${f.title || f.runId}${f.pr ? ` (${f.pr})` : ''}`);
  if (!features.length) lines.push('- (không có tính năng mới — bản sửa lỗi / cấu hình)');
  return lines.join('\n');
}

/**
 * Where a release stands in one environment, and whether it may be sent there now: an environment
 * needs the previous one confirmed (UAT signed off before production), and one deploy at a time.
 */
export function envGate(settings, release, envId) {
  const i = settings.envs.findIndex(e => e.id === envId);
  if (i < 0) return { ok: false, why: 'Không có môi trường này' };
  if (release.status === 'cancelled') return { ok: false, why: 'Bản phát hành đã huỷ' };
  const st = release.envs?.[envId]?.status;
  if (st === 'deployed' || st === 'verified') return { ok: false, why: 'Đã phát hành lên môi trường này' };
  if (i > 0) {
    const prev = settings.envs[i - 1];
    if (release.envs?.[prev.id]?.status !== 'verified') return { ok: false, why: `Cần xác nhận ${prev.label} trước` };
  }
  return { ok: true, index: i, last: i === settings.envs.length - 1 };
}

/** The production environment is the last one: promoting there needs the higher permission. */
export const isProd = (settings, envId) => settings.envs[settings.envs.length - 1]?.id === envId;

