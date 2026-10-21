import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Lock, Workflow, Save, Undo2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { platform } from '../../lib/platform.js';
import { STEP_LABEL, GATE_MODES, MOVABLE, moveStep, workflowProblem } from '../../lib/review.js';

const STEP_DESCRIPTIONS = {
  PM: 'Xác định mục tiêu, phạm vi và tiêu chí nghiệm thu của tính năng.',
  BA: 'Phân tích quy trình nghiệp vụ và các ca sử dụng chi tiết.',
  ARCH: 'Thiết kế kiến trúc, mô hình dữ liệu, chia việc. Lập trình chỉ bắt đầu khi bước này được duyệt.',
  DESIGN: 'Thiết kế giao diện UI/UX (tự bỏ qua khi Kiến trúc kết luận tính năng không có giao diện).',
  DEV: 'Viết mã nguồn, chạy CI, e2e và review code. Bước bắt buộc.',
  TEST: 'Kế hoạch kiểm thử, chạy kiểm thử tự động và QC trên trình duyệt.',
};

const m = (step, mode) => ({ step, mode });
/** Ready-made workflows; the project can then fine-tune each step. */
const PRESETS = [
  { id: 'full', label: 'Đầy đủ', steps: [m('PM', 'REQUIRED'), m('BA', 'REQUIRED'), m('ARCH', 'REQUIRED'), m('DESIGN', 'REQUIRED'), m('DEV', 'REQUIRED'), m('TEST', 'REQUIRED')] },
  { id: 'arch', label: 'Kiến trúc → Code → Test', steps: [m('ARCH', 'REQUIRED'), m('PM', 'SKIP'), m('BA', 'SKIP'), m('DESIGN', 'SKIP'), m('DEV', 'REQUIRED'), m('TEST', 'REQUIRED')] },
  { id: 'ui', label: 'Thiết kế UI → Code → Test', steps: [m('DESIGN', 'REQUIRED'), m('PM', 'SKIP'), m('BA', 'SKIP'), m('ARCH', 'SKIP'), m('DEV', 'REQUIRED'), m('TEST', 'REQUIRED')] },
  { id: 'code', label: 'Chỉ Code + Test', steps: [m('PM', 'SKIP'), m('BA', 'SKIP'), m('ARCH', 'SKIP'), m('DESIGN', 'SKIP'), m('DEV', 'AUTO'), m('TEST', 'REQUIRED')] },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function ProjectGatesTab({ pid, canManage }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    platform.workflow(pid).then(w => { setSaved(w); setDraft(w); }, e => setErr(e.message));
  }, [pid]);

  const setMode = (step, mode) => { setNotice(''); setDraft(d => d.map(w => (w.step === step ? { ...w, mode } : w))); };
  const move = (step, dir) => { setNotice(''); setDraft(d => moveStep(d, step, dir)); };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const w = await platform.setWorkflow(pid, draft);
      setSaved(w); setDraft(w);
      setNotice('Đã lưu. Quy trình mới áp dụng cho các tính năng giao từ bây giờ; tính năng đang chạy giữ quy trình cũ.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!draft) {
    return err ? (
      <div className="alert-banner err" role="alert">
        <AlertCircle size={16} />
        <div className="alert-banner-content">{err}</div>
      </div>
    ) : (
      <p className="muted-empty">Đang tải quy trình…</p>
    );
  }

  const dirty = !same(draft, saved);
  const problem = workflowProblem(draft);
  const active = draft.filter(w => w.mode !== 'SKIP');

  return (
    <div className="pj-tab-stack">
      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      <div className="card-panel">
        <div className="card-header">
          <div className="card-header-title">
            <Workflow size={17} style={{ color: 'var(--accent-text)' }} />
            <span>Quy trình làm tính năng của dự án</span>
          </div>
        </div>

        <div className="wf-flow" aria-label="Quy trình đang chọn">
          {active.map((w, i) => (
            <React.Fragment key={w.step}>
              {i > 0 && <span className="wf-arrow" aria-hidden="true">→</span>}
              <span className={`wf-chip${w.mode === 'AUTO' ? ' auto' : ''}`}>{STEP_LABEL[w.step]}</span>
            </React.Fragment>
          ))}
        </div>

        {canManage && (
          <div className="wf-presets">
            <span className="wf-presets-label">Mẫu nhanh</span>
            {PRESETS.map(p => (
              <button key={p.id} type="button" className={`wf-preset${same(draft, p.steps) ? ' on' : ''}`}
                onClick={() => { setNotice(''); setDraft(p.steps); }}>{p.label}</button>
            ))}
          </div>
        )}

        <div className="gate-pipeline-list" style={{ border: 'none', borderRadius: 0 }}>
          {draft.map((w, idx) => {
            const movable = MOVABLE.includes(w.step);
            const canUp = movable && idx > 0;
            const canDown = movable && MOVABLE.includes(draft[idx + 1]?.step);
            return (
              <div key={w.step} className={`gate-pipeline-card${w.mode === 'SKIP' ? ' wf-skipped' : ''}`}>
                <div className="gate-card-left">
                  <div className="gate-step-index">{idx + 1}</div>
                  <div className="gate-card-texts">
                    <div className="gate-step-name">{STEP_LABEL[w.step]}</div>
                    <div className="gate-step-desc">{STEP_DESCRIPTIONS[w.step]}</div>
                  </div>
                </div>
                <div className="gate-card-right">
                  <div className="wf-mode" role="radiogroup" aria-label={`Chế độ bước ${STEP_LABEL[w.step]}`}>
                    {GATE_MODES.filter(g => !(w.step === 'DEV' && g.id === 'SKIP')).map(g => (
                      <label key={g.id} className={w.mode === g.id ? 'on' : ''}>
                        <input type="radio" name={`wf-${w.step}`} checked={w.mode === g.id} disabled={!canManage}
                          onChange={() => setMode(w.step, g.id)} />
                        {g.label}
                      </label>
                    ))}
                  </div>
                  {movable ? (
                    <span className="wf-move">
                      <button type="button" className="wf-move-btn" disabled={!canManage || !canUp}
                        aria-label={`Đưa ${STEP_LABEL[w.step]} lên trước`} onClick={() => move(w.step, -1)}>
                        <ChevronUp size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="wf-move-btn" disabled={!canManage || !canDown}
                        aria-label={`Đưa ${STEP_LABEL[w.step]} xuống sau`} onClick={() => move(w.step, 1)}>
                        <ChevronDown size={16} aria-hidden="true" />
                      </button>
                    </span>
                  ) : (
                    <span className="wf-move wf-locked" title="Lập trình và Kiểm thử luôn ở cuối quy trình">
                      <Lock size={14} aria-hidden="true" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {canManage && (
          <div className="wf-actions">
            {problem ? <span className="m-err" style={{ margin: 0 }}>{problem}</span>
              : notice ? <span className="wf-notice" role="status">{notice}</span>
              : dirty ? <span className="wf-notice">Có thay đổi chưa lưu.</span> : <span />}
            <span className="wf-actions-btns">
              <Button size="sm" icon={Undo2} disabled={!dirty || busy} onClick={() => { setDraft(saved); setNotice(''); }}>Hoàn tác</Button>
              <Button size="sm" variant="primary" icon={Save} disabled={!dirty || busy || !!problem} onClick={save}>
                {busy ? 'Đang lưu…' : 'Lưu quy trình'}
              </Button>
            </span>
          </div>
        )}

        <div className="pj-card-footnote">
          <b>Cần người duyệt</b>: AI làm xong thì dừng chờ người có vai trò đó duyệt. <b>Tự duyệt</b>: vẫn lưu lịch sử và bộ nhớ dự án nhưng không dừng chờ.
          {' '}<b>Bỏ bước</b>: bước không chạy, bước sau làm từ yêu cầu gốc và các tài liệu đã có.
          {' '}Lập trình chỉ bắt đầu khi mọi bước đứng trước đã được duyệt. Khi giao việc, từng lane / tính năng vẫn có thể chọn khác.
        </div>
      </div>
    </div>
  );
}
