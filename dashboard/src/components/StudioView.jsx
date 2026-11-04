import { confirmDialog } from '../lib/dialog.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, MessageSquare, Loader2, Trash2, Check, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, ArrowLeft } from 'lucide-react';
import Button from './ui/Button.jsx';
import ErrorBoundary from './ui/ErrorBoundary.jsx';
import Chat from './studio/Chat.jsx';
import DocPanel from './studio/DocPanel.jsx';
import NewIdea from './studio/NewIdea.jsx';
import { studio, isLive, projectIdOf, isDraft } from '../lib/studio.js';
import '../styles/wizard.css';
import '../styles/studio.css';
import { tr } from '../lib/i18n.js';

// The creation chat opened from "Tạo dự án"; the list keeps drafts (chats whose project is not created yet).
// onBack: opened from the project list — the list lives there, so this screen shows only the chat and a way back.
export default function StudioView({ onOpenProject, onProjectCreated, onOpenChat, sessionId = null, onSession, onBack }) {
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [err, setErr] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const refreshList = useCallback(() => studio.list().then(l => setList(l.filter(isDraft)), e => setErr(e.message)), []);
  useEffect(() => { refreshList(); }, [refreshList]);

  const open = useCallback(id => studio.get(id).then(s => { setCurrent(s); onSession?.(s.id); }, e => { setErr(e.message); onSession?.(null); }), [onSession]);
  useEffect(() => { if (sessionId) open(sessionId); }, [sessionId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const deleteIdea = useCallback(async (id, title, e) => {
    if (e) e.stopPropagation();
    if (!await confirmDialog({ title: tr('Xoá ý tưởng'), message: tr('Xoá ý tưởng "{0}"? Toàn bộ tài liệu nháp và lịch sử trao đổi sẽ bị xoá.', [title || tr('này')]), confirmLabel: tr('Xoá'), danger: true })) return;
    try {
      setErr('');
      await studio.remove(id);
      if (current?.id === id) setCurrent(null);
      refreshList();
    } catch (e) {
      setErr(e.message || String(e));
    }
  }, [current, refreshList]);

  // Poll while an AI answers or the project is being generated.
  useEffect(() => {
    if (!isLive(current)) return undefined;
    const t = setTimeout(() => studio.get(current.id).then(s => { setCurrent(s); if (!isLive(s)) refreshList(); }, () => {}), 2500);
    return () => clearTimeout(t);
  }, [current, refreshList]);

  // The project is registered while it is generated: add it to the projects list right away and
  // make it the active project, instead of waiting for "Mở dự án". Opening an older idea does not.
  const pid = projectIdOf(current);
  const seen = useRef({ id: null, pid: null });
  useEffect(() => {
    const prev = seen.current;
    seen.current = { id: current?.id || null, pid };
    if (pid && prev.id === current?.id && !prev.pid) onProjectCreated?.(pid);
  }, [current?.id, pid, onProjectCreated]);

  // Wrap mutator actions with error boundary.
  const act = fn => async (...args) => {
    try {
      setErr('');
      const r = await fn(...args);
      if (r) setCurrent(r);
      refreshList();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className={`st${onBack ? ' st-solo' : sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      {/* Collapsible Left Idea List */}
      {!onBack && <aside className="st-list" aria-label={tr('Danh sách ý tưởng')}>
        <div className="st-list-head">
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={() => { setCurrent(null); onSession?.(null); }}>{tr('Ý tưởng mới')}</Button>
          <button
            type="button"
            className="st-sidebar-toggle-btn"
            onClick={() => setSidebarOpen(false)}
            title={tr('Thu gọn danh sách ý tưởng')}
            aria-label={tr('Thu gọn danh sách ý tưởng')}>
            <PanelLeftClose size={14} />
          </button>
        </div>

        {err && <div className="m-err st-err" role="alert">{err}</div>}

        <div className="st-list-scroll">
          {(!list || list.length === 0) ? (
            <div className="st-list-empty">{tr('Chưa có ý tưởng nào. Bấm "Ý tưởng mới" để bắt đầu.')}</div>
          ) : (
            <ul className="st-list-items">
              {list.map(x => (
                <li key={x.id} className="st-item-row">
                  <button
                    type="button"
                    className={`st-item${current?.id === x.id ? ' on' : ''}`}
                    onClick={() => open(x.id)}>
                    <MessageSquare size={13} className="st-item-icon" />
                    <span className="st-item-title">{x.title}</span>
                    {x.busy && <Loader2 size={12} className="wz-spin st-item-busy" />}
                  </button>
                  <button
                    type="button"
                    className="st-item-del-btn"
                    title={tr('Xoá ý tưởng "{0}"', [x.title])}
                    aria-label={tr('Xoá ý tưởng "{0}"', [x.title])}
                    onClick={e => deleteIdea(x.id, x.title, e)}>
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>}

      {/* Main Studio Work Area */}
      <section className="st-main">
        {onBack && (
          <button type="button" className="st-open-sidebar-pill" onClick={onBack}>
            <ArrowLeft size={13} aria-hidden="true" />
            <span>{tr('Dự án')}</span>
          </button>
        )}
        {!sidebarOpen && !onBack && (
          <button
            type="button"
            className="st-open-sidebar-pill"
            onClick={() => setSidebarOpen(true)}
            title={tr('Mở danh sách ý tưởng')}>
            <PanelLeft size={13} />
            <span>{tr('Ý tưởng ({0})', [list?.length || 0])}</span>
          </button>
        )}

        {current ? (
          <ErrorBoundary title={tr('Không thể hiển thị cuộc trò chuyện ý tưởng này')}>
            <Session
              s={current}
              act={act}
              onOpenProject={onOpenProject}
              onOpenChat={onOpenChat}
              onDeleted={() => { setCurrent(null); onSession?.(null); refreshList(); onBack?.(); }}
            />
          </ErrorBoundary>
        ) : (
          onBack && sessionId ? (
            <div className="modern-empty-state" style={{ minHeight: 280 }}>
              <div className="modern-empty-title">{sessionId ? tr('Đang mở…') : tr('Chưa chọn dự án đang tạo')}</div>
              <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>{tr('Về danh sách dự án')}</Button>
            </div>
          ) : <NewIdea onStart={act(async text => { const s = await studio.start(text); onSession?.(s.id); return s; })} />
        )}
      </section>
    </div>
  );
}

/** One chat (a creation chat or a project's feature thread): the steps, their documents and the chat with the role. */
export function Session({ s, act, onOpenProject, onOpenChat, onDeleted, readOnly = false }) {
  const [tab, setTab] = useState(s?.stage || 'pm');
  const [chatOpen, setChatOpen] = useState(true);

  useEffect(() => {
    if (s?.stage) setTab(s.stage);
  }, [s?.id, s?.stage]);

  const stages = Array.isArray(s?.stages) ? s.stages : [];
  const stageIdx = stages.findIndex(x => x.id === s?.stage);
  const chatStage = !readOnly && (['pm', 'system', 'ui'].includes(s?.stage) || (s?.stage === 'create' && !s?.project));
  const showChat = chatStage || (readOnly && s?.messages?.length > 0);
  const currentRole = tr(stages[stageIdx]?.role || 'AI Assistant');

  return (
    <div className="st-session">
      {/* Unified Apple-Style Session Header & Interactive Stepper */}
      <header className="st-head">
        <div className="st-head-left">
          <h1 className="st-title" title={s?.title}>{s?.title || tr('Cuộc trò chuyện ý tưởng')}</h1>
        </div>

        {/* Single unified interactive process stepper */}
        <nav className="st-stepper" aria-label={tr('Quy trình hiện thực ý tưởng')}>
          {stages.map((x, i) => {
            const isDone = i < stageIdx;
            const isCurrent = x.id === s?.stage;
            const isSelected = x.id === tab;
            const reachable = i <= stageIdx;

            return (
              <button
                key={x.id}
                type="button"
                disabled={!reachable}
                className={`st-step-tab${isSelected ? ' is-selected' : ''}${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}`}
                onClick={() => reachable && setTab(x.id)}
                title={reachable ? tr('Xem tài liệu bước: {0}', [tr(x.label)]) : tr('Bước chưa tới')}>
                <span className="st-step-badge">
                  {isDone ? <Check size={11} strokeWidth={2.5} aria-hidden="true" /> : i + 1}
                </span>
                <span className="st-step-label">{tr(x.label)}</span>
                {isCurrent && <span className="st-step-active-dot" title={tr('Đang thực hiện')} />}
              </button>
            );
          })}
        </nav>

        <div className="st-head-right">
          {showChat && (
            <button
              type="button"
              className={`st-chat-toggle-btn${chatOpen ? ' active' : ''}`}
              onClick={() => setChatOpen(!chatOpen)}
              title={chatOpen ? tr('Thu gọn khung chat để mở rộng toàn màn hình giao diện') : tr('Mở khung chat trao đổi với AI')}>
              {chatOpen ? <PanelRightClose size={13} /> : <PanelRight size={13} />}
              <span>{chatOpen ? tr('Thu gọn Chat') : tr('Mở Chat')}</span>
            </button>
          )}

          {!readOnly && onDeleted && <button
            type="button"
            className="st-delete-btn"
            title={tr('Xoá cuộc trò chuyện ý tưởng này')}
            onClick={act(async () => {
              const confirmMsg = s?.project
                ? tr('Xoá ý tưởng "{0}" khỏi Studio? (Dự án đã tạo vẫn được giữ nguyên trong hệ thống)', [s?.title])
                : tr('Xoá cuộc trò chuyện "{0}"? Mọi tài liệu nháp sẽ bị xoá.', [s?.title]);
              if (!await confirmDialog({ title: tr('Xoá cuộc trò chuyện'), message: confirmMsg, confirmLabel: tr('Xoá'), danger: true })) return null;
              await studio.remove(s.id);
              onDeleted();
              return null;
            })}>
            <Trash2 size={13} />
            <span>{tr('Xoá')}</span>
          </button>}
        </div>
      </header>

      {/* Golden Ratio Work Layout: 70% Canvas Workspace + 30% Assistant Inspector */}
      <div className={`st-body${chatOpen && showChat ? ' with-chat' : ' full-canvas'}`}>
        <main className="st-canvas-pane">
          <ErrorBoundary title={tr('Không thể hiển thị tài liệu bước này')}>
            <DocPanel
              s={s}
              tab={tab}
              act={act}
              onOpenProject={onOpenProject}
              onOpenChat={onOpenChat}
              readOnly={readOnly}
              chatOpen={chatOpen}
              onToggleChat={() => setChatOpen(true)}
            />
          </ErrorBoundary>
        </main>

        {chatOpen && showChat && (
          <aside className="st-aside-pane" aria-label={tr('Khung trò chuyện với AI')}>
            <ErrorBoundary title={tr('Không thể hiển thị khung chat')}>
              <Chat s={s} act={act} enabled={chatStage} role={currentRole} />
            </ErrorBoundary>
          </aside>
        )}
      </div>
    </div>
  );
}
