import React from 'react';
import { TriangleAlert } from 'lucide-react';
import ModelSelect from './ModelSelect.jsx';

const EFFORTS = [['', 'Effort mặc định'], ['low', 'Thấp'], ['medium', 'Trung bình'], ['high', 'Cao'], ['xhigh', 'Rất cao'], ['max', 'Tối đa']];

// One row per pipeline step. `value` = { [stepId]: "<provider>:<model>", impl_agents, effort: { [stepId]: level } }.
// Effort only applies to Claude models (higher = more thinking = more tokens).
export default function StepModels({ info, value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const setEffort = (k, v) => onChange({ ...value, effort: { ...(value.effort || {}), [k]: v } });
  return (
    <div className="steps-grid">
      {info.steps.map(s => {
        const external = !String(value[s.id] || '').startsWith('claude:');
        return (
          <div className="step-row" key={s.id}>
            <span className="step-label">{s.label}</span>
            <ModelSelect value={value[s.id]} info={info} claudeOnly={s.claudeOnly} label={`Model — ${s.label}`} onChange={v => set(s.id, v)} />
            <select className="msel step-effort" aria-label={`Effort — ${s.label}`} disabled={external}
              title={external ? 'Effort chỉ áp dụng cho model Claude' : 'Mức suy nghĩ: cao hơn = kỹ hơn nhưng tốn token hơn'}
              value={external ? '' : (value.effort || {})[s.id] || ''} onChange={e => setEffort(s.id, e.target.value)}>
              {EFFORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {s.id === 'impl-worker' && (
              <label className="step-n" title="số agent code song song (1 = tắt)">
                ×<input type="number" min="1" max="9" value={value.impl_agents}
                  onChange={e => set('impl_agents', parseInt(e.target.value, 10) || 1)} />
              </label>
            )}
            {external && s.warn && <span className="step-warn"><TriangleAlert size={12} strokeWidth={1.75} aria-hidden="true" /> {s.warn}</span>}
          </div>
        );
      })}
    </div>
  );
}
