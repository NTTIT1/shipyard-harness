import React from 'react';
import ModelSelect from './ModelSelect.jsx';

// One row per pipeline step. `value` = { [stepId]: "<provider>:<model>", impl_agents }.
export default function StepModels({ info, value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="steps-grid">
      {info.steps.map(s => {
        const external = !String(value[s.id] || '').startsWith('claude:');
        return (
          <div className="step-row" key={s.id}>
            <span className="step-label">{s.label}</span>
            <ModelSelect value={value[s.id]} info={info} claudeOnly={s.claudeOnly} onChange={v => set(s.id, v)} />
            {s.id === 'impl-worker' && (
              <label className="step-n" title="số agent code song song (1 = tắt)">
                ×<input type="number" min="1" max="9" value={value.impl_agents}
                  onChange={e => set('impl_agents', parseInt(e.target.value, 10) || 1)} />
              </label>
            )}
            {external && s.warn && <span className="step-warn">⚠ {s.warn}</span>}
          </div>
        );
      })}
    </div>
  );
}
