import React, { useRef } from 'react';
export default function Tabs({ value, onChange, items }) {
  const refs = useRef([]);
  const key = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    refs.current[n]?.focus(); onChange(items[n].id);
  };
  return (
    <div className="tabs" role="tablist">
      {items.map((t, i) => (
        <button key={t.id} ref={el => { refs.current[i] = el; }} role="tab" id={`tab-${t.id}`}
          aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1}
          className={`tab${value === t.id ? ' on' : ''}`} onClick={() => onChange(t.id)} onKeyDown={e => key(e, i)}>
          {t.label}
          {t.badge != null && <span className="tab-badge">{t.badge}</span>}
          {t.dot && <i className="tab-dot" aria-label="cần bạn" />}
        </button>
      ))}
    </div>
  );
}
