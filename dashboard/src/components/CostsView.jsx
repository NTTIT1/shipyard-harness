import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Save } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import { fetchCosts, saveCostSettings, saveFeatureHours } from '../lib/api.js';
import { PHASE_LABEL, PHASE_ORDER, ROLE_LABEL, EFFORT_LABEL, fmtVnd, fmtTokens, fmtUsd, sumTokens, ratioTone } from '../lib/costs.js';
import '../styles/costs.css';

const HUMAN_PHASES = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];
const PLAN_LABEL = { five_hour: 'Hạn mức 5 giờ', seven_day: 'Hạn mức 7 ngày', seven_day_opus: '7 ngày (Opus)', seven_day_sonnet: '7 ngày (Sonnet)' };
const fmtTime = iso => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');

function Tile({ label, value, sub, tone }) {
  return (
    <div className="ct-tile">
      <span className="ct-tile-label">{label}</span>
      <span className={`ct-tile-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
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

const Meter = ({ value, max }) => (
  <span className="ct-meter" aria-hidden="true"><span style={{ width: `${max ? Math.max(1, (value / max) * 100) : 0}%` }} /></span>
);

function FeatureRow({ f, settings, onSaved }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(f.hours);
  const [msg, setMsg] = useState('');
  useEffect(() => setHours(f.hours), [f.hours]);
  const tone = ratioTone(f.ratio);
  const save = async () => {
    try { await saveFeatureHours(f.key, hours); setMsg('Đã lưu'); onSaved(); } catch (e) { setMsg(e.message); }
  };
  const phases = PHASE_ORDER.filter(p => f.phases[p]);
  const maxPhase = Math.max(...phases.map(p => f.phases[p].vnd), 1);
  return (
    <>
      <tr className="ct-feat">
        <td>
          <button className="linklike ct-expand" aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />} {f.title || f.key}
          </button>
          <div className="faint">Lane {f.lane}{f.runId ? ` · ${f.runId}` : ''}</div>
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
            <Button size="sm" icon={Save} onClick={save}>Lưu giờ ước tính</Button>{msg && <span className="faint"> {msg}</span>}
          </div>
        </td></tr>
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
    <label className="ct-field">{label}<input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} />{hint && <span className="faint">{hint}</span>}</label>
  );
  return (
    <form className="ct-settings" onSubmit={save}>
      <fieldset><legend>Gói Claude</legend>
        {field('Phí gói mỗi tháng (VND)', s.planFeeVnd, v => setS({ ...s, planFeeVnd: v }), 'Chia cho từng tính năng theo tỷ lệ token. Để 0 = tính theo giá API.')}
        {field('Tỷ giá USD → VND', s.usdToVnd, v => setS({ ...s, usdToVnd: v }))}
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
      <p className="rv-sub">Các con số mặc định chỉ là ví dụ — hãy sửa theo lương thật của công ty.</p>
    </form>
  );
}

export default function CostsView() {
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview');
  const load = useCallback(() => {
    fetchCosts(month).then(d => { if (d.ok === false) throw new Error(d.error); setData(d); setErr(''); }).catch(e => setErr(e.message));
  }, [month]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <section className="rv-page"><h1 className="rv-h1">Chi phí</h1>{err ? <p className="m-err">{err}</p> : <p className="muted-empty">Đang tải…</p>}</section>;
  const t = data.totals;
  const plan = Object.entries(data.plan || {}).filter(([, v]) => v.utilization != null);
  const over = data.features.filter(f => f.ratio != null && f.ratio >= 1).length;
  const maxLane = Math.max(...data.byLane.map(l => l.vnd), 1);
  const maxModel = Math.max(...data.byModel.map(m => m.usd), 0.0001);
  const months = data.months.includes(data.month) ? data.months : [data.month, ...data.months];
  return (
    <section className="rv-page ct-page" aria-labelledby="ct-title">
      <div className="ct-head">
        <h1 id="ct-title" className="rv-h1">Chi phí</h1>
        <select className="msel" aria-label="Tháng" value={data.month} onChange={e => setMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {err && <p className="m-err">{err}</p>}
      <div className="ct-tiles">
        <Tile label="Chi phí AI tháng này" value={fmtVnd(t.vnd)} sub={data.settings.planFeeVnd > 0 ? 'phân bổ từ phí gói' : 'theo giá API × tỷ giá'} />
        <Tile label="Giá trị quy đổi API" value={fmtUsd(t.usd)} sub="nếu trả theo token" />
        <Tile label="Token" value={fmtTokens(sumTokens(t.tokens))} sub={`vào ${fmtTokens(t.tokens.in)} · ra ${fmtTokens(t.tokens.out)} · cache ${fmtTokens(t.tokens.cacheRead + t.tokens.cacheWrite)}`} />
        <Tile label="Tính năng AI tốn hơn người" value={String(over)} tone={over ? 'danger' : 'ok'} sub={`trên ${data.features.length} tính năng`} />
        {plan.map(([k, v]) => (
          <Tile key={k} label={PLAN_LABEL[k] || k} value={`${Math.round(v.utilization)}%`} tone={v.utilization >= 90 ? 'danger' : v.utilization >= 70 ? 'warn' : undefined}
            sub={v.resetsAt ? `làm mới ${fmtTime(v.resetsAt)}` : ''} />
        ))}
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'overview', label: 'Tổng quan' }, { id: 'features', label: 'Tính năng' },
        { id: 'lanes', label: 'Lane' }, { id: 'models', label: 'Model' }, { id: 'settings', label: 'Cài đặt' }]} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (<>
          <DayBars days={data.byDay} />
          <p className="rv-sub">Số liệu là ước tính theo bảng giá niêm yết của Claude (không phải hoá đơn), chỉ tính từ khi bật theo dõi.
            Với gói thuê bao, chi phí thật là phí gói chia theo tỷ lệ token mỗi tính năng dùng.</p>
        </>)}
        {tab === 'features' && (data.features.length ? (
          <div className="us-scroll"><table className="grid ct-table">
            <thead><tr><th>Tính năng</th><th className="num">Token</th><th className="num">Quy đổi API</th><th className="num">Chi phí AI</th><th className="num">Người làm (ước tính)</th><th>AI / Người</th></tr></thead>
            <tbody>{data.features.map(f => <FeatureRow key={f.key} f={f} settings={data.settings} onSaved={load} />)}</tbody>
          </table></div>
        ) : <p className="muted-empty">Chưa có tính năng nào trong tháng này.</p>)}
        {tab === 'lanes' && (
          <table className="grid ct-table">
            <thead><tr><th>Lane</th><th className="num">Token</th><th className="num">Quy đổi API</th><th className="num">Chi phí AI</th><th /></tr></thead>
            <tbody>{data.byLane.map(l => (
              <tr key={l.lane}><td>Lane {l.lane}</td><td className="num">{fmtTokens(sumTokens(l.tokens))}</td><td className="num">{fmtUsd(l.usd)}</td>
                <td className="num">{fmtVnd(l.vnd)}</td><td className="ct-meter-cell"><Meter value={l.vnd} max={maxLane} /></td></tr>))}</tbody>
          </table>
        )}
        {tab === 'models' && (<>
          <div className="us-scroll"><table className="grid ct-table">
            <thead><tr><th>Model</th><th className="num">Vào</th><th className="num">Ra</th><th className="num">Đọc cache</th><th className="num">Ghi cache</th><th className="num">Quy đổi API</th><th /></tr></thead>
            <tbody>{data.byModel.map(m => (
              <tr key={m.model}><td className="mono">{m.model}</td><td className="num">{fmtTokens(m.tokens.in)}</td><td className="num">{fmtTokens(m.tokens.out)}</td>
                <td className="num">{fmtTokens(m.tokens.cacheRead)}</td><td className="num">{fmtTokens(m.tokens.cacheWrite)}</td>
                <td className="num">{fmtUsd(m.usd)}</td><td className="ct-meter-cell"><Meter value={m.usd} max={maxModel} /></td></tr>))}</tbody>
          </table></div>
          <p className="rv-sub">Gợi ý tối ưu: bước nào tốn nhiều mà việc đơn giản (ticket, phản biện plan, QC) có thể chuyển sang Sonnet/Haiku hoặc hạ effort ở <b>Nhà cung cấp</b>.</p>
        </>)}
        {tab === 'settings' && <Settings settings={data.settings} onSaved={load} />}
      </div>
    </section>
  );
}
