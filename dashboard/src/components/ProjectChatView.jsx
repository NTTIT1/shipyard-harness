import React, { useCallback, useEffect, useState } from 'react';
import { Plus, MessagesSquare, Loader2, ArrowUp, ArrowDown, X, Send, Rocket } from 'lucide-react';
import Button from './ui/Button.jsx';
import ErrorBoundary from './ui/ErrorBoundary.jsx';
import { Session } from './StudioView.jsx';
import { projectChat, threadStatus, moveItem, isLive } from '../lib/studio.js';
import '../styles/wizard.css';
import '../styles/studio.css';
import { tr } from '../lib/i18n.js';

/**
 * The project's chat: the thread that created the project, then one thread per feature added later
 * (AI PM → architect → designer, approved here), and the queue of approved features waiting for a free
 * lane of this project. Members read it; only admins send, approve and change the queue.
 */
export default function ProjectChatView({ pid, project }) {
  const [chat, setChat] = useState(null);
  const [sel, setSel] = useState(null);       // a thread id, 'root', 'new' or null
  const [current, setCurrent] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => (pid ? projectChat.get(pid).then(setChat, e => setErr(e.message)) : Promise.resolve()), [pid]);
  useEffect(() => { load(); }, [load]);
  // The list follows the queue and lanes on its own.
  useEffect(() => {
    if (!pid) return undefined;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [pid, load]);
  const open = useCallback(id => {
    setSel(id);
    if (id === 'new') { setCurrent(null); return; }
    const sid = id === 'root' ? chat?.root?.id : id;
    if (sid) projectChat.thread(pid, sid).then(setCurrent, e => setErr(e.message));
  }, [pid, chat?.root?.id]);
  // Poll the open thread while its AI answers.
  useEffect(() => {
    if (!isLive(current)) return undefined;
    const t = setTimeout(() => projectChat.thread(pid, current.id).then(s => { setCurrent(s); if (!isLive(s)) load(); }, () => {}), 2500);
    return () => clearTimeout(t);
  }, [current, pid, load]);

  if (!pid) {
    return (
      <div className="modern-empty-state" style={{ minHeight: 280 }}>
        <div className="modern-empty-icon"><MessagesSquare size={24} /></div>
        <div className="modern-empty-title">{tr('Chọn một dự án ở thanh trên')}</div>
        <div className="modern-empty-desc">{tr('Mỗi dự án có một ô chat chung với các AI: thêm tính năng ở đây, duyệt từng bước rồi lane rảnh của dự án sẽ làm.')}</div>
      </div>
    );
  }
  const canSend = !!chat?.canSend;
  const act = fn => async (...args) => {
    try {
      setErr('');
      const r = await fn(...args);
      if (r) setCurrent(r);
      load();
    } catch (e) { setErr(e.message || String(e)); }
  };
  const addFeature = async () => {
    setBusy(true); setErr('');
    try {
      const s = await projectChat.addFeature(pid, text.trim());
      setText('');
      await load();
      setSel(s.id);
      setCurrent(s);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const saveQueue = async op => {
    try { await projectChat.saveQueue(pid, op); load(); } catch (e) { setErr(e.message); load(); }
  };
  const items = chat?.queue?.items || [];

  return (
    <div className="st pc">
      <aside className="st-list" aria-label={tr('Các luồng trong chat dự án')}>
        <div className="st-list-head">
          <span className="pc-title">{project?.name || tr('Chat dự án')}</span>
          {canSend && sel && sel !== 'new' && <Button size="sm" variant="primary" icon={Plus} onClick={() => open('new')}>{tr('Yêu cầu mới')}</Button>}
        </div>
        {err && <div className="m-err st-err" role="alert">{err}</div>}
        <div className="st-list-scroll">
          <ul className="st-list-items">
            {chat?.root && (
              <li className="st-item-row">
                <button type="button" className={`st-item${sel === 'root' ? ' on' : ''}`} onClick={() => open('root')}>
                  <Rocket size={13} className="st-item-icon" />
                  <span className="st-item-title">{tr('Tạo dự án')}</span>
                </button>
              </li>
            )}
            {(chat?.threads || []).map(t => (
              <li key={t.id} className="st-item-row">
                <button type="button" className={`st-item${sel === t.id ? ' on' : ''}`} onClick={() => open(t.id)}>
                  <MessagesSquare size={13} className="st-item-icon" />
                  <span className="st-item-title">{t.title}</span>
                  {t.busy ? <Loader2 size={12} className="wz-spin st-item-busy" /> : <span className={`pc-chip pc-${t.status}`}>{threadStatus(t)}</span>}
                </button>
              </li>
            ))}
          </ul>
          {chat && !chat.root && !(chat.threads || []).length && (
            <div className="st-list-empty">{tr('Chưa có trao đổi nào. Thêm tính năng đầu tiên: AI sẽ đọc tài liệu và code sẵn có của dự án trước khi tư vấn.')}</div>
          )}

          <div className="pc-queue">
            <div className="st-presets-label">{tr('Hàng chờ ({0})', [items.length])}</div>
            {chat?.queue?.error && <p className="wz-hint warn" role="alert">{chat.queue.error}</p>}
            {items.length ? (
              <ol className="pc-queue-list">
                {items.map((x, i) => (
                  <li key={x.slug}>
                    <span className="pc-queue-title">{x.title}</span>
                    {canSend && (
                      <span className="pc-queue-actions">
                        <button type="button" className="btn btn-sm btn-ghost" aria-label={tr('Lên')} disabled={i === 0} onClick={() => saveQueue({ order: moveItem(items, i, -1).map(y => y.slug) })}><ArrowUp size={12} /></button>
                        <button type="button" className="btn btn-sm btn-ghost" aria-label={tr('Xuống')} disabled={i === items.length - 1} onClick={() => saveQueue({ order: moveItem(items, i, 1).map(y => y.slug) })}><ArrowDown size={12} /></button>
                        <button type="button" className="btn btn-sm btn-ghost" aria-label={tr('Bỏ "{0}" khỏi hàng đợi', [x.title])}
                          onClick={() => { if (window.confirm(tr('Bỏ "{0}" khỏi hàng chờ? Tài liệu dự án sẽ ghi tính năng này là đã bỏ.', [x.title]))) saveQueue({ remove: x.slug }); }}><X size={12} /></button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : <p className="faint">{tr('Không có tính năng nào đang chờ lane.')}</p>}
            {(chat?.queue?.assigned || []).map(a => <p key={a.slug} className="faint">{tr('Lane {0} đang làm', [a.lane])}: {a.title}</p>)}
          </div>
        </div>
      </aside>

      <section className="st-main">
        {!canSend && chat && <p className="wz-hint pc-readonly">{tr('Chỉ admin được trao đổi và duyệt trong chat dự án')}</p>}
        {/* No thread picked: the chat box is right there — type what the project needs next. */}
        {(sel === 'new' || !sel) && canSend ? (
          <div className="st-new">
            <div className="st-new-hero">
              <h1 className="st-new-title">{tr('Chat với đội AI của dự án')}</h1>
              <p className="st-new-sub">{tr('AI PM đọc toàn bộ tài liệu dự án (và code) rồi tư vấn yêu cầu; tiếp theo AI kiến trúc sư thiết kế phần thay đổi, AI thiết kế vẽ giao diện nếu cần. Duyệt hết thì tính năng vào hàng chờ cho lane rảnh.')}</p>
            </div>
            <div className="st-new-card">
              <textarea className="st-new-input" rows={4} maxLength={8000} value={text} aria-label={tr('Tính năng cần thêm')} autoFocus
                placeholder={tr('Ví dụ: Cần xuất danh sách đơn hàng ra Excel, lọc theo ngày và cửa hàng.')}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim().length >= 5) { e.preventDefault(); addFeature(); } }} />
              <div className="st-new-bottom">
                <span className="st-new-hint">{tr('Mẹo: Nhấn')}{' '}<b>Ctrl + Enter</b>{' '}{tr('để gửi cho AI PM')}</span>
                <Button variant="primary" icon={Send} disabled={busy || text.trim().length < 5} onClick={addFeature}>{busy ? tr('Đang gửi…') : tr('Gửi cho AI PM')}</Button>
              </div>
            </div>
          </div>
        ) : current ? (
          <ErrorBoundary title={tr('Không thể hiển thị luồng này')}>
            <Session key={current.id} s={current} act={act} readOnly={!canSend} onDeleted={canSend && current.kind === 'feature' && current.stage !== 'queued'
              ? () => { setCurrent(null); setSel(null); load(); } : null} />
          </ErrorBoundary>
        ) : (
          <div className="modern-empty-state" style={{ minHeight: 280 }}>
            <div className="modern-empty-icon"><MessagesSquare size={24} /></div>
            <div className="modern-empty-title">{tr('Chọn một luồng bên trái')}</div>
            <div className="modern-empty-desc">{canSend ? tr('Hoặc bấm "Thêm tính năng" để bắt đầu một yêu cầu mới.') : tr('Xem lại các trao đổi đã có của dự án.')}</div>
          </div>
        )}
      </section>
    </div>
  );
}
