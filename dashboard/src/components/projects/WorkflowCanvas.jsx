import React from 'react';
import { Bot, UserCheck, Zap, ChevronDown } from 'lucide-react';
import { STEP_LABEL, ROLE_LABEL, defaultApproverRole } from '../../lib/review.js';
import { configSummary, modelLabel } from '../../lib/workflow.js';

/**
 * The workflow top to bottom: one node per step that runs (AI work → its gate), steps left out
 * listed at the end so they can be picked and switched back on. Clicking a node opens it in the
 * inspector.
 */
export default function WorkflowCanvas({ value, selected, onSelect }) {
  const running = value.filter(w => w.mode !== 'SKIP');
  const skipped = value.filter(w => w.mode === 'SKIP');
  return (
    <div className="wfc" aria-label="Sơ đồ quy trình">
      <div className="wfc-start">Yêu cầu tính năng</div>
      <ol className="wfc-list">
        {running.map((w, i) => {
          const role = w.approverRole || defaultApproverRole(w.step);
          const summary = configSummary(w.config);
          return (
            <li key={w.step} className="wfc-item">
              <ChevronDown size={14} className="wfc-arrow" aria-hidden="true" />
              <button type="button" className={`wfc-node${selected === w.step ? ' on' : ''}`} aria-pressed={selected === w.step}
                onClick={() => onSelect(w.step)}>
                <span className="wfc-num">{i + 1}</span>
                <span className="wfc-body">
                  <span className="wfc-name">{STEP_LABEL[w.step]}</span>
                  <span className="wfc-line">
                    <span className="wfc-chip"><Bot size={12} aria-hidden="true" /> {modelLabel(w.config)}</span>
                    {w.mode === 'AUTO'
                      ? <span className="wfc-chip auto"><Zap size={12} aria-hidden="true" /> Tự duyệt khi xanh</span>
                      : <span className="wfc-chip gate"><UserCheck size={12} aria-hidden="true" /> {ROLE_LABEL[role] || role} duyệt</span>}
                  </span>
                  {summary && <span className="wfc-sum">{summary}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="wfc-end"><ChevronDown size={14} className="wfc-arrow" aria-hidden="true" />Mở PR · gộp · hoàn tất</div>
      {skipped.length > 0 && (
        <div className="wfc-skipped">
          <span>Bỏ qua:</span>
          {skipped.map(w => (
            <button key={w.step} type="button" className={`wfc-skip${selected === w.step ? ' on' : ''}`} onClick={() => onSelect(w.step)}>{STEP_LABEL[w.step]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
