import React from 'react';
import { Check, SkipForward, RotateCcw, ArrowRight } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Markdown from '../Markdown.jsx';
import { AdviceCard, Mockups } from './MockupViewer.jsx';
import CreateProject from './CreateProject.jsx';
import Build from './Build.jsx';
import { APPROVE_LABEL, studio } from '../../lib/studio.js';
import { STEP_LABEL, ROLE_LABEL, defaultApproverRole } from '../../lib/review.js';
import { configSummary, modelLabel } from '../../lib/workflow.js';

export default function DocPanel({ s, tab, act, onOpenProject }) {
  return (
    <div className="st-doc">
      {/* Document & Workspace Body */}
      <div className="st-doc-body">
        {tab === 'pm' && (
          <DocStage s={s} stage="pm" act={act} empty="AI PM sẽ viết bản mô tả yêu cầu sản phẩm sau khi trao đổi thông tin qua chat.">
            {s.docs.brief && <Markdown text={s.docs.brief} />}
          </DocStage>
        )}
        {tab === 'system' && (
          <DocStage s={s} stage="system" act={act} empty="AI kiến trúc sư đang chuẩn bị đề xuất công nghệ và kiến trúc hệ thống.">
            {s.docs.advice && <AdviceCard advice={s.docs.advice} />}
            {s.docs.adviceError && <p className="m-err">{s.docs.adviceError}</p>}
            {s.docs.workflow && <WorkflowSummary workflow={s.docs.workflow} error={s.docs.workflowError} />}
            {s.docs.architecture && <Markdown text={s.docs.architecture} />}
          </DocStage>
        )}
        {tab === 'ui' && (
          <DocStage s={s} stage="ui" act={act} empty={s.skippedUi ? 'Đã bỏ qua thiết kế giao diện.' : 'AI thiết kế đang vẽ các màn hình mẫu.'}>
            {s.docs.mockups?.length > 0 && <Mockups mockups={s.docs.mockups} />}
            {s.docs.design && <Markdown text={s.docs.design} />}
          </DocStage>
        )}
        {tab === 'create' && (
          <div className="st-doc-content st-create-scroll">
            <CreateProject s={s} act={act} />
          </div>
        )}
        {tab === 'build' && (
          <div className="st-doc-content st-build-scroll">
            <Build s={s} act={act} onOpenProject={onOpenProject} />
          </div>
        )}
      </div>
    </div>
  );
}

function DocStage({ s, stage, act, empty, children }) {
  const has = stage === 'pm' ? !!s.docs.brief : stage === 'system' ? !!(s.docs.advice && s.docs.architecture) : !!s.docs.design;
  const content = React.Children.toArray(children).filter(Boolean);
  const isCurrent = s.stage === stage;

  return (
    <>
      <div className="st-doc-content">
        {content.length ? content : <p className="muted-empty">{empty}</p>}
      </div>

      {/* Unified Apple-Style Sticky Approval Footer */}
      <div className="st-approve-bar">
        {isCurrent && (
          <div className="st-approve-actions">
            <Button
              variant="primary"
              icon={Check}
              disabled={!has || s.busy}
              onClick={act(() => studio.approve(s.id, stage))}>
              {APPROVE_LABEL[stage]}
            </Button>
            {stage === 'ui' && (
              <Button
                variant="secondary"
                icon={SkipForward}
                disabled={s.busy}
                onClick={act(() => studio.skipUi(s.id))}>
                Bỏ qua giao diện
              </Button>
            )}
            <span className="st-approve-hint">
              {has ? 'Muốn chỉnh sửa gì, bạn có thể nhắn trong khung chat bên phải.' : 'Đang chờ AI chuẩn bị bản nháp…'}
            </span>
          </div>
        )}

        {!isCurrent && s.approved?.[stage] && !s.project && (
          <div className="st-approve-approved">
            <span className="st-ok"><Check size={14} aria-hidden="true" /> Đã duyệt bản {stage.toUpperCase()}</span>
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              disabled={s.busy}
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
function WorkflowSummary({ workflow, error }) {
  const running = workflow.filter(w => w.mode !== 'SKIP');
  return (
    <section className="st-wf-sum" aria-label="Quy trình làm tính năng đề xuất">
      <h3>Quy trình làm tính năng</h3>
      <ol>
        {running.map(w => {
          const sum = configSummary(w.config);
          const role = w.approverRole || defaultApproverRole(w.step);
          return (
            <li key={w.step}>
              <b>{STEP_LABEL[w.step]}</b>
              <span>{modelLabel(w.config)} · {w.mode === 'AUTO' ? 'tự qua khi xanh' : `${ROLE_LABEL[role] || role} duyệt`}{sum ? ` · ${sum}` : ''}</span>
            </li>
          );
        })}
      </ol>
      {error && <p className="m-err">{error}</p>}
      <p className="faint">Nhắn AI để đổi (model, giới hạn phút, ai duyệt, bỏ bước…); bước Tạo dự án cho sửa từng ô.</p>
    </section>
  );
}
