import React from 'react';
import { Bot, UserCheck, Zap, ChevronDown, Plus, X } from 'lucide-react';
import { STEP_LABEL, ROLE_LABEL, defaultApproverRole, addStep, removeStep } from '../../lib/review.js';
import { configSummary, modelLabel, PHASE_WORK } from '../../lib/workflow.js';
import { tr } from '../../lib/i18n.js';

/**
 * The workflow top to bottom: one node per step that runs (AI work → its gate). A step is left out with
 * its ✕ and put back from "Thêm bước" below (it slots in where it usually goes, needing approval).
 * Clicking a node opens it in the inspector.
 */
export default function WorkflowCanvas({ value, selected, onSelect, onChange, disabled = false }) {
  const editable = !!onChange && !disabled;
  const add = step => { onChange(addStep(value, step)); onSelect(step); };
  const remove = step => {
    const next = removeStep(value, step);
    onChange(next);
    if (selected === step) onSelect(next.find(w => w.mode !== 'SKIP')?.step || step);
  };
  const running = value.filter(w => w.mode !== 'SKIP');
  const skipped = value.filter(w => w.mode === 'SKIP');
  return (
    <div className="wfc" aria-label={tr('Sơ đồ quy trình')}>
      <div className="wfc-start">{tr('Yêu cầu tính năng')}</div>
      <ol className="wfc-list">
        {running.map((w, i) => {
          const role = w.approverRole || defaultApproverRole(w.step);
          const summary = configSummary(w.config);
          return (
            <li key={w.step} className="wfc-item">
              <ChevronDown size={14} className="wfc-arrow" aria-hidden="true" />
              {editable && w.step !== 'DEV' && (
                <button type="button" className="wfc-remove" onClick={() => remove(w.step)}
                  aria-label={tr('Bỏ bước {0} khỏi quy trình', [STEP_LABEL[w.step]])} title={tr('Bỏ bước này')}><X size={14} aria-hidden="true" /></button>
              )}
              <button type="button" className={`wfc-node${selected === w.step ? ' on' : ''}`} aria-pressed={selected === w.step}
                onClick={() => onSelect(w.step)}>
                <span className="wfc-num">{i + 1}</span>
                <span className="wfc-body">
                  <span className="wfc-name">{STEP_LABEL[w.step]}</span>
                  <span className="wfc-line">
                    <span className="wfc-chip"><Bot size={12} aria-hidden="true" /> {modelLabel(w.config)}</span>
                    {w.mode === 'AUTO'
                      ? <span className="wfc-chip auto"><Zap size={12} aria-hidden="true" />{' '}{tr('Tự duyệt khi xanh')}</span>
                      : <span className="wfc-chip gate"><UserCheck size={12} aria-hidden="true" />{' '}{tr('{0} duyệt', [ROLE_LABEL[role] || role])}</span>}
                  </span>
                  {summary && <span className="wfc-sum">{summary}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="wfc-end"><ChevronDown size={14} className="wfc-arrow" aria-hidden="true" />{tr('Mở PR · gộp · hoàn tất')}</div>
      {skipped.length > 0 && (editable ? (
        <div className="wfc-add" role="group" aria-label={tr('Thêm bước vào quy trình')}>
          <span className="wfc-add-h">{tr('Thêm bước')}</span>
          {skipped.map(w => (
            <button key={w.step} type="button" className="wfc-add-btn" onClick={() => add(w.step)}>
              <Plus size={14} aria-hidden="true" />
              <span><b>{STEP_LABEL[w.step]}</b><small>{(PHASE_WORK[w.step] || []).map(([who, what]) => `${who} — ${what}`).join(' · ')}</small></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="wfc-skipped">
          <span>{tr('Bỏ qua:')}</span>
          {skipped.map(w => (
            <button key={w.step} type="button" className={`wfc-skip${selected === w.step ? ' on' : ''}`} onClick={() => onSelect(w.step)}>{STEP_LABEL[w.step]}</button>
          ))}
        </div>
      ))}
    </div>
  );
}
