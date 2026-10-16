import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Save, Cpu, Gauge, RotateCcw } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import StepModels from './StepModels.jsx';
import {
  fetchCosts, saveCostSettings, saveFeatureHours,
  fetchProviders, saveLaneModelDefaults, saveFeatureModels, saveLaneLimit
} from '../lib/api.js';
import { PHASE_LABEL, PHASE_ORDER, ROLE_LABEL, EFFORT_LABEL, fmtVnd, fmtTokens, fmtUsd, sumTokens, ratioTone } from '../lib/costs.js';
import '../styles/costs.css';

const HUMAN_PHASES = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];
const PLAN_LABEL = { five_hour: 'Hạn mức 5 giờ', seven_day: 'Hạn mức 7 ngày', seven_day_opus: '7 ngày (Opus)', seven_day_sonnet: '7 ngày (Sonnet)' };
const fmtTime = iso => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
const pctTone = p => (p >= 90 ? 'danger' : p >= 70 ? 'warn' : 'ok');

function Tile({ label, value, sub, tone, pct }) {
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

/** Single-series column chart (VND per day) with a hover/focus tooltip. */
function DayBars({ days }) {
  const [tip, setTip] = useState(null);
  if (!days.length) return <p className="muted-empty">Chưa có dữ liệu trong tháng này.</p>;
  const max = Math.max(...days.map(d => d.vnd), 1);
  return (
    <figure className="ct-chart" aria-label="Chi phí theo ngày">
      <figcaption className="ct-chart-title">Chi phí phân bổ theo ngày <span className="faint">· cao nhất {fmtVnd(max)}</span></figcaption>
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
            <b>{tip.day}</b><span>{fmtVnd(tip.vnd)}</span><span>{fmtUsd(tip.usd)} quy đổi API</span><span>{fmtTokens(sumTokens(tip.tokens))} token</span>
          </div>
        )}
      </div>
      <div className="ct-axis"><span>{days[0].day.slice(5)}</span><span>{days[days.length - 1].day.slice(5)}</span></div>
    </figure>
  );
}

const Meter = ({ value, max, tone }) => (
  <span className="ct-meter" aria-hidden="true">
    <span style={{
      width: `${max ? Math.min(100, Math.max(1, (value / max) * 100)) : 0}%`,
      background: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)'
    }} />
  </span>
);

