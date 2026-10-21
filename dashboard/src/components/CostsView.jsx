import React, { useCallback, useEffect, useState } from 'react';
import { Save, Cpu, Gauge } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import {
  Tile, DayBars, Meter, FeatureRow, LaneConfigRow, CostSettingsForm,
  PLAN_LABEL, fmtTime, pctTone
} from './costs/CostRows.jsx';
import { fetchCosts, saveCostSettings, fetchProviders } from '../lib/api.js';
import { fmtVnd, fmtTokens, fmtUsd, sumTokens } from '../lib/costs.js';
import '../styles/costs.css';

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
  const projProg = data.project_progress;
  const activeLanesCount = data.active_lanes_count || 0;
  const lanesState = data.lanes_state || [];

  const laneNums = [...new Set([
    ...data.byLane.map(l => l.lane),
    ...lanesState.map(l => l.lane),
    ...Object.keys(data.lane_defaults || {}).map(Number),
    1, 2, 3,
  ])].filter(n => n > 0).sort((a, b) => a - b);

  const allLaneRows = laneNums.map(n => {
    const found = data.byLane.find(l => l.lane === n);
    const ls = lanesState.find(l => l.lane === n);
    return {
      ...(found || {
        lane: n,
        usd: 0,
        vnd: 0,
        tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
        sharePct: 0,
        quotaPct: 0,
        limitUsd: data.settings?.laneLimits?.[String(n)]?.usd ?? (data.settings?.monthlyBudgetUsd || 100),
        limitTokens: data.settings?.laneLimits?.[String(n)]?.tokens ?? (data.settings?.monthlyTokenLimit || 10000000),
      }),
      progress: ls?.progress ?? null,
      stage: ls?.stage || '',
      feature_title: ls?.feature_title || '',
    };
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
        <h1 id="ct-title" className="rv-h1">Chi phí & hạn mức</h1>
        <select className="msel" aria-label="Tháng" value={data.month} onChange={e => setMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {err && <p className="m-err">{err}</p>}

      <div className="ct-tiles">
        <Tile
          label="Chi phí tháng này"
          value={fmtVnd(t.vnd)}
          pct={qMonth.usdPct}
          tone={pctTone(qMonth.usdPct)}
          sub={data.settings.planFeeVnd > 0 ? `phân bổ từ phí gói · ${qMonth.usdPct}% hạn mức` : `đã dùng ${qMonth.usdPct}% hạn mức tháng (${fmtUsd(qMonth.limitUsd)})`}
        />
        <Tile
          label="Tiến độ trung bình"
          value={projProg != null ? `${projProg}%` : '—'}
          pct={projProg != null ? projProg : 0}
          tone={projProg === 100 ? 'ok' : undefined}
          sub={activeLanesCount > 0 ? `TB cộng từ ${activeLanesCount} lane đang có việc` : 'chưa có lane nào có việc'}
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
          <div className="stack-16">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              <div className="card-panel">
                <div className="card-header">
                  <div className="card-header-title">
                    <Gauge size={16} className="ic-accent" />
                    <span>% Hạn mức đã dùng theo từng Model</span>
                  </div>
                </div>
                <div className="card-body stack-10">
                  {data.byModel.length === 0 ? (
                    <p className="muted-empty u-m0">Chưa có model nào phát sinh token trong tháng này.</p>
                  ) : (
                    data.byModel.map(m => {
                      const mTone = pctTone(m.quotaPct || 0);
                      return (
                        <div key={m.model} className="stack-4">
                          <div className="row-between">
                            <span className="mono u-strong">{m.model}</span>
                            <div className="row-6">
                              <Badge tone="neutral">Tỷ trọng {m.sharePct}%</Badge>
                              <Badge tone={mTone}>Đã dùng {m.quotaPct}% hạn mức</Badge>
                            </div>
                          </div>
                          <Meter value={m.quotaPct || 0} max={100} tone={mTone} />
                          <div className="faint caption-row">
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
                    <Cpu size={16} className="ic-accent" />
                    <span>Tiến độ & Chi phí theo từng Lane</span>
                  </div>
                  {projProg != null && (
                    <Badge tone="accent">TB Tiến độ: {projProg}%</Badge>
                  )}
                </div>
                <div className="card-body stack-10">
                  {allLaneRows.map(l => {
                    const lTone = pctTone(l.quotaPct || 0);
                    const hasCustom = !!(data.lane_defaults && data.lane_defaults[String(l.lane)]);
                    return (
                      <div key={l.lane} className="stack-4">
                        <div className="row-between">
                          <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span>Lane {l.lane}</span>
                            {l.progress != null && <Badge tone="ok">Tiến độ {l.progress}%</Badge>}
                            <Badge tone={hasCustom ? 'accent' : 'neutral'}>
                              {hasCustom ? 'Model riêng' : 'Mặc định'}
                            </Badge>
                          </span>
                          <div className="row-6">
                            <Badge tone="neutral">Tỷ trọng {l.sharePct}%</Badge>
                            <Badge tone={lTone}>Đã dùng {l.quotaPct}% hạn mức</Badge>
                          </div>
                        </div>
                        <Meter value={l.quotaPct || 0} max={100} tone={lTone} />
                        <div className="faint caption-row">
                          <span>{fmtVnd(l.vnd)} ({fmtUsd(l.usd)} / {fmtUsd(l.limitUsd)})</span>
                          <span>{l.feature_title ? `${l.feature_title} · ` : ''}{fmtTokens(sumTokens(l.tokens))} token</span>
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
          <div className="stack-12">
            <p className="rv-sub u-m0">
              Theo dõi token, chi phí, tiến độ, % hạn mức của từng Lane và chỉnh bộ <b>Model AI riêng cho từng Lane</b> ngay bên dưới:
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
                      <span className="faint u-faint">{m.usdPct ?? 0}% $ · {m.tokenPct ?? 0}% tok</span>
                    </div>
                    <Meter value={m.quotaPct || 0} max={100} tone={mTone} />
                  </td>
                  <td>
                    <div className="row-6">
                      <input
                        type="number"
                        min="0"
                        placeholder={`$${m.limitUsd}`}
                        aria-label={`Hạn mức USD cho ${m.model}`}
                        value={curLim.usd ?? ''}
                        onChange={e => setModelLimitsEdit(prev => ({ ...prev, [m.model]: { ...(prev[m.model] || {}), usd: e.target.value } }))}
                        className="num-input" style={{ width: 76 }}
                      />
                      <input
                        type="number"
                        min="0"
                        step="100000"
                        placeholder={`${fmtTokens(m.limitTokens)} tok`}
                        aria-label={`Hạn mức token cho ${m.model}`}
                        value={curLim.tokens ?? ''}
                        onChange={e => setModelLimitsEdit(prev => ({ ...prev, [m.model]: { ...(prev[m.model] || {}), tokens: e.target.value } }))}
                        className="num-input" style={{ width: 96 }}
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

        {tab === 'settings' && <CostSettingsForm settings={data.settings} onSaved={load} />}
      </div>
    </section>
  );
}
