// Small pure helpers for "Tài liệu sản phẩm" (the project's approved documents).

/** The ## headings of a markdown document (code blocks skipped): the chips that jump to each section. */
export function docOutline(md) {
  const out = [];
  let fence = false;
  for (const line of String(md || '').split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    const m = !fence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m) out.push(m[1].replace(/\*\*/g, '').trim());
  }
  return out;
}

/** A screen's name: its <title>, else its file name without the order prefix and extension. */
export function screenTitle(m) {
  const t = String(m?.html || '').match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  return t || String(m?.name || '').replace(/^\d+-/, '').replace(/\.html?$/i, '').replace(/[-_]+/g, ' ');
}

/** The first paragraph of a document, in plain text — the one-line summary under a section's name. */
export function docSummary(md) {
  // A block may open with its heading line ("## Tóm tắt\nHệ thống…"): drop heading lines first.
  const para = String(md || '').split(/\n\s*\n/).map(p => p.split('\n').filter(l => !/^\s*#/.test(l)).join(' ').trim())
    .find(p => p && !/^```/.test(p) && !/^[-*|>]/.test(p));
  return (para || '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').slice(0, 200);
}
