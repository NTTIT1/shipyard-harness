import React, { useRef, useState } from 'react';
import { GripVertical, Lock } from 'lucide-react';
import { STEP_LABEL, GATE_MODES, MOVABLE, moveTo, WORKFLOW_PRESETS } from '../../lib/review.js';

const STEP_DESCRIPTIONS = {
  PM: 'Xác định mục tiêu, phạm vi và tiêu chí nghiệm thu của tính năng.',
  BA: 'Phân tích quy trình nghiệp vụ và các ca sử dụng chi tiết.',
  ARCH: 'Lên kế hoạch: thiết kế cách làm, dữ liệu, chia việc (plan.md, tasks.md). Code chỉ bắt đầu khi bước này qua.',
  DESIGN: 'Thiết kế giao diện UI/UX (tự bỏ qua khi Plan kết luận tính năng không có giao diện).',
  DEV: 'Viết mã nguồn, chạy CI, e2e và review code. Bước bắt buộc.',
  TEST: 'Kế hoạch kiểm thử, chạy kiểm thử tự động và QC trên trình duyệt.',
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The project's feature workflow: a quick preset, then per step Cần duyệt / Tự duyệt / Bỏ bước and
 * the order of the document steps — dragged by their handle (mouse, touch, pen) or moved with ↑/↓.
 */
export default function WorkflowEditor({ value, onChange, disabled = false, presets = true }) {
  const [drag, setDrag] = useState(null); // { step, startY, base, h, dy }
  const listRef = useRef(null);

  const active = value.filter(w => w.mode !== 'SKIP');
  const lastMovable = value.findIndex(w => !MOVABLE.includes(w.step)) - 1;

  const onPointerDown = (e, step, index) => {
    if (disabled || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const row = e.currentTarget.closest('.gate-pipeline-card');
    setDrag({ step, startY: e.clientY, base: index, h: row ? row.offsetHeight : 64, dy: 0 });
  };
  const onPointerMove = e => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const target = Math.max(0, Math.min(lastMovable, drag.base + Math.round(dy / drag.h)));
    const cur = value.findIndex(w => w.step === drag.step);
    if (target !== cur) onChange(moveTo(value, drag.step, target));
    setDrag(d => ({ ...d, dy }));
  };
  const onPointerUp = () => setDrag(null);
  const onKeyDown = (e, step, index) => {
    if (disabled) return;
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    onChange(moveTo(value, step, index + dir));
    // keep focus on the moved handle
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-grip="${step}"]`)?.focus());
  };

  return (
    <>
      <div className="wf-flow" aria-label="Quy trình đang chọn">
        {active.map((w, i) => (
          <React.Fragment key={w.step}>
            {i > 0 && <span className="wf-arrow" aria-hidden="true">→</span>}
            <span className={`wf-chip${w.mode === 'AUTO' ? ' auto' : ''}`}>{STEP_LABEL[w.step]}</span>
          </React.Fragment>
        ))}
      </div>

      {presets && !disabled && (
        <div className="wf-presets">
          <span className="wf-presets-label">Mẫu nhanh</span>
          {WORKFLOW_PRESETS.map(p => (
            <button key={p.id} type="button" title={p.desc} className={`wf-preset${same(value, p.steps) ? ' on' : ''}`}
              onClick={() => onChange(p.steps)}>{p.label}</button>
          ))}
        </div>
      )}

      <div ref={listRef} className={`gate-pipeline-list${drag ? ' wf-dragging' : ''}`} style={{ border: 'none', borderRadius: 0 }}>
        {value.map((w, idx) => {
          const movable = MOVABLE.includes(w.step);
          const dragging = drag?.step === w.step;
          const offset = dragging ? drag.dy - (idx - drag.base) * drag.h : 0;
          return (
            <div key={w.step}
              className={`gate-pipeline-card${w.mode === 'SKIP' ? ' wf-skipped' : ''}${dragging ? ' wf-lifted' : ''}`}
              style={dragging ? { transform: `translateY(${offset}px)` } : undefined}>
              <div className="gate-card-left">
                {movable ? (
                  <button type="button" className="wf-grip" data-grip={w.step} disabled={disabled}
                    aria-label={`Kéo để đổi thứ tự bước ${STEP_LABEL[w.step]} (hoặc phím ↑ ↓)`}
                    onPointerDown={e => onPointerDown(e, w.step, idx)} onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={e => onKeyDown(e, w.step, idx)}>
                    <GripVertical size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="wf-grip wf-locked" title="Code và Test luôn ở cuối quy trình">
                    <Lock size={14} aria-hidden="true" />
                  </span>
                )}
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
                      <input type="radio" name={`wf-${w.step}`} checked={w.mode === g.id} disabled={disabled}
                        onChange={() => onChange(value.map(x => (x.step === w.step ? { ...x, mode: g.id } : x)))} />
                      {g.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
