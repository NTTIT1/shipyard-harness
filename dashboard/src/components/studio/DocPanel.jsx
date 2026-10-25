import React, { useState } from 'react';
import { Check, SkipForward, RotateCcw, ArrowRight, Monitor, FileText } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Markdown from '../Markdown.jsx';
import { AdviceCard, Mockups } from './MockupViewer.jsx';
import CreateProject from './CreateProject.jsx';
import Build from './Build.jsx';
import { APPROVE_LABEL, studio } from '../../lib/studio.js';
import { STEP_LABEL, ROLE_LABEL, defaultApproverRole } from '../../lib/review.js';
import { configSummary, modelLabel } from '../../lib/workflow.js';

export default function DocPanel({ s, tab, act, onOpenProject, chatOpen = true, onToggleChat }) {
  const docs = s?.docs || {};
  return (
    <div className="st-doc">
      {/* Document & Workspace Body */}
      <div className="st-doc-body">
        {tab === 'pm' && (
          <DocStage s={s} stage="pm" act={act} chatOpen={chatOpen} onToggleChat={onToggleChat} empty="AI PM sẽ viết bản mô tả yêu cầu sản phẩm sau khi trao đổi thông tin qua chat.">
            {docs.brief && <Markdown text={docs.brief} />}
          </DocStage>
        )}
        {tab === 'system' && (
          <DocStage s={s} stage="system" act={act} chatOpen={chatOpen} onToggleChat={onToggleChat} empty="AI kiến trúc sư đang chuẩn bị đề xuất công nghệ và kiến trúc hệ thống.">
            {docs.advice && <AdviceCard advice={docs.advice} />}
            {docs.adviceError && <p className="m-err">{docs.adviceError}</p>}
            {docs.workflow && <WorkflowSummary workflow={docs.workflow} error={docs.workflowError} />}
            {docs.architecture && <Markdown text={docs.architecture} />}
          </DocStage>
        )}
        {tab === 'ui' && (
          <DocStage s={s} stage="ui" act={act} chatOpen={chatOpen} onToggleChat={onToggleChat} empty={s?.skippedUi ? 'Đã bỏ qua thiết kế giao diện.' : 'AI thiết kế đang vẽ các màn hình mẫu.'}>
            <UiStageView docs={docs} />
          </DocStage>
        )}
        {/* CreateProject renders its scrolling form and its bottom bar (same layout as DocStage). */}
        {tab === 'create' && <CreateProject s={s} act={act} />}
        {tab === 'build' && (
          <div className="st-doc-content st-build-scroll">
            <Build s={s} act={act} onOpenProject={onOpenProject} />
          </div>
        )}
      </div>
    </div>
  );
}

function UiStageView({ docs }) {
  const hasMockups = Array.isArray(docs?.mockups) && docs.mockups.length > 0;
  const hasDesign = Boolean(docs?.design);
  // Follow what exists (mockups first) until the person picks a tab: mockups often land after the
  // page opened, and a choice frozen at mount would leave an empty view.
  const [picked, setViewMode] = useState(null);
  const viewMode = picked || (hasMockups ? 'mockups' : 'spec');

  return (
    <div className="st-ui-stage">
      {hasMockups && hasDesign && (
        <div className="st-ui-mode-bar">
          <div className="st-ui-segmented" role="tablist" aria-label="Chế độ xem giao diện">
            <button
              type="button"
              className={`st-ui-seg-btn${viewMode === 'mockups' ? ' active' : ''}`}
              onClick={() => setViewMode('mockups')}>
              <Monitor size={13} aria-hidden="true" />
              <span>Màn hình mẫu ({docs.mockups.length})</span>
            </button>
            <button
              type="button"
              className={`st-ui-seg-btn${viewMode === 'spec' ? ' active' : ''}`}
              onClick={() => setViewMode('spec')}>
              <FileText size={13} aria-hidden="true" />
              <span>Đặc tả thiết kế (design.md)</span>
            </button>
          </div>
        </div>
      )}

      {viewMode === 'mockups' && hasMockups ? (
        <Mockups mockups={docs.mockups} />
      ) : hasDesign ? (
        <div className="st-ui-spec-wrap">
          <Markdown text={docs.design} />
        </div>
      ) : null}
    </div>
  );
}

function DocStage({ s, stage, act, empty, children, chatOpen = true, onToggleChat }) {
  const docs = s?.docs || {};
  const has = stage === 'pm'
    ? !!docs.brief
    : stage === 'system'
      ? !!(docs.advice && docs.architecture)
      : !!(docs.design || (Array.isArray(docs.mockups) && docs.mockups.length > 0));
  const content = React.Children.toArray(children).filter(Boolean);
  const isCurrent = s?.stage === stage;

  return (
    <>
      <div className="st-doc-content">
        {content.length ? content : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px', padding: '12px 0' }}>
            <p className="muted-empty" style={{ margin: 0 }}>{empty}</p>
            {!chatOpen && onToggleChat && (
              <Button size="sm" variant="secondary" onClick={onToggleChat}>
                Mở khung Chat với AI
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Unified Apple-Style Sticky Approval Footer */}
      <div className="st-approve-bar">
        {isCurrent && (
          <div className="st-approve-actions">
            <Button
              variant="primary"
              icon={Check}
              disabled={!has || s?.busy}
              onClick={act(() => studio.approve(s.id, stage))}>
              {APPROVE_LABEL[stage] || 'Duyệt bước này'}
            </Button>
            {stage === 'ui' && (
              <Button
                variant="secondary"
                icon={SkipForward}
                disabled={s?.busy}
                onClick={act(() => studio.skipUi(s.id))}>
                Bỏ qua giao diện
              </Button>
            )}
            <span className="st-approve-hint">
              {has ? 'Muốn chỉnh sửa gì, bạn có thể nhắn trong khung chat bên phải.' : 'Đang chờ AI chuẩn bị bản nháp…'}
            </span>
          </div>
        )}

        {!isCurrent && s?.approved?.[stage] && !s?.project && (
          <div className="st-approve-approved">
            <span className="st-ok"><Check size={14} aria-hidden="true" /> Đã duyệt bản {stage.toUpperCase()}</span>
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              disabled={s?.busy}
              onClick={act(() => {
                if (!window.confirm('Mở lại bước này? Các bước sau sẽ cần được duyệt lại.')) return null;
                return studio.reopen(s.id, stage);
              })}>
              Sửa lại bước này
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/** The project's feature workflow as the architect proposed it (changed in the chat or at "Tạo dự án"). */
function WorkflowSummary({ workflow = [], error }) {
  const list = Array.isArray(workflow) ? workflow : [];
  const running = list.filter(w => w?.mode !== 'SKIP');
  return (
    <section className="st-wf-sum" aria-label="Quy trình làm tính năng đề xuất">
      <h3>Quy trình làm tính năng</h3>
      <ol>
        {running.map(w => {
          const sum = configSummary(w?.config);
          const role = w?.approverRole || defaultApproverRole(w?.step);
          return (
            <li key={w?.step}>
              <b>{STEP_LABEL[w?.step] || w?.step}</b>
              <span>{modelLabel(w?.config)} · {w?.mode === 'AUTO' ? 'tự qua khi xanh' : `${ROLE_LABEL[role] || role} duyệt`}{sum ? ` · ${sum}` : ''}</span>
            </li>
          );
        })}
      </ol>
      {error && <p className="m-err">{error}</p>}
      <p className="faint">Nhắn AI để đổi (model, giới hạn phút, ai duyệt, bỏ bước…); bước Tạo dự án cho sửa từng ô.</p>
    </section>
  );
}
