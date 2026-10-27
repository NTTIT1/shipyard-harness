// What a Claude Code process is doing, in one short Vietnamese line per step, read from its
// `--output-format stream-json` output — so the chat can show the AI at work while the person waits.
import path from 'path';

const MAX_TEXT = 140;
const short = (t, n = MAX_TEXT) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const file = p => path.basename(String(p || '')) || 'tệp';

function tool(name, input = {}) {
  switch (name) {
    case 'Read': return `Đọc ${file(input.file_path)}`;
    case 'Write': return `Viết ${file(input.file_path)}`;
    case 'Edit': case 'MultiEdit': return `Sửa ${file(input.file_path)}`;
    case 'Glob': return `Tìm tệp ${short(input.pattern, 60)}`;
    case 'Grep': return `Tìm “${short(input.pattern, 60)}”`;
    case 'LS': return `Xem thư mục ${file(input.path)}`;
    case 'TodoWrite': return 'Lập danh sách việc cần làm';
    default: return `Dùng công cụ ${name}`;
  }
}

/** One output line → the steps it shows ([] for anything that is not a step). */
export function describeEvent(line) {
  const l = String(line || '').trim();
  if (!l.startsWith('{')) return [];
  let e;
  try { e = JSON.parse(l); } catch { return []; }
  if (e.type === 'system' && e.subtype === 'init') return [`Đã kết nối — model ${e.model || '?'}`];
  if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) return [];
  return e.message.content.flatMap(c => {
    if (c.type === 'tool_use') return [tool(c.name, c.input)];
    if (c.type === 'thinking') return ['Đang suy nghĩ…'];
    if (c.type === 'text' && c.text?.trim()) return [`Viết trả lời: ${short(c.text.split('\nROLE-STEP')[0])}`];
    return [];
  });
}
