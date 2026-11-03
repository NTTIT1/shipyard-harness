import React, { useEffect, useState } from 'react';
import { OctagonPause, ArrowUpRight, Sparkles, Pencil, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { GrantActions } from './QuotaParts.jsx';
import { saveCostSettings, grantLaneQuota, resetLaneQuota } from '../../lib/api.js';
import { quotaAmounts, quotaTitle, quotaState, meterPct } from '../../lib/quota.js';
import { fmtUsd } from '../../lib/costs.js';
import { tr, locale } from '../../lib/i18n.js';

const fmtWhen = iso => (iso ? new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');

/**
 * "Hạn mức": one screen read top to bottom — the month's shared limit (and Claude's plan beside it), the lanes
 * a limit has stopped, then every own limit in one aligned list switched between projects, lanes and models.
 */
export default function QuotaBoard({ board, settings, projects = [], onSaved, onOpenLane }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [scope, setScope] = useState('project');
  const projectName = id => projects.find(p => p.id === id)?.name || id;
  if (!board) return null;
  const { rows, held } = board;
  const month = rows.month[0];

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try { await fn(); setMsg({ ok, err: '' }); await onSaved(); } catch (e) { setMsg({ ok: '', err: e.message }); }
    setBusy(false);
  };
  const scopes = [
    { id: 'project', label: tr('Dự án'), list: rows.project, empty: tr('Chưa có dự án nào dùng AI tháng này.') },
    { id: 'lane', label: tr('Lane'), list: rows.lane, empty: tr('Chưa có lane nào.') },
    { id: 'model', label: tr('Model'), list: rows.model, empty: tr('Chưa có model nào dùng tháng này.') },
  ];
  const cur = scopes.find(s => s.id === scope);
  const save = (c, v) => {
    const map = { project: 'projectLimits', lane: 'laneLimits', model: 'modelLimits' }[c.scope];
    return run(() => saveCostSettings({ [map]: { [c.key]: v } }), tr('Đã lưu hạn mức.'));
  };

  return (
    <div className="qb">
      {held.length > 0 && (
        <section className="qb-alert" aria-labelledby="qb-held-title">
          <h2 id="qb-held-title" className="qb-alert-title"><OctagonPause size={16} aria-hidden="true" />{tr('{0} lane đang dừng vì hết hạn mức', [held.length])}</h2>
          {held.map(h => h.checks.map(c => (
            <div key={`${h.lane}-${c.id}`} className="qb-alert-row">
              <div className="qb-alert-who">
                <b>{tr('Lane {0}', [h.lane])}</b>
                <span>{[h.feature, h.projectId && projectName(h.projectId)].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="qb-alert-why">
                <span>{c.scope === 'lane' ? tr('Hạn mức của lane') : quotaTitle(c, projectName)}</span>
                <b>{quotaAmounts(c)}</b>
              </div>
              <GrantActions c={c} busy={busy}
                onGrant={(x, add) => run(() => grantLaneQuota(h.lane, x.id, add), tr('Đã cấp thêm cho lane {0}.', [h.lane]))}
                onReset={x => run(() => resetLaneQuota(h.lane, x.id), tr('Đã đặt lại bộ đếm.'))} />
              {onOpenLane && <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={() => onOpenLane(h.lane)}>{tr('Mở lane')}</Button>}
            </div>
          )))}
        </section>
      )}

      <section className="qb-hero" aria-label={tr('Hạn mức chung tháng')}>
        <MonthLimit c={month} warnPct={board.warnPct} monthKey={board.month} disabled={busy}
          onSave={v => run(() => saveCostSettings(v), tr('Đã lưu hạn mức chung.'))} />
        {rows.plan.length > 0 && (
          <aside className="qb-plan" aria-label={tr('Gói Claude')}>
            <div className="qb-plan-head"><Sparkles size={14} aria-hidden="true" />{tr('Gói Claude')}<span>{tr('Do Anthropic đặt — tự hồi')}</span></div>
            {rows.plan.map(c => {
              const st = quotaState(c);
              return (
                <div key={c.id} className={`qb-plan-row qt-${st.tone}`}>
                  <div className="qb-plan-top"><span>{quotaTitle(c).replace(/^.*·\s*/, '')}</span><b>{c.level === 'blocked' ? st.label : `${Math.round(c.pct)}%`}</b></div>
                  <span className="qt-meter" aria-hidden="true"><span style={{ transform: `scaleX(${meterPct(c) / 100})` }} /></span>
                  {c.resetsAt && <span className="qb-plan-reset">{tr('hồi lúc {0}', [fmtWhen(c.resetsAt)])}</span>}
                </div>
              );
            })}
          </aside>
        )}
      </section>

      {(msg.ok || msg.err) && <p className={msg.err ? 'm-err' : 'qt-ok'} role={msg.err ? 'alert' : 'status'}>{msg.err || msg.ok}</p>}

      <section className="qb-list" aria-labelledby="qb-list-title">
        <header className="qb-list-head">
          <div>
            <h3 id="qb-list-title">{tr('Hạn mức riêng')}</h3>
            <p>{tr('Chạm 100% là lane dừng và chờ quản trị viên. Mục chưa đặt riêng chỉ theo hạn mức chung.')}</p>
          </div>
          <div className="qb-seg" role="tablist" aria-label={tr('Loại hạn mức')}>
            {scopes.map(s => (
              <button key={s.id} type="button" role="tab" aria-selected={scope === s.id} className={scope === s.id ? 'on' : ''} onClick={() => setScope(s.id)}>
                {s.label}<span>{s.list.length}</span>
              </button>
            ))}
          </div>
        </header>
        {cur.list.length ? (
          <ul className="qb-rows">
            {cur.list.map(c => (
              <LimitRow key={c.id} c={c} disabled={busy} onSave={v => save(c, v)}
                title={c.scope === 'project' ? projectName(c.key) : c.scope === 'lane' ? tr('Lane {0}', [c.key]) : c.key}
                sub={c.scope === 'project' ? (c.lanes?.length ? tr('Lane {0}', [c.lanes.join(', ')]) : '')
                  : c.scope === 'lane' ? [c.feature, c.projectId && projectName(c.projectId)].filter(Boolean).join(' · ') : ''} />
            ))}
          </ul>
        ) : <p className="qb-empty">{cur.empty}</p>}
      </section>
    </div>
  );
}

/** The month's shared limit: big figure, a meter with the warning mark, what is left and when it renews. */
function MonthLimit({ c, warnPct, monthKey, onSave, disabled }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ usd: c.limitUsd || '', warn: warnPct });
  useEffect(() => setV({ usd: c.limitUsd || '', warn: warnPct }), [c.limitUsd, warnPct, edit]);
  const st = quotaState(c);
  const [y, m] = String(monthKey || '').split('-').map(Number);
  const renew = y && m ? new Date(y, m, 1).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }) : '';
  const left = Math.max(0, (c.limitUsd || 0) - (c.usd || 0));
  const submit = e => {
    e.preventDefault();
    const patch = { monthlyBudgetUsd: Number(v.usd) || 0 };
    if (Number(v.warn) > 0 && Number(v.warn) < 100) patch.quotaWarnPct = Number(v.warn);
    onSave(patch); setEdit(false);
  };
  return (
    <div className={`qb-month qt-${st.tone}`}>
      <div className="qb-month-top">
        <span className="qb-month-label">{tr('Hạn mức chung tháng')}</span>
        <span className={`qt-chip qt-chip-${st.tone}`}>{st.label}</span>
        <button type="button" className="qb-edit" aria-expanded={edit} onClick={() => setEdit(x => !x)}>
          {edit ? <X size={13} aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}{edit ? tr('Đóng') : tr('Sửa')}
        </button>
      </div>
      <div className="qb-month-figure">
        <b>{Math.round(c.pct || 0)}<small>%</small></b>
        <span>{quotaAmounts(c)}</span>
      </div>
      <div className="qb-month-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meterPct(c))} aria-label={tr('Hạn mức chung tháng')}>
        <span className="qt-meter"><span style={{ transform: `scaleX(${meterPct(c) / 100})` }} /></span>
        <i className="qb-mark" style={{ left: `${warnPct}%` }} title={tr('Cảnh báo ở {0}%', [warnPct])} />
      </div>
      <div className="qb-month-foot">
        <span>{tr('Còn {0}', [fmtUsd(left)])}</span>
        {renew && <span>{tr('Làm mới {0}', [renew])}</span>}
        <span>{tr('Cảnh báo ở {0}%', [warnPct])}</span>
      </div>
      {edit && (
        <form className="qb-editor" onSubmit={submit}>
          <label>{tr('Ngân sách tháng')}<input type="number" min="0" step="any" inputMode="decimal" value={v.usd} onChange={e => setV({ ...v, usd: e.target.value })} />USD</label>
          <label>{tr('Cảnh báo khi đạt')}<input type="number" min="1" max="99" value={v.warn} onChange={e => setV({ ...v, warn: e.target.value })} />%</label>
          <Button size="sm" variant="primary" type="submit" disabled={disabled}>{tr('Lưu')}</Button>
        </form>
      )}
    </div>
  );
}

