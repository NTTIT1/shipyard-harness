import React from 'react';

// <select> of "<provider>:<model>" values: Claude first, then every configured
// provider that has a model list. A value that is no longer offered (provider
// removed, model gone) stays visible as "(không còn)" instead of silently changing.
export default function ModelSelect({ value, onChange, info, claudeOnly, label }) {
  const groups = [{ id: 'claude', label: 'Claude', models: info.claude_models.map(m => [m.id, m.label]) }];
  if (!claudeOnly) {
    for (const [id, p] of Object.entries(info.providers)) {
      if (p.configured && p.models.length) groups.push({ id, label: p.label, models: p.models.map(m => [m, m]) });
    }
  }
  const offered = groups.some(g => g.models.some(([m]) => `${g.id}:${m}` === value));
  return (
    <select className="msel" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      {!offered && <option value={value}>(không còn) {value}</option>}
      {groups.map(g => (
        <optgroup key={g.id} label={g.label}>
          {g.models.map(([m, label]) => <option key={m} value={`${g.id}:${m}`}>{label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
