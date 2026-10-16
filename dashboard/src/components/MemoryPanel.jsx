import React, { useCallback, useEffect, useState } from 'react';
import { Search, EyeOff, Eye } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import { platform } from '../lib/platform.js';

const KINDS = ['', 'ARTIFACT', 'FEEDBACK', 'HUMAN_EDIT', 'DECISION', 'FEATURE_SUMMARY'];
const KIND_LABEL = { '': 'Tất cả', ARTIFACT: 'Tài liệu đã duyệt', FEEDBACK: 'Góp ý', HUMAN_EDIT: 'Bản sửa tay', DECISION: 'Quyết định', FEATURE_SUMMARY: 'Tóm tắt tính năng' };

export default function MemoryPanel({ projectId, canManage }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setItems(await platform.memory(projectId, { q, kind })); setErr(''); } catch (e) { setErr(e.message); }
  }, [projectId, q, kind]);
  useEffect(() => { load(); }, [projectId, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async it => {
    try { await platform.setMemoryDisabled(projectId, it.id, !it.disabled); load(); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="rv-page">
      <form className="mem-bar" onSubmit={e => { e.preventDefault(); load(); }}>
        <input aria-label="Tìm trong bộ nhớ" placeholder="Tìm trong bộ nhớ…" value={q} onChange={e => setQ(e.target.value)} />
        <select aria-label="Loại" value={kind} onChange={e => setKind(e.target.value)}>{KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <Button type="submit" icon={Search}>Tìm</Button>
      </form>
      {err && <p className="m-err">{err}</p>}
      {items.length === 0 && !err && <p className="muted-empty">Chưa có mục nào.</p>}
      {items.map(it => (
        <div key={it.id} className={`mem-item${it.disabled ? ' off' : ''}`}>
          <div className="rv-head">
            <strong>{it.title}</strong>
            <span className="rv-btns"><Badge tone="info">{KIND_LABEL[it.kind] || it.kind}</Badge>
              {canManage && <Button size="sm" variant="ghost" icon={it.disabled ? Eye : EyeOff} onClick={() => toggle(it)}>{it.disabled ? 'Bật lại' : 'Tắt (AI không dùng)'}</Button>}</span>
          </div>
          <p>{it.content}</p>
        </div>
      ))}
    </div>
  );
}
