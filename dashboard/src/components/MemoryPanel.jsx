import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, EyeOff, Eye, Brain, AlertCircle, ChevronRight } from 'lucide-react';
import Badge from './ui/Badge.jsx';
import IconButton from './ui/IconButton.jsx';
import { platform } from '../lib/platform.js';
import { memoryFeature, memoryLabel, memoryPreview } from '../lib/memory.js';
import { fmtWhen } from '../lib/format.js';

const KINDS = ['ARTIFACT', 'DECISION', 'FEEDBACK', 'HUMAN_EDIT', 'FEATURE_SUMMARY'];
const KIND_LABEL = {
  ARTIFACT: 'Tài liệu đã duyệt',
  DECISION: 'Quyết định',
  FEEDBACK: 'Góp ý',
  HUMAN_EDIT: 'Bản sửa tay',
  FEATURE_SUMMARY: 'Tóm tắt tính năng',
};
const KIND_TONE = { ARTIFACT: 'ok', FEEDBACK: 'warn', HUMAN_EDIT: 'accent', DECISION: 'info', FEATURE_SUMMARY: 'neutral' };

/**
 * What the AI team remembers about the project: approved documents, decisions, reviewer feedback and
 * human edits, grouped by feature. One line per item; open one to read it or switch it off for the AI.
 */
export default function MemoryPanel({ projectId, canManage }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await platform.memory(projectId, { q, kind: '' }));
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [projectId, q]);

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleOpen = id => setOpen(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleDisabled = async it => {
    try { await platform.setMemoryDisabled(projectId, it.id, !it.disabled); load(); } catch (e) { setErr(e.message); }
  };

  const counts = useMemo(() => {
    const c = {};
    for (const it of items || []) c[it.kind] = (c[it.kind] || 0) + 1;
    return c;
  }, [items]);

  // Newest feature first; inside a feature, the order the work happened.
  const groups = useMemo(() => {
    const byRun = new Map();
    for (const it of (items || []).filter(i => !kind || i.kind === kind)) {
      const key = it.runId || '—';
      if (!byRun.has(key)) byRun.set(key, { key, name: '', latest: '', items: [] });
      const g = byRun.get(key);
      g.items.push(it);
      g.name ||= memoryFeature(it);
      if (String(it.createdAt) > g.latest) g.latest = String(it.createdAt);
    }
    const out = [...byRun.values()];
    for (const g of out) g.items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return out.sort((a, b) => b.latest.localeCompare(a.latest));
  }, [items, kind]);

  const total = items?.length || 0;

  return (
    <div className="mem">
      <form className="mem-toolbar" role="search" onSubmit={e => { e.preventDefault(); load(); }}>
        <div className="search-input-wrap mem-search">
          <Search size={15} aria-hidden="true" />
          <input aria-label="Tìm trong bộ nhớ" placeholder="Tìm trong bộ nhớ dự án (Enter)…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="mem-kinds" role="group" aria-label="Lọc theo loại">
          <button type="button" className={`mem-kind${!kind ? ' on' : ''}`} aria-pressed={!kind} onClick={() => setKind('')}>
            Tất cả <span className="mem-kind-n">{total}</span>
          </button>
          {KINDS.filter(k => counts[k]).map(k => (
            <button key={k} type="button" className={`mem-kind${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}>
              {KIND_LABEL[k]} <span className="mem-kind-n">{counts[k]}</span>
            </button>
          ))}
        </div>
      </form>

      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      {items === null && !err && <p className="muted-empty">Đang tải bộ nhớ…</p>}

      {items && total === 0 && !err && (
        <div className="modern-empty-state">
          <div className="modern-empty-icon"><Brain size={22} aria-hidden="true" /></div>
          <div className="modern-empty-title">{q ? `Không có mục nào khớp “${q}”` : 'Bộ nhớ dự án còn trống'}</div>
          <div className="modern-empty-desc">
            {q ? 'Thử từ khoá khác, hoặc xoá ô tìm kiếm rồi bấm Enter.'
              : 'Mỗi khi một bước được duyệt, tài liệu, quyết định, góp ý và bản sửa tay của người duyệt được lưu ở đây. AI đọc lại chúng khi làm các tính năng sau.'}
          </div>
        </div>
      )}

      {groups.map(g => (
        <section key={g.key} className="mem-group" aria-label={g.name || 'Khác'}>
          <h3 className="mem-group-title">
            <span>{g.name || 'Khác'}</span>
            <span className="mem-group-n">{g.items.length}</span>
          </h3>
          <ul className="mem-rows">
            {g.items.map(it => {
              const isOpen = open.has(it.id);
              return (
                <li key={it.id} className={`mem-row${it.disabled ? ' off' : ''}${isOpen ? ' open' : ''}`}>
                  <div className="mem-row-head">
                    <button type="button" className="mem-row-main" aria-expanded={isOpen} aria-controls={`mem-${it.id}`} onClick={() => toggleOpen(it.id)}>
                      <ChevronRight size={14} className="mem-chev" aria-hidden="true" />
                      <Badge tone={KIND_TONE[it.kind] || 'info'}>{KIND_LABEL[it.kind] || it.kind}</Badge>
                      <span className="mem-row-label">{memoryLabel(it)}</span>
                      {!isOpen && <span className="mem-row-preview">{memoryPreview(it.content)}</span>}
                      <span className="mem-row-when">{it.disabled ? 'AI không dùng' : fmtWhen(it.createdAt)}</span>
                    </button>
                    {canManage && (
                      <IconButton icon={it.disabled ? Eye : EyeOff}
                        label={it.disabled ? 'Bật lại cho AI dùng' : 'Tắt: AI không dùng mục này'} onClick={() => toggleDisabled(it)} />
                    )}
                  </div>
                  {isOpen && <pre className="mem-text" id={`mem-${it.id}`}>{it.content}</pre>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
