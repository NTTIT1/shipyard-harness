import React, { useState } from 'react';
import { RotateCcw, Plus } from 'lucide-react';
import { quotaAmounts, quotaTitle, quotaState, grantSteps, grantLabel, resetScopeNote, meterPct } from '../../lib/quota.js';
import { tr, locale } from '../../lib/i18n.js';
import '../../styles/quota.css';

const fmtWhen = iso => (iso ? new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');

/** One limit: what it is, a meter, used / limit, its state. */
export function QuotaRow({ c, projectName, aside, children }) {
  const st = quotaState(c);
  return (
    <div className={`qt-row qt-${st.tone}`}>
      <div className="qt-row-head">
        <span className="qt-row-title">{quotaTitle(c, projectName)}</span>
        {aside}
        <span className={`qt-chip qt-chip-${st.tone}`}>{st.label}</span>
      </div>
      <span className="qt-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meterPct(c))}
        aria-label={tr('{0}: {1}%', [quotaTitle(c, projectName), Math.round(c.pct || 0)])}>
        <span style={{ transform: `scaleX(${c.enforced === false ? 0 : meterPct(c) / 100})` }} />
      </span>
      <div className="qt-row-foot">
        <span className="qt-amounts">{quotaAmounts(c)}</span>
        {c.enforced !== false && c.scope !== 'plan' && <span className="qt-pct">{Math.round(c.pct || 0)}%</span>}
        {c.scope === 'plan' && c.resetsAt && <span className="qt-pct">{tr('hồi lúc {0}', [fmtWhen(c.resetsAt)])}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * An admin's way out of one blocking limit: quick grants in its unit, a custom amount, a reset of the
 * counter when the limit allows it.
 */
export function GrantActions({ c, onGrant, onReset, busy }) {
  const [custom, setCustom] = useState('');
  if (c.scope === 'plan') {
    return <p className="qt-note">{tr('Gói Claude do Anthropic đặt: lane tự chạy tiếp lúc {0}, hoặc đổi model để làm ngay.', [fmtWhen(c.resetsAt)])}</p>;
  }
  const unit = c.unit === 'tokens' ? 'token' : c.unit === 'vnd' ? '₫' : 'USD';
  return (
    <div className="qt-actions">
      <div className="qt-grant" role="group" aria-label={tr('Cấp thêm cho {0}', [quotaTitle(c)])}>
        <span className="qt-grant-label">{tr('Cấp thêm')}</span>
        {grantSteps(c).map(v => (
          <button key={v} type="button" className="qt-pill" disabled={busy} onClick={() => onGrant(c, v)}>{grantLabel(c, v)}</button>
        ))}
        <form className="qt-custom" onSubmit={e => { e.preventDefault(); if (Number(custom) > 0) { onGrant(c, Number(custom)); setCustom(''); } }}>
          <input type="number" min="0" step="any" inputMode="decimal" placeholder={tr('Số khác')} value={custom}
            aria-label={tr('Số cấp thêm ({0})', [unit])} onChange={e => setCustom(e.target.value)} />
          <span className="qt-unit">{unit}</span>
          <button type="submit" className="qt-pill qt-pill-icon" disabled={busy || !(Number(custom) > 0)} aria-label={tr('Cấp thêm số này')}><Plus size={14} aria-hidden="true" /></button>
        </form>
      </div>
      {c.resettable && (
        <button type="button" className="qt-reset" disabled={busy} onClick={() => onReset(c)} title={resetScopeNote(c)}>
          <RotateCcw size={13} aria-hidden="true" /> {tr('Đặt lại về 0')}
          <span className="qt-reset-note">{resetScopeNote(c)}</span>
        </button>
      )}
    </div>
  );
}