/** One own limit in the aligned list; an unset one shows only what was used. */
function LimitRow({ c, title, sub, onSave, disabled }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ usd: '', tokens: '' });
  useEffect(() => { setV({ usd: c.limitUsd || '', tokens: c.limitTokens || '' }); }, [c.limitUsd, c.limitTokens, open]);
  const st = quotaState(c);
  const save = e => {
    e.preventDefault();
    const out = {};
    if (String(v.usd).trim() !== '') out.usd = Number(v.usd);
    if (String(v.tokens).trim() !== '') out.tokens = Number(v.tokens);
    onSave(Object.keys(out).length ? out : null);
    setOpen(false);
  };
  return (
    <li className={`qb-row qt-${st.tone}${c.enforced ? '' : ' unset'}${open ? ' open' : ''}`}>
      <div className="qb-row-main">
        <div className="qb-row-name">
          <b className={c.scope === 'model' ? 'mono' : ''}>{title}</b>
          {sub && <span>{sub}</span>}
        </div>
        {c.enforced ? (
          <div className="qb-row-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meterPct(c))} aria-label={title}>
            <span className="qt-meter"><span style={{ transform: `scaleX(${meterPct(c) / 100})` }} /></span>
          </div>
        ) : <div className="qb-row-meter qb-row-none">{tr('Theo hạn mức chung')}</div>}
        <div className="qb-row-amt">
          {c.enforced ? <><b>{Math.round(c.pct || 0)}%</b><span>{quotaAmounts(c)}</span></> : <span>{tr('đã dùng {0}', [fmtUsd(c.usd || 0)])}</span>}
        </div>
        <div className="qb-row-state">{c.enforced && <span className={`qt-chip qt-chip-${st.tone}`}>{st.label}</span>}</div>
        <button type="button" className="qb-edit" aria-expanded={open} aria-label={tr('Sửa hạn mức {0}', [title])} onClick={() => setOpen(o => !o)}>
          {open ? tr('Đóng') : c.enforced ? tr('Sửa') : tr('Đặt')}
        </button>
      </div>
      {open && (
        <form className="qb-editor" onSubmit={save}>
          <label>USD<input type="number" min="0" step="any" inputMode="decimal" value={v.usd} placeholder={tr('trống')} onChange={e => setV({ ...v, usd: e.target.value })} /></label>
          <label>{tr('Token')}<input type="number" min="0" step="100000" value={v.tokens} placeholder={tr('trống')} onChange={e => setV({ ...v, tokens: e.target.value })} /></label>
          <Button size="sm" variant="primary" type="submit" disabled={disabled}>{tr('Lưu')}</Button>
          {c.enforced && <Button size="sm" variant="ghost" type="button" disabled={disabled} onClick={() => { onSave(null); setOpen(false); }}>{tr('Bỏ hạn mức riêng')}</Button>}
          <span className="qt-note">{tr('Token chỉ tính cho model miễn phí (qua gateway); model có giá tính theo USD.')}</span>
        </form>
      )}
    </li>
  );
}
