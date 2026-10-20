import React from 'react';
import { TriangleAlert } from 'lucide-react';
import ModelSelect from './ModelSelect.jsx';

const EFFORTS = [['', 'Effort mặc định'], ['low', 'Thấp'], ['medium', 'Trung bình'], ['high', 'Cao'], ['xhigh', 'Rất cao'], ['max', 'Tối đa']];

// One row per pipeline step. `value` = { [stepId]: "<provider>:<model>", impl_agents, effort: { [stepId]: level } }.
// Effort only applies to Claude models (higher = more thinking = more tokens).
/**
 * DEV engine: the lane's main Claude session codes (default), or OpenHands in a sandbox
 * (bin/openhands-step.sh) on a gateway model — Claude through the "anthropic" provider, or any other.
 */
function EngineRow({ step, info, value, onChange }) {
  const v = String(value || '');
  const isOh = v.startsWith('openhands:');
  const options = Object.entries(info.providers || {})
    .filter(([, p]) => p.configured && p.models.length)
    .flatMap(([id, p]) => p.models.map(m => [`openhands:${id}/${m}`, `OpenHands · ${p.label} · ${m}`]));
  const known = !isOh || options.some(([o]) => o === v);
  return (
    <div className="step-row">
      <span className="step-label">{step.label}</span>
      <select className="msel step-engine" aria-label={`Công cụ — ${step.label}`} value={isOh ? v : 'session'}
        onChange={e => onChange(e.target.value === 'session' ? 'claude:claude-opus-5-5' : e.target.value)}>
        <option value="session">Claude Code (phiên chính của lane)</option>
        {!known && <option value={v}>(không còn) {v}</option>}
        {options.length > 0 && (
          <optgroup label="OpenHands — sandbox">
            {options.map(([o, l]) => <option key={o} value={o}>{l}</option>)}
          </optgroup>
        )}
      </select>
      <span className="step-warn">
        <TriangleAlert size={12} strokeWidth={1.75} aria-hidden="true" />{' '}
        {isOh ? 'chạy trong container, tính tiền API theo token'
          : options.length ? 'chọn OpenHands để code trong sandbox' : 'thêm Anthropic ở Nhà cung cấp để dùng OpenHands'}
      </span>
    </div>
  );
}

export default function StepModels({ info, value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const setEffort = (k, v) => onChange({ ...value, effort: { ...(value.effort || {}), [k]: v } });
  return (
    <div className="steps-grid">
      {info.steps.map(s => {
        if (s.engine) return <EngineRow key={s.id} step={s} info={info} value={value[s.id]} onChange={v => set(s.id, v)} />;
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
