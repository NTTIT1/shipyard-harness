import React, { useEffect, useState } from 'react';
import { ChevronDown, Save, Cpu, RotateCcw } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import StepModels from '../StepModels.jsx';
import {
  saveCostSettings, saveFeatureHours,
  saveLaneModelDefaults, saveFeatureModels
} from '../../lib/api.js';
import { PHASE_LABEL, PHASE_ORDER, ROLE_LABEL, EFFORT_LABEL, fmtVnd, fmtTokens, fmtUsd, sumTokens, ratioTone } from '../../lib/costs.js';
import { tr, locale } from '../../lib/i18n.js';

export const HUMAN_PHASES = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'SECURITY', 'TEST'];
export const PLAN_LABEL = { five_hour: tr('Hạn mức 5 giờ'), seven_day: tr('Hạn mức 7 ngày'), seven_day_opus: tr('7 ngày (Opus)'), seven_day_sonnet: tr('7 ngày (Sonnet)') };
export const fmtTime = iso => (iso ? new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
export const pctTone = p => (p >= 90 ? 'danger' : p >= 70 ? 'warn' : 'ok');

export function Tile({ label, value, sub, tone, pct }) {
  return (
    <div className="ct-tile">
      <span className="ct-tile-label">{label}</span>
      <span className={`ct-tile-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
      {pct != null && (
        <span className="ct-meter" aria-hidden="true" style={{ marginTop: 4 }}>
          <span style={{
            width: `${Math.max(1, Math.min(100, Number(pct) || 0))}%`,
            background: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)'
          }} />
        </span>
      )}
      {sub && <span className="ct-tile-sub">{sub}</span>}
    </div>
  );
}

export function DayBars({ days }) {
  const [tip, setTip] = useState(null);
  if (!days.length) return <p className="muted-empty">{tr('Chưa có dữ liệu trong tháng này.')}</p>;
  const max = Math.max(...days.map(d => d.vnd), 1);
  return (
    <figure className="ct-chart" aria-label={tr('Chi phí theo ngày')}>
      <figcaption className="ct-chart-title">{tr('Chi phí phân bổ theo ngày')}{' '}<span className="faint">{tr('· cao nhất {0}', [fmtVnd(max)])}</span></figcaption>
      <div className="ct-bars" onMouseLeave={() => setTip(null)}>
        {days.map((d, i) => (
          <button key={d.day} type="button" className="ct-col" aria-label={`${d.day}: ${fmtVnd(d.vnd)}, ${fmtTokens(sumTokens(d.tokens))} token`}
            onMouseEnter={() => setTip({ ...d, i })} onFocus={() => setTip({ ...d, i })} onBlur={() => setTip(null)}>
            <span className={`ct-col-bar${tip?.day === d.day ? ' on' : ''}`} style={{ height: `${Math.max(2, (d.vnd / max) * 100)}%` }} />
          </button>
        ))}
        {tip && (
          <div className={`ct-tip${tip.i > days.length / 2 ? ' left' : ''}`} role="status"
            style={tip.i > days.length / 2 ? { right: `${((days.length - tip.i) / days.length) * 100}%` } : { left: `${((tip.i + 1) / days.length) * 100}%` }}>
            <b>{tip.day}</b><span>{fmtVnd(tip.vnd)}</span><span>{tr('{0} quy đổi API', [fmtUsd(tip.usd)])}</span><span>{fmtTokens(sumTokens(tip.tokens))} token</span>
          </div>
        )}
      </div>
      <div className="ct-axis"><span>{days[0].day.slice(5)}</span><span>{days[days.length - 1].day.slice(5)}</span></div>
    </figure>
  );
}

export const Meter = ({ value, max, tone }) => (
  <span className="ct-meter" aria-hidden="true">
    <span style={{
      width: `${max ? Math.min(100, Math.max(1, (value / max) * 100)) : 0}%`,
      background: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)'
    }} />
  </span>
);

/** Share bar for a row: how this row compares with the biggest one in the list. */
const RankBar = ({ value, max }) => (
  <span className="ct-rank" aria-hidden="true"><span style={{ width: `${max ? Math.max(2, Math.min(100, (value / max) * 100)) : 0}%` }} /></span>
);

export function FeatureItem({ f, maxVnd, settings, provInfo, onSaved }) {
  const [open, setOpen] = useState(false);
  const [editModels, setEditModels] = useState(false);
  const [hours, setHours] = useState(f.hours);
  const [fModels, setFModels] = useState(null);
  const [msg, setMsg] = useState('');
  const [mMsg, setMMsg] = useState('');

  useEffect(() => setHours(f.hours), [f.hours]);
  useEffect(() => {
    if (!provInfo) return;
    const base = (provInfo.lane_defaults || {})[String(f.lane)] || provInfo.defaults;
    const saved = (provInfo.feature_models || {})[f.key];
    setFModels(saved || base);
  }, [provInfo, f.key, f.lane]);

  const tone = ratioTone(f.ratio);
  const save = async () => {
    try { await saveFeatureHours(f.key, hours); setMsg(tr('Đã lưu giờ ước tính.')); onSaved(); } catch (e) { setMsg(tr('Lỗi: {0}', [e.message])); }
  };
  const saveModels = async () => {
    try {
      const { impl_agents, effort, gates: _gates, ...stepModels } = fModels;
      await saveFeatureModels({ key: f.key, models: stepModels, effort, impl_agents, lane: f.lane });
      setMMsg(tr('Đã lưu model cho tính năng này.'));
      onSaved();
    } catch (e) {
      setMMsg(tr('Lỗi: {0}', [e.message]));
    }
  };
  const phases = PHASE_ORDER.filter(p => f.phases[p]);
  const maxPhase = Math.max(...phases.map(p => f.phases[p].vnd), 1);
  const hasCustomFeatModel = !!(provInfo && (provInfo.feature_models || {})[f.key]);
  const panelId = `ct-feat-${f.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <li className={`ct-item${open ? ' open' : ''}`}>
      <button type="button" className="ct-row ct-row-feat" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
        <span className="ct-cell-main">
          <span className="ct-title">{f.title || f.key}</span>
          <span className="ct-meta">
            <span>Lane {f.lane}</span>
            {f.sharePct != null && <span>{tr('{0}% chi phí tháng', [f.sharePct])}</span>}
            {hasCustomFeatModel && <Badge tone="accent">{tr('Model riêng')}</Badge>}
          </span>
          <RankBar value={f.vnd} max={maxVnd} />
        </span>
        <span className="ct-cell-num">
          <span className="ct-num-strong">{fmtVnd(f.vnd)}</span>
          <span className="ct-num-sub">{fmtUsd(f.usd)} · {fmtTokens(sumTokens(f.tokens))} token</span>
        </span>
        <span className="ct-cell-num ct-cell-ratio">
          <span className={`ct-num-strong tone-${tone}`}>{f.ratio == null ? '—' : `${Math.round(f.ratio * 100)}%`}</span>
          <span className="ct-num-sub">{tr('so với {0}', [fmtVnd(f.humanVnd)])}</span>
        </span>
        <ChevronDown size={16} className="ct-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="ct-panel" id={panelId}>
          <section className="ct-sec" aria-label={tr('Chi phí theo bước')}>
            <h3 className="ct-sec-title">{tr('Chi phí theo bước')}{f.runId && <span className="ct-run mono">{f.runId}</span>}</h3>
            <ul className="ct-phases">
              {phases.map(p => (
                <li key={p} className="ct-phase">
                  <span className="ct-phase-name">{PHASE_LABEL[p]}</span>
                  <RankBar value={f.phases[p].vnd} max={maxPhase} />
                  <span className="ct-phase-num">{fmtVnd(f.phases[p].vnd)}</span>
                  <span className="ct-phase-sub">{fmtUsd(f.phases[p].usd)} · {fmtTokens(sumTokens(f.phases[p].tokens))}</span>
                  <span className="ct-steps">{Object.entries(f.phases[p].steps).map(([st, v]) => (
                    <span key={st} className="ct-step">{st}{v.efforts.length ? ` · ${v.efforts.map(e => EFFORT_LABEL[e] || e).join('/')}` : ''} <b>{fmtVnd(v.vnd)}</b></span>
                  ))}</span>
                </li>
              ))}
            </ul>
            <p className="ct-note">{tr('≈ {0} giờ công lập trình viên quy đổi.', [f.aiHours.toFixed(1)])}</p>
          </section>

          <section className="ct-sec" aria-label={tr('Giờ người làm ước tính')}>
            <h3 className="ct-sec-title">{tr('Nếu người làm')}{' '}<span className="ct-sec-aside">{fmtVnd(f.humanVnd)}</span></h3>
            <div className="ct-hours-grid">
              {HUMAN_PHASES.map(p => (
                <label key={p} className="ct-field">{PHASE_LABEL[p]}
                  <span className="ct-input-unit">
                    <input type="number" min="0" step="0.5" value={hours[p] ?? ''} placeholder={String(settings.hours[p] ?? 0)}
                      onChange={e => setHours(h => ({ ...h, [p]: e.target.value }))} />
                    <span>{tr('giờ')}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="ct-actions">
              <Button size="sm" icon={Save} onClick={save}>{tr('Lưu giờ ước tính')}</Button>
              {provInfo && (
                <Button size="sm" variant="ghost" icon={Cpu} onClick={() => setEditModels(v => !v)} aria-expanded={editModels}>
                  {editModels ? tr('Ẩn model của tính năng') : tr('Đổi model cho tính năng này')}
                </Button>
              )}
              {msg && <span className="ct-msg" role="status">{msg}</span>}
            </div>
          </section>

          {editModels && provInfo && fModels && (
            <section className="ct-sec" aria-label={tr('Model AI của tính năng')}>
              <h3 className="ct-sec-title">{tr('Model AI riêng cho tính năng này')}</h3>
              <StepModels info={provInfo} value={fModels} onChange={setFModels} />
              <div className="ct-actions">
                <Button size="sm" variant="primary" icon={Save} onClick={saveModels}>{tr('Lưu model tính năng')}</Button>
                {mMsg && <span className="ct-msg" role="status">{mMsg}</span>}
              </div>
            </section>
          )}
        </div>
      )}
    </li>
  );
}

/** A quota bar with its reading: "36,6% · $3,66 / $100". */
export const Quota = ({ pct, used, limit }) => {
  const tone = pctTone(pct || 0);
  return (
    <span className="ct-quota">
      <span className="ct-quota-read"><b className={`tone-${tone}`}>{pct ?? 0}%</b><span>{used} / {limit}</span></span>
      <Meter value={Math.min(100, pct || 0)} max={100} tone={tone} />
    </span>
  );
};

export function LaneItem({ laneObj, provInfo, onSaved }) {
  const [open, setOpen] = useState(false);
  const [laneDef, setLaneDef] = useState(null);
  const [msg, setMsg] = useState('');
  const n = laneObj.lane;
  const hasCustom = !!(provInfo && (provInfo.lane_defaults || {})[String(n)]);

  useEffect(() => {
    if (!provInfo) return;
    setLaneDef((provInfo.lane_defaults || {})[String(n)] || provInfo.defaults);
  }, [provInfo, n]);

  const saveAll = async () => {
    try {
      if (laneDef) await saveLaneModelDefaults(n, laneDef);
      setMsg(tr('Đã lưu model Lane {0}.', [n]));
      onSaved();
    } catch (e) {
      setMsg(tr('Lỗi: {0}', [e.message]));
    }
  };

  const resetLane = async () => {
    try {
      await saveLaneModelDefaults(n, { reset: true });
      setMsg(tr('Lane {0} đã dùng lại model mặc định chung.', [n]));
      onSaved();
    } catch (e) {
      setMsg(tr('Lỗi: {0}', [e.message]));
    }
  };

  const mainModel = ((provInfo?.lane_defaults || {})[String(n)] || provInfo?.defaults || {}).main || 'claude:claude-opus-5-5';
  const idle = !sumTokens(laneObj.tokens);
  const panelId = `ct-lane-${n}`;

  return (
    <li className={`ct-item${open ? ' open' : ''}${idle ? ' idle' : ''}`}>
      <button type="button" className="ct-row ct-row-lane" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
        <span className="ct-cell-main">
          <span className="ct-title">Lane {n}{laneObj.progress != null && <span className="ct-progress">{tr('tiến độ {0}%', [laneObj.progress])}</span>}</span>
          <span className="ct-meta">
            {laneObj.feature_title ? <span className="ct-ellipsis">{laneObj.feature_title}</span> : <span>{tr('Chưa có việc trong tháng')}</span>}
          </span>
          <span className="ct-meta">
            <span className="mono">{mainModel.replace(/^claude:/, '')}</span>
            <span>{hasCustom ? tr('model riêng') : tr('mặc định chung')}</span>
          </span>
        </span>
        <span className="ct-cell-num">
          <span className="ct-num-strong">{fmtVnd(laneObj.vnd)}</span>
          <span className="ct-num-sub">{tr('{0} token · {1}% tháng', [fmtTokens(sumTokens(laneObj.tokens)), laneObj.sharePct ?? 0])}</span>
        </span>
        <span className="ct-cell-quota">
          <Quota pct={laneObj.quotaPct} used={fmtUsd(laneObj.usd)} limit={fmtUsd(laneObj.limitUsd ?? 100)} />
        </span>
        <ChevronDown size={16} className="ct-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="ct-panel" id={panelId}>
          {provInfo && laneDef && (
            <section className="ct-sec" aria-label={`Model AI Lane ${n}`}>
              <h3 className="ct-sec-title">{tr('Model AI cho từng bước')}</h3>
              <StepModels info={provInfo} value={laneDef} onChange={setLaneDef} />
            </section>
          )}
          <div className="ct-actions">
            <Button size="sm" variant="primary" icon={Save} onClick={saveAll}>{tr('Lưu Lane {0}', [n])}</Button>
            {hasCustom && (
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetLane}>{tr('Dùng lại mặc định chung')}</Button>
            )}
            {msg && <span className="ct-msg" role="status">{msg}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

export function CostSettingsForm({ settings, onSaved }) {
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState({ err: '', ok: '' });
  useEffect(() => setS(settings), [settings]);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const save = async e => {
    e.preventDefault();
    try { await saveCostSettings(s); setMsg({ err: '', ok: tr('Đã lưu cài đặt.') }); onSaved(); } catch (e2) { setMsg({ err: e2.message, ok: '' }); }
  };
  const field = (label, value, onChange, unit, hint) => (
    <label className="ct-field">{label}
      <span className="ct-input-unit"><input type="number" min="0" value={value ?? ''} onChange={e => onChange(e.target.value)} />{unit && <span>{unit}</span>}</span>
      {hint && <span className="ct-hint">{hint}</span>}
    </label>
  );
  const group = (title, desc, children) => (
    <section className="ct-set">
      <div className="ct-set-head"><h3>{title}</h3><p>{desc}</p></div>
      <div className="ct-set-fields">{children}</div>
    </section>
  );
  return (
    <form className="ct-settings" onSubmit={save}>
      {group(tr('Gói Claude & tỷ giá'), tr('Phí gói được chia cho từng tính năng theo tỷ lệ token. Để 0 thì tính theo giá API niêm yết.'), <>
        {field(tr('Phí gói mỗi tháng'), s.planFeeVnd, v => setS({ ...s, planFeeVnd: v }), 'VND')}
        {field(tr('Tỷ giá USD → VND'), s.usdToVnd, v => setS({ ...s, usdToVnd: v }), 'VND')}
      </>)}
      {group(tr('Lương mỗi giờ'), tr('Giá một giờ của từng vai trò, để so chi phí AI với chi phí người làm.'), <>
        {Object.keys(s.rates).map(r => <React.Fragment key={r}>{field(ROLE_LABEL[r] || r, s.rates[r], v => setS({ ...s, rates: { ...s.rates, [r]: v } }), 'VND')}</React.Fragment>)}
      </>)}
      {group(tr('Giờ người làm cho 1 tính năng'), tr('Mặc định cho mọi tính năng; sửa riêng từng tính năng ở tab Tính năng.'), <>
        {HUMAN_PHASES.map(p => <React.Fragment key={p}>{field(PHASE_LABEL[p], s.hours[p], v => setS({ ...s, hours: { ...s.hours, [p]: v } }), tr('giờ'))}</React.Fragment>)}
      </>)}
      <div className="ct-save-bar">
        <Button type="submit" variant="primary" icon={Save} disabled={!dirty}>{tr('Lưu cài đặt')}</Button>
        {msg.err && <span className="m-err" role="alert">{msg.err}</span>}
        {!msg.err && (dirty ? <span className="ct-msg">{tr('Có thay đổi chưa lưu')}</span> : msg.ok && <span className="ct-msg" role="status">{msg.ok}</span>)}
        <span className="ct-hint ct-save-note">{tr('Số mặc định chỉ là ví dụ: hãy sửa theo lương và gói thật của bạn.')}</span>
      </div>
    </form>
  );
}