function FeatureRow({ f, settings, provInfo, onSaved }) {
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
    try { await saveFeatureHours(f.key, hours); setMsg('Đã lưu'); onSaved(); } catch (e) { setMsg(e.message); }
  };
  const saveModels = async () => {
    try {
      const { impl_agents, effort, ...stepModels } = fModels;
      await saveFeatureModels({ key: f.key, models: stepModels, effort, impl_agents, lane: f.lane });
      setMMsg('Đã lưu cấu hình model cho tính năng này.');
      onSaved();
    } catch (e) {
      setMMsg(`Lỗi: ${e.message}`);
    }
  };
  const phases = PHASE_ORDER.filter(p => f.phases[p]);
  const maxPhase = Math.max(...phases.map(p => f.phases[p].vnd), 1);
  const hasCustomFeatModel = !!(provInfo && (provInfo.feature_models || {})[f.key]);

  return (
    <>
      <tr className="ct-feat">
        <td>
          <button className="linklike ct-expand" aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />} {f.title || f.key}
          </button>
          <div className="faint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span>Lane {f.lane}{f.runId ? ` · ${f.runId}` : ''}</span>
            {f.sharePct != null && <Badge tone="neutral">{f.sharePct}% tháng</Badge>}
            {hasCustomFeatModel && <Badge tone="accent">Model riêng</Badge>}
          </div>
        </td>
        <td className="num">{fmtTokens(sumTokens(f.tokens))}</td>
        <td className="num">{fmtUsd(f.usd)}</td>
        <td className="num"><b>{fmtVnd(f.vnd)}</b><div className="faint">≈ {f.aiHours.toFixed(1)} giờ công dev</div></td>
        <td className="num">{fmtVnd(f.humanVnd)}</td>
        <td><Badge tone={tone}>{f.ratio == null ? '—' : `${Math.round(f.ratio * 100)}%`}</Badge></td>
      </tr>
      {open && (
        <tr className="ct-detail"><td colSpan={6}>
          <table className="grid ct-sub">
            <thead><tr><th>Bước</th><th>Bước con · effort</th><th className="num">Token</th><th className="num">Quy đổi API</th><th className="num">Chi phí AI</th><th /></tr></thead>
            <tbody>
              {phases.map(p => (
                <tr key={p}>
                  <td>{PHASE_LABEL[p]}</td>
                  <td className="ct-steps">{Object.entries(f.phases[p].steps).map(([s, v]) => (
                    <span key={s}>{s}{v.efforts.length ? ` · ${v.efforts.map(e => EFFORT_LABEL[e] || e).join('/')}` : ''}: {fmtVnd(v.vnd)}</span>
                  ))}</td>
                  <td className="num">{fmtTokens(sumTokens(f.phases[p].tokens))}</td>
                  <td className="num">{fmtUsd(f.phases[p].usd)}</td>
                  <td className="num">{fmtVnd(f.phases[p].vnd)}</td>
                  <td className="ct-meter-cell"><Meter value={f.phases[p].vnd} max={maxPhase} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ct-hours">
            <strong>Giờ người làm ước tính cho tính năng này</strong>
            <div className="ct-hours-grid">
              {HUMAN_PHASES.map(p => (
                <label key={p}>{PHASE_LABEL[p]}
                  <input type="number" min="0" step="0.5" value={hours[p] ?? ''} placeholder={String(settings.hours[p] ?? 0)}
                    onChange={e => setHours(h => ({ ...h, [p]: e.target.value }))} />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="sm" icon={Save} onClick={save}>Lưu giờ ước tính</Button>
              {provInfo && (
                <Button size="sm" variant="secondary" icon={Cpu} onClick={() => setEditModels(v => !v)}>
                  {editModels ? 'Ẩn cấu hình model tính năng' : 'Cấu hình Model cho tính năng này'}
                </Button>
              )}
              {msg && <span className="faint"> {msg}</span>}
            </div>
          </div>
          {editModels && provInfo && fModels && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--panel)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                Model AI riêng cho tính năng: {f.title || f.key} (Lane {f.lane})
              </div>
              <StepModels info={provInfo} value={fModels} onChange={setFModels} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <Button size="sm" variant="primary" icon={Save} onClick={saveModels}>Lưu model tính năng</Button>
                {mMsg && <span className="faint">{mMsg}</span>}
              </div>
            </div>
          )}
        </td></tr>
      )}
    </>
  );
}

function LaneConfigRow({ laneObj, provInfo, onSaved }) {
  const [open, setOpen] = useState(false);
  const [laneDef, setLaneDef] = useState(null);
  const [lim, setLim] = useState({ usd: laneObj.limitUsd ?? 100, tokens: laneObj.limitTokens ?? 10000000 });
  const [msg, setMsg] = useState('');
  const n = laneObj.lane;
  const hasCustom = !!(provInfo && (provInfo.lane_defaults || {})[String(n)]);

  useEffect(() => {
    if (!provInfo) return;
    setLaneDef((provInfo.lane_defaults || {})[String(n)] || provInfo.defaults);
  }, [provInfo, n]);

  useEffect(() => {
    setLim({ usd: laneObj.limitUsd ?? 100, tokens: laneObj.limitTokens ?? 10000000 });
  }, [laneObj.limitUsd, laneObj.limitTokens]);

  const saveAll = async () => {
    try {
      await saveLaneLimit(n, { usd: Number(lim.usd), tokens: Number(lim.tokens) });
      if (laneDef) await saveLaneModelDefaults(n, laneDef);
      setMsg(`Đã lưu cấu hình & hạn mức cho Lane ${n}`);
      onSaved();
    } catch (e) {
      setMsg(`Lỗi: ${e.message}`);
    }
  };

  const resetLane = async () => {
    try {
      await saveLaneModelDefaults(n, { reset: true });
      setMsg(`Đã đặt lại model Lane ${n} về mặc định chung`);
      onSaved();
    } catch (e) {
      setMsg(`Lỗi: ${e.message}`);
    }
  };

  const mainModel = ((provInfo?.lane_defaults || {})[String(n)] || provInfo?.defaults || {}).main || 'claude:claude-opus-5-5';
  const qTone = pctTone(laneObj.quotaPct || 0);

  return (
    <>
      <tr>
        <td>
          <strong>Lane {n}</strong>
          <div className="faint" style={{ marginTop: 2 }}>
            <Badge tone={hasCustom ? 'accent' : 'neutral'}>
              {hasCustom ? 'Model riêng' : 'Mặc định chung'}
            </Badge>
            {' '}<span className="mono" style={{ fontSize: 11.5 }}>{mainModel.replace(/^claude:/, '')}</span>
          </div>
        </td>
        <td className="num">{fmtTokens(sumTokens(laneObj.tokens))}</td>
        <td className="num">{fmtUsd(laneObj.usd)}</td>
        <td className="num">{fmtVnd(laneObj.vnd)}</td>
        <td><Badge tone="neutral">{laneObj.sharePct ?? 0}%</Badge></td>
        <td style={{ minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
            <Badge tone={qTone}>{laneObj.quotaPct ?? 0}% hạn mức</Badge>
            <span className="faint" style={{ fontSize: 11 }}>{fmtUsd(laneObj.usd)} / {fmtUsd(laneObj.limitUsd ?? 100)}</span>
          </div>
          <Meter value={laneObj.quotaPct || 0} max={100} tone={qTone} />
        </td>
        <td style={{ textAlign: 'right' }}>
          <Button size="sm" variant="secondary" icon={Cpu} onClick={() => setOpen(o => !o)}>
            {open ? 'Đóng' : 'Chỉnh Model & Hạn mức'}
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="ct-detail">
          <td colSpan={7}>
            <div style={{ display: 'grid', gap: 12, padding: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <label className="ct-field">
                  Hạn mức ngân sách Lane {n} (USD)
                  <input type="number" min="0" value={lim.usd} onChange={e => setLim({ ...lim, usd: e.target.value })} />
                </label>
                <label className="ct-field">
                  Hạn mức Token tháng Lane {n}
                  <input type="number" min="0" step="100000" value={lim.tokens} onChange={e => setLim({ ...lim, tokens: e.target.value })} />
                </label>
              </div>
              {provInfo && laneDef && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                    Cấu hình Model AI riêng cho từng bước trên Lane {n}
                  </div>
                  <StepModels info={provInfo} value={laneDef} onChange={setLaneDef} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button size="sm" variant="primary" icon={Save} onClick={saveAll}>Lưu cấu hình & hạn mức Lane {n}</Button>
                {hasCustom && (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetLane}>Đặt lại theo mặc định chung</Button>
                )}
                {msg && <span className="faint">{msg}</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Settings({ settings, onSaved }) {
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState({ err: '', ok: '' });
  useEffect(() => setS(settings), [settings]);
  const save = async e => {
    e.preventDefault();
    try { await saveCostSettings(s); setMsg({ err: '', ok: 'Đã lưu cài đặt.' }); onSaved(); } catch (e2) { setMsg({ err: e2.message, ok: '' }); }
  };
  const field = (label, value, onChange, hint) => (
    <label className="ct-field">{label}<input type="number" min="0" value={value ?? ''} onChange={e => onChange(e.target.value)} />{hint && <span className="faint">{hint}</span>}</label>
  );
  return (
    <form className="ct-settings" onSubmit={save}>
      <fieldset><legend>Gói Claude & Tỷ giá</legend>
        {field('Phí gói mỗi tháng (VND)', s.planFeeVnd, v => setS({ ...s, planFeeVnd: v }), 'Chia cho từng tính năng theo tỷ lệ token. Để 0 = tính theo giá API.')}
        {field('Tỷ giá USD → VND', s.usdToVnd, v => setS({ ...s, usdToVnd: v }))}
      </fieldset>
      <fieldset><legend>Hạn mức sử dụng (để hiển thị % đã dùng ngay trên màn Chi phí)</legend>
        {field('Hạn mức ngân sách tháng (USD)', s.monthlyBudgetUsd ?? 100, v => setS({ ...s, monthlyBudgetUsd: v }), 'Dùng để tính % ngân sách tháng & % hạn mức từng model')}
        {field('Hạn mức Token mỗi tháng', s.monthlyTokenLimit ?? 10000000, v => setS({ ...s, monthlyTokenLimit: v }), 'Dùng để tính % token đã dùng')}
        {field('Hạn mức cửa sổ 5 giờ (USD)', s.fiveHourUsdLimit ?? 15, v => setS({ ...s, fiveHourUsdLimit: v }), 'Ước tính % hạn mức 5 giờ')}
        {field('Hạn mức cửa sổ 7 ngày (USD)', s.sevenDayUsdLimit ?? 60, v => setS({ ...s, sevenDayUsdLimit: v }), 'Ước tính % hạn mức 7 ngày')}
      </fieldset>
      <fieldset><legend>Lương mỗi giờ (VND)</legend>
        {Object.keys(s.rates).map(r => <React.Fragment key={r}>{field(ROLE_LABEL[r] || r, s.rates[r], v => setS({ ...s, rates: { ...s.rates, [r]: v } }))}</React.Fragment>)}
      </fieldset>
      <fieldset><legend>Giờ người làm mặc định cho 1 tính năng</legend>
        {HUMAN_PHASES.map(p => <React.Fragment key={p}>{field(PHASE_LABEL[p], s.hours[p], v => setS({ ...s, hours: { ...s.hours, [p]: v } }))}</React.Fragment>)}
      </fieldset>
      {msg.err && <p className="m-err" role="alert">{msg.err}</p>}
      {msg.ok && <p className="rv-sub" role="status">{msg.ok}</p>}
      <Button type="submit" variant="primary" icon={Save}>Lưu cài đặt</Button>
      <p className="rv-sub">Các con số mặc định chỉ là ví dụ — hãy sửa theo lương và hạn mức gói thật của bạn.</p>
    </form>
  );
}

export default function CostsView() {
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [provInfo, setProvInfo] = useState(null);
  const [modelLimitsEdit, setModelLimitsEdit] = useState({});
  const [modelMsg, setModelMsg] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview');

  const load = useCallback(() => {
    fetchCosts(month).then(d => {
      if (d.ok === false) throw new Error(d.error);
      setData(d);
      setModelLimitsEdit(d.settings?.modelLimits || {});
      setErr('');
    }).catch(e => setErr(e.message));
    fetchProviders().then(setProvInfo).catch(() => {});
  }, [month]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <section className="rv-page"><h1 className="rv-h1">Chi phí</h1>{err ? <p className="m-err">{err}</p> : <p className="muted-empty">Đang tải…</p>}</section>;

  const t = data.totals;
  const qMonth = data.quotas?.month || { quotaPct: 0, usdPct: 0, tokenPct: 0, limitUsd: 100, limitTokens: 10000000 };
  const pct5h = data.plan?.five_hour?.utilization != null ? Math.round(data.plan.five_hour.utilization) : Math.round(data.quotas?.five_hour?.pct || 0);
  const pct7d = data.plan?.seven_day?.utilization != null ? Math.round(data.plan.seven_day.utilization) : Math.round(data.quotas?.seven_day?.pct || 0);
  const extraPlan = Object.entries(data.plan || {}).filter(([k, v]) => k !== 'five_hour' && k !== 'seven_day' && v.utilization != null);
  const over = data.features.filter(f => f.ratio != null && f.ratio >= 1).length;
  const months = data.months.includes(data.month) ? data.months : [data.month, ...data.months];

  // Combine lanes that have usage with lanes 1..3 or configured lanes so user can configure any lane
  const laneNums = [...new Set([
    ...data.byLane.map(l => l.lane),
    ...Object.keys(data.lane_defaults || {}).map(Number),
    1, 2, 3,
  ])].filter(n => n > 0).sort((a, b) => a - b);

  const allLaneRows = laneNums.map(n => data.byLane.find(l => l.lane === n) || {
    lane: n,
    usd: 0,
    vnd: 0,
    tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    sharePct: 0,
    quotaPct: 0,
    limitUsd: data.settings?.laneLimits?.[String(n)]?.usd ?? (data.settings?.monthlyBudgetUsd || 100),
    limitTokens: data.settings?.laneLimits?.[String(n)]?.tokens ?? (data.settings?.monthlyTokenLimit || 10000000),
  });

  const saveModelQuotas = async () => {
    try {
      await saveCostSettings({ modelLimits: modelLimitsEdit });
      setModelMsg('Đã lưu hạn mức cho các model.');
      load();
    } catch (e) {
      setModelMsg(`Lỗi: ${e.message}`);
    }
  };

  return (
    <section className="rv-page ct-page" aria-labelledby="ct-title">
      <div className="ct-head">
        <h1 id="ct-title" className="rv-h1">Chi phí & % Hạn mức sử dụng</h1>
        <select className="msel" aria-label="Tháng" value={data.month} onChange={e => setMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {err && <p className="m-err">{err}</p>}

      {/* Top KPI Tiles with Immediate % Usage Bars */}
      <div className="ct-tiles">
        <Tile
          label="Chi phí AI tháng này"
          value={fmtVnd(t.vnd)}
          pct={qMonth.usdPct}
          tone={pctTone(qMonth.usdPct)}
          sub={data.settings.planFeeVnd > 0 ? `phân bổ từ phí gói · ${qMonth.usdPct}% hạn mức` : `đã dùng ${qMonth.usdPct}% hạn mức tháng (${fmtUsd(qMonth.limitUsd)})`}
        />
        <Tile
          label="Giá trị quy đổi API"
          value={`${fmtUsd(t.usd)} (${qMonth.usdPct}%)`}
          pct={qMonth.usdPct}
          tone={pctTone(qMonth.usdPct)}
          sub={`hạn mức ${fmtUsd(qMonth.limitUsd)} / tháng`}
        />
        <Tile
          label="Token đã dùng"
          value={`${fmtTokens(sumTokens(t.tokens))} (${qMonth.tokenPct}%)`}
          pct={qMonth.tokenPct}
          tone={pctTone(qMonth.tokenPct)}
          sub={`vào ${fmtTokens(t.tokens.in)} · ra ${fmtTokens(t.tokens.out)} · cache ${fmtTokens(t.tokens.cacheRead + t.tokens.cacheWrite)}`}
        />
        <Tile
          label="Hạn mức 5 giờ"
          value={`${pct5h}%`}
          pct={pct5h}
          tone={pctTone(pct5h)}
          sub={data.plan?.five_hour?.resetsAt ? `làm mới ${fmtTime(data.plan.five_hour.resetsAt)}` : `${fmtUsd(data.quotas?.five_hour?.usd || 0)} / ${fmtUsd(data.quotas?.five_hour?.limitUsd || 15)} trong 5h qua`}
        />
        <Tile
          label="Hạn mức 7 ngày"
          value={`${pct7d}%`}
          pct={pct7d}
          tone={pctTone(pct7d)}
          sub={data.plan?.seven_day?.resetsAt ? `làm mới ${fmtTime(data.plan.seven_day.resetsAt)}` : `${fmtUsd(data.quotas?.seven_day?.usd || 0)} / ${fmtUsd(data.quotas?.seven_day?.limitUsd || 60)} trong 7 ngày qua`}
        />
        <Tile
          label="Tính năng AI tốn hơn người"
          value={String(over)}
          tone={over ? 'danger' : 'ok'}
          sub={`trên ${data.features.length} tính năng`}
        />
        {extraPlan.map(([k, v]) => (
          <Tile
            key={k}
            label={PLAN_LABEL[k] || k}
            value={`${Math.round(v.utilization)}%`}
            pct={v.utilization}
            tone={pctTone(v.utilization)}
            sub={v.resetsAt ? `làm mới ${fmtTime(v.resetsAt)}` : ''}
          />
        ))}
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'overview', label: 'Tổng quan & % Hạn mức' },
        { id: 'features', label: 'Tính năng' },
        { id: 'lanes', label: 'Lane & Model riêng' },
        { id: 'models', label: 'Model & % Quota' },
        { id: 'settings', label: 'Cài đặt' },
      ]} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Direct % Usage Breakdown per Model & per Lane so user doesn't have to visit provider dashboards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              <div className="card-panel">
                <div className="card-header">
                  <div className="card-header-title">
                    <Gauge size={16} style={{ color: 'var(--accent)' }} />
                    <span>% Hạn mức đã dùng theo từng Model</span>
                  </div>
                </div>
                <div className="card-body" style={{ display: 'grid', gap: 10 }}>
                  {data.byModel.length === 0 ? (
                    <p className="muted-empty" style={{ margin: 0 }}>Chưa có model nào phát sinh token trong tháng này.</p>
                  ) : (
                    data.byModel.map(m => {
                      const mTone = pctTone(m.quotaPct || 0);
                      return (
                        <div key={m.model} style={{ display: 'grid', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span className="mono" style={{ fontWeight: 600 }}>{m.model}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Badge tone="neutral">Tỷ trọng {m.sharePct}%</Badge>
                              <Badge tone={mTone}>Đã dùng {m.quotaPct}% hạn mức</Badge>
                            </div>
                          </div>
                          <Meter value={m.quotaPct || 0} max={100} tone={mTone} />
                          <div className="faint" style={{ fontSize: 11.5, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{fmtUsd(m.usd)} / {fmtUsd(m.limitUsd)} ({m.usdPct}%)</span>
                            <span>{fmtTokens(sumTokens(m.tokens))} / {fmtTokens(m.limitTokens)} token ({m.tokenPct}%)</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="card-panel">
                <div className="card-header">
                  <div className="card-header-title">
                    <Cpu size={16} style={{ color: 'var(--accent)' }} />
                    <span>% Hạn mức & Chi phí theo từng Lane</span>
                  </div>
                </div>
                <div className="card-body" style={{ display: 'grid', gap: 10 }}>
                  {allLaneRows.map(l => {
                    const lTone = pctTone(l.quotaPct || 0);
                    const hasCustom = !!(data.lane_defaults && data.lane_defaults[String(l.lane)]);
                    return (
                      <div key={l.lane} style={{ display: 'grid', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span style={{ fontWeight: 600 }}>
                            Lane {l.lane}{' '}
                            <Badge tone={hasCustom ? 'accent' : 'neutral'}>
                              {hasCustom ? 'Model riêng' : 'Mặc định'}
                            </Badge>
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Badge tone="neutral">Tỷ trọng {l.sharePct}%</Badge>
                            <Badge tone={lTone}>Đã dùng {l.quotaPct}% hạn mức</Badge>
                          </div>
                        </div>
                        <Meter value={l.quotaPct || 0} max={100} tone={lTone} />
                        <div className="faint" style={{ fontSize: 11.5, display: 'flex', justifyContent: 'space-between' }}>
                          <span>{fmtVnd(l.vnd)} ({fmtUsd(l.usd)} / {fmtUsd(l.limitUsd)})</span>
                          <span>{fmtTokens(sumTokens(l.tokens))} token</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <DayBars days={data.byDay} />
            <p className="rv-sub">Số liệu là ước tính theo bảng giá niêm yết của Claude (không phải hoá đơn), chỉ tính từ khi bật theo dõi.
              Với gói thuê bao, chi phí thật là phí gói chia theo tỷ lệ token mỗi tính năng dùng.</p>
          </div>
        )}

        {tab === 'features' && (data.features.length ? (
          <div className="us-scroll"><table className="grid ct-table">
            <thead><tr><th>Tính năng</th><th className="num">Token</th><th className="num">Quy đổi API</th><th className="num">Chi phí AI</th><th className="num">Người làm (ước tính)</th><th>AI / Người</th></tr></thead>
            <tbody>{data.features.map(f => <FeatureRow key={f.key} f={f} settings={data.settings} provInfo={provInfo} onSaved={load} />)}</tbody>
          </table></div>
        ) : <p className="muted-empty">Chưa có tính năng nào trong tháng này.</p>)}

        {tab === 'lanes' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <p className="rv-sub" style={{ margin: 0 }}>
              Theo dõi token, chi phí, % hạn mức của từng Lane và chỉnh bộ <b>Model AI riêng cho từng Lane</b> ngay bên dưới:
            </p>
            <div className="us-scroll">
              <table className="grid ct-table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th className="num">Token</th>
                    <th className="num">Quy đổi API</th>
                    <th className="num">Chi phí AI</th>
                    <th>% Tỷ trọng</th>
                    <th>% Hạn mức Lane</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {allLaneRows.map(l => (
                    <LaneConfigRow key={l.lane} laneObj={l} provInfo={provInfo} onSaved={load} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'models' && (<>
          <div className="us-scroll"><table className="grid ct-table">
            <thead>
              <tr>
                <th>Model</th>
                <th className="num">Vào</th>
                <th className="num">Ra</th>
                <th className="num">Đọc cache</th>
                <th className="num">Ghi cache</th>
                <th className="num">Quy đổi API</th>
                <th>% Tỷ trọng</th>
                <th>% Hạn mức đã dùng</th>
                <th>Hạn mức Model ($ / Token)</th>
              </tr>
            </thead>
            <tbody>{data.byModel.map(m => {
              const mTone = pctTone(m.quotaPct || 0);
              const curLim = modelLimitsEdit[m.model] || {};
              return (
                <tr key={m.model}>
                  <td className="mono">{m.model}</td>
                  <td className="num">{fmtTokens(m.tokens.in)}</td>
                  <td className="num">{fmtTokens(m.tokens.out)}</td>
                  <td className="num">{fmtTokens(m.tokens.cacheRead)}</td>
                  <td className="num">{fmtTokens(m.tokens.cacheWrite)}</td>
                  <td className="num">{fmtUsd(m.usd)}</td>
                  <td><Badge tone="neutral">{m.sharePct ?? 0}%</Badge></td>
                  <td style={{ minWidth: 170 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                      <Badge tone={mTone}>{m.quotaPct ?? 0}%</Badge>
                      <span className="faint" style={{ fontSize: 11 }}>{m.usdPct ?? 0}% $ · {m.tokenPct ?? 0}% tok</span>
                    </div>
                    <Meter value={m.quotaPct || 0} max={100} tone={mTone} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        placeholder={`$${m.limitUsd}`}
                        aria-label={`Hạn mức USD cho ${m.model}`}
                        value={curLim.usd ?? ''}
                        onChange={e => setModelLimitsEdit(prev => ({ ...prev, [m.model]: { ...(prev[m.model] || {}), usd: e.target.value } }))}
                        style={{ width: 76, padding: '4px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                      />
                      <input
                        type="number"
                        min="0"
                        step="100000"
                        placeholder={`${fmtTokens(m.limitTokens)} tok`}
                        aria-label={`Hạn mức token cho ${m.model}`}
                        value={curLim.tokens ?? ''}
                        onChange={e => setModelLimitsEdit(prev => ({ ...prev, [m.model]: { ...(prev[m.model] || {}), tokens: e.target.value } }))}
                        style={{ width: 96, padding: '4px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {data.byModel.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Button size="sm" variant="primary" icon={Save} onClick={saveModelQuotas}>Lưu hạn mức các Model</Button>
              {modelMsg && <span className="faint">{modelMsg}</span>}
            </div>
          )}
          <p className="rv-sub">Gợi ý tối ưu: bước nào tốn nhiều mà việc đơn giản (ticket, phản biện plan, QC) có thể chuyển sang Sonnet/Haiku hoặc hạ effort ở từng <b>Lane</b> hoặc <b>Nhà cung cấp</b>.</p>
        </>)}

        {tab === 'settings' && <Settings settings={data.settings} onSaved={load} />}
      </div>
    </section>
  );
}
