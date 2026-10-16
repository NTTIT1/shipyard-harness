import React, { useCallback, useEffect, useState } from 'react';
import { Search, EyeOff, Eye, Brain, AlertCircle, Database } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import { platform } from '../lib/platform.js';

const KINDS = ['', 'ARTIFACT', 'FEEDBACK', 'HUMAN_EDIT', 'DECISION', 'FEATURE_SUMMARY'];
const KIND_LABEL = {
  '': 'Tất cả phân loại',
  ARTIFACT: 'Tài liệu đã duyệt',
  FEEDBACK: 'Góp ý',
  HUMAN_EDIT: 'Bản sửa tay',
  DECISION: 'Quyết định',
  FEATURE_SUMMARY: 'Tóm tắt tính năng'
};

const KIND_TONE = {
  ARTIFACT: 'ok',
  FEEDBACK: 'warn',
  HUMAN_EDIT: 'accent',
  DECISION: 'info',
  FEATURE_SUMMARY: 'neutral'
};

export default function MemoryPanel({ projectId, canManage }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await platform.memory(projectId, { q, kind }));
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [projectId, q, kind]);

  useEffect(() => { load(); }, [projectId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async it => {
    try {
      await platform.setMemoryDisabled(projectId, it.id, !it.disabled);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="rv-page" style={{ gap: 14 }}>
      {/* Search and Filter Card */}
      <div className="card-panel" style={{ background: 'var(--bg-subtle)' }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <form className="mem-bar" onSubmit={e => { e.preventDefault(); load(); }} style={{ alignItems: 'center' }}>
            <div className="search-input-wrap" style={{ flex: '1 1 240px' }}>
              <Search size={15} />
              <input
                aria-label="Tìm trong bộ nhớ"
                placeholder="Tìm từ khoá trong bộ nhớ dự án…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <select
              aria-label="Loại"
              value={kind}
              onChange={e => setKind(e.target.value)}
              className="role-select-box"
              style={{ padding: '7px 10px' }}>
              {KINDS.map(k => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
            <Button type="submit" variant="primary" icon={Search}>Tìm</Button>
          </form>
        </div>
      </div>

      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      {items.length === 0 && !err && (
        <div className="modern-empty-state">
          <div className="modern-empty-icon">
            <Brain size={22} />
          </div>
          <div className="modern-empty-title">Chưa có mục nào trong bộ nhớ dự án.</div>
          <div className="modern-empty-desc">
            Khi các tài liệu, phản hồi và quyết định được duyệt trong các phiên chạy, dữ liệu ngữ cảnh sẽ tự động được tích luỹ vào đây để cung cấp cho AI trong các lần chạy sau.
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(it => (
            <div
              key={it.id}
              className={`mem-item card-panel${it.disabled ? ' off' : ''}`}
              style={{ padding: '14px 16px', opacity: it.disabled ? 0.55 : 1 }}>
              <div className="rv-head" style={{ marginBottom: 6, alignItems: 'center' }}>
                <strong style={{ fontSize: 14, color: 'var(--text)' }}>{it.title}</strong>
                <span className="rv-btns" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Badge tone={KIND_TONE[it.kind] || 'info'}>
                    {KIND_LABEL[it.kind] || it.kind}
                  </Badge>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={it.disabled ? Eye : EyeOff}
                      onClick={() => toggle(it)}>
                      {it.disabled ? 'Bật lại' : 'Tắt (AI không dùng)'}
                    </Button>
                  )}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: '7.5em', overflow: 'hidden' }}>
                {it.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
