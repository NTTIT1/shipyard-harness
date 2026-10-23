import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Loader2, Bot, User, ChevronDown, ChevronUp, Check, History } from 'lucide-react';
import Markdown from '../Markdown.jsx';
import { studio, speaker } from '../../lib/studio.js';

export default function Chat({ s, act, enabled, role }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [scope, setScope] = useState('current'); // 'current' | 'all'
  const [openPastStages, setOpenPastStages] = useState({});
  const msgsRef = useRef(null);

  // Auto-scroll inside messages feed on new message or AI typing
  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTo({
        top: msgsRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [s?.messages?.length || 0, s?.busy, scope]);

  const send = async () => {
    if (!text.trim() || s?.busy) return;
    setSending(true);
    await act(() => studio.send(s.id, text.trim()))();
    setText('');
    setSending(false);
  };

  const togglePastStage = stageId => {
    if (!stageId) return;
    setOpenPastStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  // Partition messages by stage
  const currentStageId = s?.stage;
  const messages = s?.messages || [];
  const stages = s?.stages || [];

  const pastMessagesCount = useMemo(() => {
    return messages.filter(m => m?.stage !== currentStageId).length;
  }, [messages, currentStageId]);

  // Group messages into stage chunks for structured rendering
  const stageGroups = useMemo(() => {
    const groups = [];
    let curGroup = null;

    messages.forEach(m => {
      if (!m) return;
      if (!curGroup || curGroup.stage !== m.stage) {
        curGroup = {
          stage: m.stage,
          stageInfo: stages.find(x => x.id === m.stage) || { label: m.stage || 'AI', role: 'AI' },
          messages: [],
        };
        groups.push(curGroup);
      }
      curGroup.messages.push(m);
    });

    return groups;
  }, [messages, stages]);

  const filteredGroups = useMemo(() => {
    if (scope === 'current') {
      return stageGroups.filter(g => g.stage === currentStageId);
    }
    return stageGroups;
  }, [stageGroups, scope, currentStageId]);

  return (
    <div className="st-chat">
      {/* Header bar of the Chat pane */}
      <div className="st-chat-header">
        <div className="st-chat-role-indicator">
          <div className="st-chat-role-avatar">
            <Bot size={15} />
          </div>
          <div className="st-chat-role-meta">
            <strong className="st-chat-role-title">{role || 'AI Assistant'}</strong>
            <span className="st-chat-role-sub">
              {s.busy ? 'Đang soạn thảo…' : enabled ? 'Sẵn sàng trao đổi' : 'Đang chờ bước sau'}
            </span>
          </div>
        </div>

        <div className="st-chat-header-actions">
          {pastMessagesCount > 0 && (
            <div className="st-chat-scope" role="group" aria-label="Lọc tin nhắn">
              <button
                type="button"
                className={`st-scope-btn${scope === 'current' ? ' on' : ''}`}
                onClick={() => setScope('current')}
                title="Chỉ hiển thị hội thoại của bước hiện tại">
                Bước này
              </button>
              <button
                type="button"
                className={`st-scope-btn${scope === 'all' ? ' on' : ''}`}
                onClick={() => setScope('all')}
                title="Xem tất cả tin nhắn từ đầu">
                Tất cả ({s.messages.length})
              </button>
            </div>
          )}

          {s.busy && (
            <div className="st-chat-busy-pill">
              <Loader2 size={12} className="wz-spin" aria-hidden="true" />
              <span>AI đang làm việc…</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages Feed (Scrolls internally) */}
      <div className="st-msgs" ref={msgsRef} role="log" aria-live="polite">
        {scope === 'current' && pastMessagesCount > 0 && (
          <div className="st-past-banner">
            <History size={13} className="st-past-icon" />
            <span>Đã ẩn {pastMessagesCount} tin nhắn ở các bước trước để tập trung.</span>
            <button
              type="button"
              className="st-past-link"
              onClick={() => setScope('all')}>
              Xem tất cả
            </button>
          </div>
        )}

        {filteredGroups.length === 0 && (
          <div className="st-msgs-empty">
            <p>Chưa có tin nhắn nào trong bước này. Nhắn cho {role} để bắt đầu.</p>
          </div>
        )}

        {filteredGroups.map(group => {
          const isPast = group.stage !== currentStageId;
          const isCollapsed = isPast && !openPastStages[group.stage];

          return (
            <div key={group.stage} className={`st-stage-group${isPast ? ' is-past' : ''}`}>
              {/* Divider / Group Header */}
              {isPast ? (
                <button
                  type="button"
                  className={`st-past-toggle-btn${openPastStages[group.stage] ? ' is-open' : ''}`}
                  onClick={() => togglePastStage(group.stage)}
                  aria-expanded={!isCollapsed}>
                  <div className="st-past-toggle-left">
                    <span className="st-past-check">
                      <Check size={11} strokeWidth={2.5} />
                    </span>
                    <span className="st-past-stage-name">{group.stageInfo.label}</span>
                    <span className="st-past-count">({group.messages.length} tin nhắn)</span>
                  </div>
                  <div className="st-past-toggle-right">
                    <span>{isCollapsed ? 'Mở xem lại' : 'Thu gọn'}</span>
                    {isCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                  </div>
                </button>
              ) : (
                <div className="st-divider">
                  <span>{group.stageInfo.label}</span>
                </div>
              )}

              {/* Group Messages */}
              {!isCollapsed && (
                <div className="st-stage-msgs">
                  {group.messages.map((m, idx) => {
                    const isLatest = idx === group.messages.length - 1 && group.stage === currentStageId;
                    return (
                      <MessageBubble
                        key={m.id}
                        m={m}
                        stages={s.stages}
                        isLatest={isLatest}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {s.busy && (
          <div className="st-msg ai st-typing" role="status">
            <div className="st-msg-header">
              <span className="st-msg-avatar"><Bot size={12} /></span>
              <span className="st-msg-who">{role}</span>
            </div>
            <div className="st-msg-bubble typing-bubble">
              <span className="st-typing-dot" />
              <span className="st-typing-dot" />
              <span className="st-typing-dot" />
              <span className="st-typing-label">đang suy nghĩ & vẽ mẫu…</span>
            </div>
          </div>
        )}
      </div>

      {/* Modern Apple-style Composer */}
      <div className="st-composer">
        <div className="st-composer-inner">
          <textarea
            className="st-composer-input"
            rows={1}
            value={text}
            maxLength={8000}
            disabled={!enabled}
            aria-label="Nhắn cho AI"
            placeholder={enabled ? `Nhắn cho ${role}… (Ctrl+Enter để gửi)` : 'Bước này không trò chuyện'}
            onChange={e => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            type="button"
            className="st-composer-send-btn"
            disabled={!enabled || s.busy || sending || !text.trim()}
            onClick={send}
            aria-label="Gửi tin nhắn">
            {sending ? <Loader2 size={15} className="wz-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ m, stages, isLatest }) {
  const isUser = m?.role === 'user';
  const isShipyard = m?.role === 'shipyard';
  const isAi = m?.role === 'ai';
  const msgText = String(m?.text || '');

  // Automatically fold super long past AI responses to prevent overwhelming wall of text
  const isLong = isAi && (msgText.length > 450 || (msgText.match(/\n/g) || []).length > 8);
  const [expanded, setExpanded] = useState(isLatest);

  return (
    <div className={`st-msg ${m?.role || 'ai'}`}>
      {!isShipyard && (
        <div className="st-msg-header">
          <span className="st-msg-avatar">
            {isUser ? <User size={12} /> : <Bot size={12} />}
          </span>
          <span className="st-msg-who">{speaker(m, stages)}</span>
        </div>
      )}
      <div className={`st-msg-bubble${isLong && !expanded ? ' is-collapsed' : ''}`}>
        {isAi ? <Markdown text={msgText} /> : msgText}
        {isLong && (
          <div className="st-msg-expand-wrap">
            <button
              type="button"
              className="st-msg-expand-btn"
              onClick={() => setExpanded(!expanded)}>
              {expanded ? (
                <><span>Thu gọn</span><ChevronUp size={12} /></>
              ) : (
                <><span>Xem toàn bộ tin nhắn ({msgText.length} ký tự)</span><ChevronDown size={12} /></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
