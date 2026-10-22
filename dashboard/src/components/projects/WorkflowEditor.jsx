import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, Lock, LayoutGrid, Table2, ListOrdered, Wand2 } from 'lucide-react';
import { STEP_LABEL, GATE_MODES, MOVABLE, moveTo, WORKFLOW_PRESETS, ROLE_LABEL, defaultApproverRole } from '../../lib/review.js';
import { PHASE_WORK, configSummary, modelLabel, suggestedConfigs } from '../../lib/workflow.js';
import { platform } from '../../lib/platform.js';
import { fetchProviders } from '../../lib/api.js';
import WorkflowCanvas from './WorkflowCanvas.jsx';
import WorkflowStepInspector from './WorkflowStepInspector.jsx';

const sameShape = (a, b) => a.length === b.length && a.every((x, i) => x.step === b[i].step && x.mode === b[i].mode);
const VIEWS = [
  { id: 'canvas', label: 'Sơ đồ', icon: LayoutGrid },
  { id: 'table', label: 'Bảng chi tiết', icon: Table2 },
  { id: 'phases', label: '6 giai đoạn', icon: ListOrdered },
];
const pruneEmpty = (c = {}) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));

/**
 * A project's feature workflow: which steps run and in what order, who approves each, and per step
 * the AI model and guardrails (minute limit, VND budget, retries, condition, on-failure, required
 * inputs). Used when creating a project (wizard, studio) and on the project's "Quy trình & duyệt" page;
 * `value` is the draft — the caller saves it.
 */
