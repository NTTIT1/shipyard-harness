import React, { useCallback, useEffect, useState } from 'react';
import { Plus, MessageSquare, Loader2, Trash2, Check, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight } from 'lucide-react';
import Button from './ui/Button.jsx';
import ErrorBoundary from './ui/ErrorBoundary.jsx';
import Chat from './studio/Chat.jsx';
import DocPanel from './studio/DocPanel.jsx';
import NewIdea from './studio/NewIdea.jsx';
import { studio, isLive } from '../lib/studio.js';
import '../styles/wizard.css';
import '../styles/studio.css';

export default function StudioView({ onOpenProject }) {
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [err, setErr] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const refreshList = useCallback(() => studio.list().then(setList, e => setErr(e.message)), []);
  useEffect(() => { refreshList(); }, [refreshList]);

  const open = useCallback(id => studio.get(id).then(setCurrent, e => setErr(e.message)), []);

  const deleteIdea = useCallback(async (id, title, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Xoá ý tưởng "${title || 'này'}"? Toàn bộ tài liệu nháp và lịch sử trao đổi sẽ bị xoá.`)) return;
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
    <div className={`st${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      {/* Collapsible Left Idea List */}
      <aside className="st-list" aria-label="Danh sách ý tưởng">
        <div className="st-list-head">
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={() => setCurrent(null)}>
            Ý tưởng mới
          </Button>
          <button
            type="button"
            className="st-sidebar-toggle-btn"
            onClick={() => setSidebarOpen(false)}
            title="Thu gọn danh sách ý tưởng"
            aria-label="Thu gọn danh sách ý tưởng">
            <PanelLeftClose size={14} />
          </button>
        </div>

        {err && <div className="m-err st-err" role="alert">{err}</div>}

        <div className="st-list-scroll">
          {(!list || list.length === 0) ? (
            <div className="st-list-empty">Chưa có ý tưởng nào. Bấm "Ý tưởng mới" để bắt đầu.</div>
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
                    title={`Xoá ý tưởng "${x.title}"`}
                    aria-label={`Xoá ý tưởng "${x.title}"`}
                    onClick={e => deleteIdea(x.id, x.title, e)}>
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Main Studio Work Area */}
      <section className="st-main">
        {!sidebarOpen && (
          <button
            type="button"
            className="st-open-sidebar-pill"
            onClick={() => setSidebarOpen(true)}
            title="Mở danh sách ý tưởng">
            <PanelLeft size={13} />
            <span>Ý tưởng ({list?.length || 0})</span>
          </button>
        )}

        {current ? (
          <ErrorBoundary title="Không thể hiển thị cuộc trò chuyện ý tưởng này">
            <Session
              s={current}
              act={act}
              onOpenProject={onOpenProject}
              onDeleted={() => { setCurrent(null); refreshList(); }}
            />
          </ErrorBoundary>
        ) : (
          <NewIdea onStart={act(text => studio.start(text))} />
        )}
      </section>
    </div>
  );
}

function Session({ s, act, onOpenProject, onDeleted }) {
  const [tab, setTab] = useState(s?.stage || 'pm');
  const [chatOpen, setChatOpen] = useState(true);

  useEffect(() => {
    if (s?.stage) setTab(s.stage);
  }, [s?.id, s?.stage]);

  const stages = Array.isArray(s?.stages) ? s.stages : [];
  const stageIdx = stages.findIndex(x => x.id === s?.stage);
  const chatStage = ['pm', 'system', 'ui'].includes(s?.stage) || (s?.stage === 'create' && !s?.project);
  const currentRole = stages[stageIdx]?.role || 'AI Assistant';

  return (
    <div className="st-session">
      {/* Unified Apple-Style Session Header & Interactive Stepper */}
      <header className="st-head">
        <div className="st-head-left">
          <h1 className="st-title" title={s?.title}>{s?.title || 'Cuộc trò chuyện ý tưởng'}</h1>
        </div>

        {/* Single unified interactive process stepper */}
        <nav className="st-stepper" aria-label="Quy trình hiện thực ý tưởng">
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
                title={reachable ? `Xem tài liệu bước: ${x.label}` : 'Bước chưa tới'}>
                <span className="st-step-badge">
                  {isDone ? <Check size={11} strokeWidth={2.5} aria-hidden="true" /> : i + 1}
                </span>
                <span className="st-step-label">{x.label}</span>
                {isCurrent && <span className="st-step-active-dot" title="Đang thực hiện" />}
              </button>
            );
          })}
        </nav>

        <div className="st-head-right">
          {chatStage && (
            <button
              type="button"
              className={`st-chat-toggle-btn${chatOpen ? ' active' : ''}`}
              onClick={() => setChatOpen(!chatOpen)}
              title={chatOpen ? 'Thu gọn khung chat để mở rộng toàn màn hình giao diện' : 'Mở khung chat trao đổi với AI'}>
              {chatOpen ? <PanelRightClose size={13} /> : <PanelRight size={13} />}
              <span>{chatOpen ? 'Thu gọn Chat' : 'Mở Chat'}</span>
            </button>
          )}

          <button
            type="button"
            className="st-delete-btn"
            title="Xoá cuộc trò chuyện ý tưởng này"
            onClick={act(async () => {
              const confirmMsg = s?.project
                ? `Xoá ý tưởng "${s?.title}" khỏi Studio? (Dự án đã tạo vẫn được giữ nguyên trong hệ thống)`
                : `Xoá cuộc trò chuyện "${s?.title}"? Mọi tài liệu nháp sẽ bị xoá.`;
              if (!window.confirm(confirmMsg)) return null;
              await studio.remove(s.id);
              onDeleted();
              return null;
            })}>
            <Trash2 size={13} />
            <span>Xoá</span>
          </button>
        </div>
      </header>

      {/* Golden Ratio Work Layout: 70% Canvas Workspace + 30% Assistant Inspector */}
      <div className={`st-body${chatOpen && chatStage ? ' with-chat' : ' full-canvas'}`}>
        <main className="st-canvas-pane">
          <ErrorBoundary title="Không thể hiển thị tài liệu bước này">
            <DocPanel
              s={s}
              tab={tab}
              act={act}
              onOpenProject={onOpenProject}
              chatOpen={chatOpen}
              onToggleChat={() => setChatOpen(true)}
            />
          </ErrorBoundary>
        </main>

        {chatOpen && chatStage && (
          <aside className="st-aside-pane" aria-label="Khung trò chuyện với AI">
            <ErrorBoundary title="Không thể hiển thị khung chat">
              <Chat s={s} act={act} enabled={chatStage} role={currentRole} />
            </ErrorBoundary>
          </aside>
        )}
      </div>
    </div>
  );
}
