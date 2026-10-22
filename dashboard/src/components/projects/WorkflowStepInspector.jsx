import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Plus, X } from 'lucide-react';
import ModelSelect from '../ModelSelect.jsx';
import { STEP_LABEL, GATE_MODES, MOVABLE, APPROVER_ROLE_OPTIONS, defaultApproverRole } from '../../lib/review.js';
import { CONDITIONS, ON_FAILURE, KNOWN_INPUTS, PHASE_WORK, validInput, configProblem } from '../../lib/workflow.js';

/**
 * Settings of one workflow step. Every field is stored on the project, frozen into each run and
 * enforced: the model by the lane, the guardrails by run-step.sh, the condition by the orchestrator.
 * Edits go to the page's draft; "Lưu quy trình" saves them.
 */
export default function WorkflowStepInspector({ item, index, value, onChange, info, members = [], users = {}, disabled = false }) {
  const [custom, setCustom] = useState('');
  if (!item) return null;
  const step = item.step;
  const cfg = item.config || {};
  const set = patch => onChange(value.map(w => (w.step === step ? { ...w, ...patch } : w)));
  const setCfg = patch => set({ config: { ...cfg, ...patch } });
  const inputs = cfg.requiredInputs || [];
  const toggleInput = p => setCfg({ requiredInputs: inputs.includes(p) ? inputs.filter(x => x !== p) : [...inputs, p] });
  const addCustom = () => {
    const p = custom.trim();
    if (!validInput(p) || inputs.includes(p)) return;
    setCfg({ requiredInputs: [...inputs, p] });
    setCustom('');
  };
  const move = dir => {
    const i = value.findIndex(w => w.step === step), j = i + dir;
    if (j < 0 || !MOVABLE.includes(value[j]?.step)) return;
    const out = [...value];
    [out[i], out[j]] = [out[j], out[i]];
    onChange(out);
  };
  const movable = MOVABLE.includes(step);
  const lastMovable = value.findIndex(w => !MOVABLE.includes(w.step)) - 1;
  const role = item.approverRole || defaultApproverRole(step);
  const eligible = members.filter(m => m.roles?.includes(role) || m.roles?.includes('OWNER') || m.roles?.includes('MAINTAINER'));
  const problem = configProblem(step, cfg);
  const id = k => `wfi-${step}-${k}`;
  const skipped = item.mode === 'SKIP';

  return (
    <section className="wfi" aria-labelledby={id('title')}>
      <header className="wfi-head">
        <div>
          <h3 id={id('title')} className="wfi-title">{index + 1}. {STEP_LABEL[step]}</h3>
          <ul className="wfi-work">
            {PHASE_WORK[step].map(([who, what]) => <li key={who}><b>{who}</b> — {what}</li>)}
          </ul>
        </div>
        {movable && !disabled && (
          <span className="wfi-move">
            <button type="button" className="wf-move-btn" aria-label={`Đưa ${STEP_LABEL[step]} lên trước`} disabled={index === 0} onClick={() => move(-1)}><ArrowUp size={14} aria-hidden="true" /></button>
            <button type="button" className="wf-move-btn" aria-label={`Đưa ${STEP_LABEL[step]} xuống sau`} disabled={index >= lastMovable} onClick={() => move(1)}><ArrowDown size={14} aria-hidden="true" /></button>
          </span>
        )}
      </header>

      <fieldset className="wfi-group">
        <legend>Sau khi AI làm xong</legend>
        <div className="wf-mode" role="radiogroup" aria-label={`Chế độ bước ${STEP_LABEL[step]}`}>
          {GATE_MODES.filter(g => !(step === 'DEV' && g.id === 'SKIP')).map(g => (
            <label key={g.id} className={item.mode === g.id ? 'on' : ''}>
              <input type="radio" name={id('mode')} checked={item.mode === g.id} disabled={disabled} onChange={() => set({ mode: g.id })} />
              {g.label}
            </label>
          ))}
        </div>
        {item.mode === 'REQUIRED' && (
          <div className="wfi-row">
            <label className="wfi-field" htmlFor={id('role')}>Vai trò duyệt
              <select id={id('role')} className="msel" disabled={disabled} value={role} onChange={e => set({ approverRole: e.target.value, approverId: null })}>
                {APPROVER_ROLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="wfi-field" htmlFor={id('who')}>Người duyệt
              <select id={id('who')} className="msel" disabled={disabled || !eligible.length} value={item.approverId || ''} onChange={e => set({ approverId: e.target.value || null })}>
                <option value="">Bất kỳ ai có vai trò này</option>
                {eligible.map(m => <option key={m.userId} value={m.userId}>{users[m.userId]?.name || users[m.userId]?.email || m.userId}</option>)}
              </select>
            </label>
          </div>
        )}
        {skipped && <p className="wfi-hint">Bước không chạy; bước sau làm từ yêu cầu gốc và tài liệu đã có.</p>}
      </fieldset>

      {!skipped && (
        <>
          <fieldset className="wfi-group">
            <legend>Model AI</legend>
            {info ? (
              <ModelSelect id={id('model')} value={cfg.model || ''} info={info} openhands={step === 'DEV' || step === 'TEST'}
                emptyLabel="Mặc định của lane" label={`Model AI — ${STEP_LABEL[step]}`} onChange={v => setCfg({ model: v })} />
            ) : <p className="wfi-hint">Đang tải danh sách model…</p>}
            <p className="wfi-hint">
              {step === 'DEV'
                ? 'Claude = phiên chính của lane tự code; OpenHands = code trong hộp kín qua cổng LiteLLM.'
                : 'Chọn sẵn khi giao việc cho lane của dự án; từng tính năng vẫn đổi được ở Giao việc.'}
            </p>
          </fieldset>

          <fieldset className="wfi-group">
            <legend>Giới hạn</legend>
            <div className="wfi-row wfi-row-3">
              <label className="wfi-field" htmlFor={id('time')}>Giới hạn phút
                <input id={id('time')} type="number" inputMode="numeric" min="1" max="480" placeholder="Không giới hạn" disabled={disabled}
                  value={cfg.timeoutMinutes ?? ''} onChange={e => setCfg({ timeoutMinutes: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </label>
              <label className="wfi-field" htmlFor={id('budget')}>Ngân sách (₫)
                <input id={id('budget')} type="number" inputMode="numeric" min="0" step="50000" placeholder="Không giới hạn" disabled={disabled}
                  value={cfg.budgetVnd ?? ''} onChange={e => setCfg({ budgetVnd: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </label>
              <label className="wfi-field" htmlFor={id('retries')}>Số vòng thử lại
                <input id={id('retries')} type="number" inputMode="numeric" min="0" max="5" placeholder="0" disabled={disabled}
                  value={cfg.maxRetries ?? ''} onChange={e => setCfg({ maxRetries: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </label>
            </div>
            <div className="wfi-row">
              <label className="wfi-field" htmlFor={id('cond')}>Điều kiện chạy
                <select id={id('cond')} className="msel" disabled={disabled || step === 'DEV'} value={cfg.condition || 'ALWAYS'} onChange={e => setCfg({ condition: e.target.value })}>
                  {CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label className="wfi-field" htmlFor={id('fail')}>Khi AI lỗi / quá giờ / vượt ngân sách
                <select id={id('fail')} className="msel" disabled={disabled} value={cfg.onFailure || 'ESCALATE_HUMAN'} onChange={e => setCfg({ onFailure: e.target.value })}>
                  {ON_FAILURE.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <p className="wfi-hint">
              {step === 'DEV'
                ? 'Code trong phiên chính: số vòng thử = số vòng tự sửa khi CI/e2e đỏ (mặc định 3); giới hạn phút và ngân sách được kiểm tra trước mỗi vòng.'
                : 'Mỗi lần AI chạy bị cắt ở giới hạn phút; vượt ngân sách thì không chạy thêm. Thử lại chỉ áp dụng khi chọn "Tự thử lại".'}
            </p>
          </fieldset>

          <fieldset className="wfi-group">
            <legend>Đầu vào bắt buộc</legend>
            <div className="wfi-chips">
              {KNOWN_INPUTS.map(k => {
                const on = inputs.includes(k.path);
                return (
                  <button key={k.path} type="button" className={`wfi-chip${on ? ' on' : ''}`} aria-pressed={on} disabled={disabled}
                    title={k.path} onClick={() => toggleInput(k.path)}>{k.label}</button>
                );
              })}
              {inputs.filter(p => !KNOWN_INPUTS.some(k => k.path === p)).map(p => (
                <span key={p} className="wfi-chip on mono">{p}
                  {!disabled && <button type="button" className="wfi-chip-x" aria-label={`Bỏ ${p}`} onClick={() => toggleInput(p)}><X size={12} aria-hidden="true" /></button>}
                </span>
              ))}
            </div>
            {!disabled && (
              <div className="wfi-row wfi-add">
                <input aria-label="Thêm đường dẫn file đầu vào" placeholder="Đường dẫn khác, vd backend/openapi.yaml" value={custom}
                  onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
                <button type="button" className="btn btn-sm btn-secondary" disabled={!validInput(custom.trim())} onClick={addCustom}>
                  <Plus size={14} aria-hidden="true" /><span>Thêm</span>
                </button>
              </div>
            )}
            <p className="wfi-hint">Thiếu file nào thì bước dừng trước khi tốn token. AI chỉ được dặn đọc đúng các file này. Tên không có “/” nằm trong thư mục spec của tính năng.</p>
          </fieldset>
        </>
      )}
      {problem && <p className="m-err" role="alert">{problem}</p>}
    </section>
  );
}