export default function WorkflowEditor({ value, onChange, disabled = false, presets = true, pid = null }) {
  const [view, setView] = useState('canvas');
  const [selected, setSelected] = useState(() => value.find(w => w.mode !== 'SKIP')?.step || value[0]?.step);
  const [info, setInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [users, setUsers] = useState({});
  const [notice, setNotice] = useState('');

  useEffect(() => { fetchProviders().then(setInfo, () => setInfo(null)); }, []);
  useEffect(() => {
    if (!pid) return undefined;
    let cancelled = false;
    platform.members(pid).then(async m => {
      if (cancelled) return;
      setMembers(m);
      const us = await platform.users(m.map(x => x.userId));
      if (!cancelled) setUsers(Object.fromEntries(us.map(u => [u.id, u])));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pid]);

  // A preset sets the order and the modes; approvers and per-step settings stay.
  const applyPreset = p => {
    const by = Object.fromEntries(value.map(w => [w.step, w]));
    onChange(p.steps.map(s => ({ ...by[s.step], ...s })));
    setNotice('');
  };
  const applySuggested = () => {
    const sug = suggestedConfigs(info);
    onChange(value.map(w => ({ ...w, config: { ...sug[w.step], ...pruneEmpty(w.config) } })));
    setNotice('Đã điền gợi ý vào các ô còn trống: model mạnh cho phân tích và kiến trúc, model rẻ nhất cho kiểm thử, giới hạn phút, file cần đọc. Ô bạn đã đặt giữ nguyên.');
  };

  const running = value.filter(w => w.mode !== 'SKIP');
  const item = value.find(w => w.step === selected);
  const index = running.findIndex(w => w.step === selected);

  return (
    <div className="wfe">
      <div className="wfe-bar">
        {presets && !disabled && (
          <div className="wf-presets" role="group" aria-label="Mẫu quy trình">
            <span className="wf-presets-label">Mẫu nhanh</span>
            {WORKFLOW_PRESETS.map(p => (
              <button key={p.id} type="button" title={p.desc} className={`wf-preset${sameShape(value, p.steps) ? ' on' : ''}`} onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
            <button type="button" className="wf-preset wfe-suggest" disabled={!info} onClick={applySuggested}>
              <Wand2 size={13} aria-hidden="true" /> Gợi ý model & giới hạn
            </button>
          </div>
        )}
        <div className="wfe-views" role="tablist" aria-label="Cách xem quy trình">
          {VIEWS.map(v => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={`wfe-view${view === v.id ? ' on' : ''}`} onClick={() => setView(v.id)}>
              <v.icon size={13} aria-hidden="true" /> {v.label}
            </button>
          ))}
        </div>
      </div>
      {notice && <p className="wfe-notice" role="status">{notice}</p>}

      {view === 'canvas' && (
        <div className="wfe-split">
          <WorkflowCanvas value={value} selected={selected} onSelect={setSelected} />
          <WorkflowStepInspector item={item} index={index < 0 ? value.findIndex(w => w.step === selected) : index}
            value={value} onChange={onChange} info={info} members={members} users={users} disabled={disabled} />
        </div>
      )}
      {view === 'table' && <DetailTable value={value} onOpen={s => { setSelected(s); setView('canvas'); }} />}
      {view === 'phases' && <PhaseList value={value} onChange={onChange} disabled={disabled} />}
    </div>
  );
}

/** Everything the lane really runs, step by step, with each step's model, gate and guardrails. */
function DetailTable({ value, onOpen }) {
  let n = 0;
  return (
    <div className="wfe-table-wrap">
      <table className="wfe-table">
        <thead>
          <tr><th scope="col">#</th><th scope="col">Bước</th><th scope="col">Lane làm gì</th><th scope="col">Model</th><th scope="col">Duyệt</th><th scope="col">Giới hạn</th></tr>
        </thead>
        <tbody>
          {value.map(w => {
            const skip = w.mode === 'SKIP';
            const role = w.approverRole || defaultApproverRole(w.step);
            return (
              <tr key={w.step} className={skip ? 'skip' : ''}>
                <td className="num">{skip ? '—' : ++n}</td>
                <td><button type="button" className="linklike" onClick={() => onOpen(w.step)}>{STEP_LABEL[w.step]}</button></td>
                <td>{skip ? 'Bỏ qua' : <ul className="wfe-work">{PHASE_WORK[w.step].map(([who, what]) => <li key={who}><b>{who}</b> — {what}</li>)}</ul>}</td>
                <td>{skip ? '' : modelLabel(w.config)}</td>
                <td>{skip ? '' : w.mode === 'AUTO' ? 'Tự duyệt khi xanh' : (ROLE_LABEL[role] || role)}</td>
                <td>{skip ? '' : configSummary(w.config) || 'Không đặt'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The six phases as a list: drag (or ↑/↓) to reorder the document steps, pick each mode. */
function PhaseList({ value, onChange, disabled }) {
  const [drag, setDrag] = useState(null);
  const listRef = useRef(null);
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
    if (target !== value.findIndex(w => w.step === drag.step)) onChange(moveTo(value, drag.step, target));
    setDrag(d => ({ ...d, dy }));
  };
  const onKeyDown = (e, step, index) => {
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dir || disabled) return;
    e.preventDefault();
    onChange(moveTo(value, step, index + dir));
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-grip="${step}"]`)?.focus());
  };
  return (
    <div ref={listRef} className={`gate-pipeline-list${drag ? ' wf-dragging' : ''}`} style={{ border: 'none', borderRadius: 0 }}>
      {value.map((w, idx) => {
        const movable = MOVABLE.includes(w.step);
        const dragging = drag?.step === w.step;
        return (
          <div key={w.step} className={`gate-pipeline-card${w.mode === 'SKIP' ? ' wf-skipped' : ''}${dragging ? ' wf-lifted' : ''}`}
            style={dragging ? { transform: `translateY(${drag.dy - (idx - drag.base) * drag.h}px)` } : undefined}>
            <div className="gate-card-left">
              {movable && !disabled ? (
                <button type="button" className="wf-grip" data-grip={w.step} aria-label={`Kéo để đổi thứ tự bước ${STEP_LABEL[w.step]} (hoặc phím ↑ ↓)`}
                  onPointerDown={e => onPointerDown(e, w.step, idx)} onPointerMove={onPointerMove} onPointerUp={() => setDrag(null)}
                  onPointerCancel={() => setDrag(null)} onKeyDown={e => onKeyDown(e, w.step, idx)}>
                  <GripVertical size={16} aria-hidden="true" />
                </button>
              ) : (
                <span className="wf-grip wf-locked" title="Code và Test luôn ở cuối quy trình"><Lock size={14} aria-hidden="true" /></span>
              )}
              <div className="gate-step-index">{idx + 1}</div>
              <div className="gate-card-texts">
                <div className="gate-step-name">{STEP_LABEL[w.step]}</div>
                <div className="gate-step-desc">{PHASE_WORK[w.step].map(([who]) => who).join(' · ')}</div>
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
  );
}
