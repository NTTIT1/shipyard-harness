import React from 'react';

// <select> of "<provider>:<model>" values: Claude first, then every configured
// provider that has a model list. A value that is no longer offered (provider
// removed, model gone) stays visible as "(không còn)" instead of silently changing.
export default function ModelSelect({ value, onChange, info, claudeOnly, openhands, label, emptyLabel, id }) {
  const groups = [{ id: 'claude', label: 'Claude', models: info.claude_models.map(m => [m.id, m.label]) }];
  if (!claudeOnly) {
    for (const [id, p] of Object.entries(info.providers)) {
      if (p.configured && p.models.length) groups.push({ id, label: p.label, models: p.models.map(m => [m, m]) });
    }
  }
  // Steps that may run in the OpenHands sandbox (TEST): "openhands:<provider>/<model>".
  if (openhands) {
    const oh = Object.entries(info.providers).filter(([, p]) => p.configured && p.models.length)
      .flatMap(([id, p]) => p.models.map(m => [`${id}/${m}`, `OpenHands · ${p.label} · ${m}`]));
    if (oh.length) groups.push({ id: 'openhands', label: 'OpenHands — hộp kín', models: oh });
  }
  const offered = (emptyLabel && !value) || groups.some(g => g.models.some(([m]) => `${g.id}:${m}` === value));
  return (
    <select className="msel" id={id} aria-label={label} value={value || ''} onChange={e => onChange(e.target.value)}>
      {emptyLabel && <option value="">{emptyLabel}</option>}
      {!offered && <option value={value}>(không còn) {value}</option>}
      {groups.map(g => (
        <optgroup key={g.id} label={g.label}>
          {g.models.map(([m, label]) => <option key={m} value={`${g.id}:${m}`}>{label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
