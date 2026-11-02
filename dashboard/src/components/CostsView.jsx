import React, { useCallback, useEffect, useState } from 'react';
import { Save, Cpu, Gauge, Search } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import {
  Tile, DayBars, Meter, FeatureItem, LaneItem, ModelItem, CostSettingsForm,
  PLAN_LABEL, fmtTime, pctTone
} from './costs/CostRows.jsx';
import { fetchCosts, saveCostSettings, fetchProviders } from '../lib/api.js';
import { fmtVnd, fmtTokens, fmtUsd, sumTokens, featureView, featureLanes, FEATURE_SORTS } from '../lib/costs.js';
import '../styles/costs.css';
import { tr } from '../lib/i18n.js';

export default function CostsView() {
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [provInfo, setProvInfo] = useState(null);
  const [modelLimitsEdit, setModelLimitsEdit] = useState({});
  const [modelMsg, setModelMsg] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview');
  const [find, setFind] = useState({ q: '', lane: 'all', sort: 'cost' });

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

  if (!data) return <section className="rv-page"><h1 className="rv-h1">{tr('Chi phí')}</h1>{err ? <p className="m-err">{err}</p> : <p className="muted-empty">{tr('Đang tải…')}</p>}</section>;

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
      setModelMsg(tr('Đã lưu hạn mức cho các model.'));
      load();
    } catch (e) {
      setModelMsg(tr('Lỗi: {0}', [e.message]));
    }
  };

  return (
    <section className="rv-page ct-page" aria-labelledby="ct-title">
      <div className="ct-head">
        <h1 id="ct-title" className="rv-h1">{tr('Chi phí & hạn mức')}</h1>
        <select className="msel" aria-label={tr('Tháng')} value={data.month} onChange={e => setMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {err && <p className="m-err">{err}</p>}

      <div className="ct-tiles">
        <Tile
          label={tr('Chi phí tháng này')}
          value={fmtVnd(t.vnd)}
          pct={qMonth.usdPct}
          tone={pctTone(qMonth.usdPct)}
          sub={data.settings.planFeeVnd > 0 ? tr('phân bổ từ phí gói · {0}% hạn mức', [qMonth.usdPct]) : tr('đã dùng {0}% hạn mức tháng ({1})', [qMonth.usdPct, fmtUsd(qMonth.limitUsd)])}
        />
        <Tile
          label={tr('Tiến độ trung bình')}
          value={projProg != null ? `${projProg}%` : '—'}
          pct={projProg != null ? projProg : 0}
          tone={projProg === 100 ? 'ok' : undefined}
          sub={activeLanesCount > 0 ? tr('TB cộng từ {0} lane đang có việc', [activeLanesCount]) : tr('chưa có lane nào có việc')}
        />
        <Tile
          label={tr('Giá trị quy đổi API')}
          value={fmtUsd(t.usd)}
          pct={qMonth.usdPct}
          tone={pctTone(qMonth.usdPct)}
          sub={tr('{0}% hạn mức {1} / tháng', [qMonth.usdPct, fmtUsd(qMonth.limitUsd)])}
        />
        <Tile
          label={tr('Token đã dùng')}
          value={fmtTokens(sumTokens(t.tokens))}
          pct={qMonth.tokenPct}
          tone={pctTone(qMonth.tokenPct)}
          sub={tr('{0}% hạn mức · vào {1} · ra {2} · cache {3}', [qMonth.tokenPct, fmtTokens(t.tokens.in), fmtTokens(t.tokens.out), fmtTokens(t.tokens.cacheRead + t.tokens.cacheWrite)])}
        />
        <Tile
          label={tr('Hạn mức 5 giờ')}
          value={`${pct5h}%`}
          pct={pct5h}
          tone={pctTone(pct5h)}
          sub={data.plan?.five_hour?.resetsAt ? tr('làm mới {0}', [fmtTime(data.plan.five_hour.resetsAt)]) : `${fmtUsd(data.quotas?.five_hour?.usd || 0)} / ${fmtUsd(data.quotas?.five_hour?.limitUsd || 15)} trong 5h qua`}
        />
        <Tile
          label={tr('Hạn mức 7 ngày')}
          value={`${pct7d}%`}
          pct={pct7d}
          tone={pctTone(pct7d)}
          sub={data.plan?.seven_day?.resetsAt ? tr('làm mới {0}', [fmtTime(data.plan.seven_day.resetsAt)]) : tr('{0} / {1} trong 7 ngày qua', [fmtUsd(data.quotas?.seven_day?.usd || 0), fmtUsd(data.quotas?.seven_day?.limitUsd || 60)])}
        />
        <Tile
          label={tr('Tính năng AI tốn hơn người')}
          value={String(over)}
          tone={over ? 'danger' : 'ok'}
          sub={tr('trên {0} tính năng', [data.features.length])}
        />
        {extraPlan.map(([k, v]) => (
          <Tile
            key={k}
            label={PLAN_LABEL[k] || k}
            value={`${Math.round(v.utilization)}%`}
            pct={v.utilization}
            tone={pctTone(v.utilization)}
            sub={v.resetsAt ? tr('làm mới {0}', [fmtTime(v.resetsAt)]) : ''}
          />
        ))}
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'overview', label: tr('Tổng quan & % Hạn mức') },
        { id: 'features', label: tr('Tính năng') },
        { id: 'lanes', label: tr('Lane & Model riêng') },
        { id: 'models', label: tr('Model & % Quota') },
        { id: 'settings', label: tr('Cài đặt') },
      ]} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <div className="stack-16">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              <div className="card-panel">
                <div className="card-header">
                  <div className="card-header-title">
                    <Gauge size={16} className="ic-accent" />
                    <span>{tr('% Hạn mức đã dùng theo từng Model')}</span>
                  </div>
                </div>
                <div className="card-body stack-10">
                  {data.byModel.length === 0 ? (
                    <p className="muted-empty u-m0">{tr('Chưa có model nào phát sinh token trong tháng này.')}</p>
                  ) : (
                    data.byModel.map(m => {
                      const mTone = pctTone(m.quotaPct || 0);
                      return (
                        <div key={m.model} className="stack-4">
                          <div className="row-between">
                            <span className="mono u-strong">{m.model}</span>
                            <div className="row-6">
                              <Badge tone="neutral">{tr('Tỷ trọng {0}%', [m.sharePct])}</Badge>
                              <Badge tone={mTone}>{tr('Đã dùng {0}% hạn mức', [m.quotaPct])}</Badge>
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
                    <span>{tr('Tiến độ & Chi phí theo từng Lane')}</span>
                  </div>
                  {projProg != null && (
                    <Badge tone="accent">{tr('TB Tiến độ: {0}%', [projProg])}</Badge>
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
                            {l.progress != null && <Badge tone="ok">{tr('Tiến độ {0}%', [l.progress])}</Badge>}
                            <Badge tone={hasCustom ? 'accent' : 'neutral'}>
                              {hasCustom ? tr('Model riêng') : tr('Mặc định')}
                            </Badge>
                          </span>
                          <div className="row-6">
                            <Badge tone="neutral">{tr('Tỷ trọng {0}%', [l.sharePct])}</Badge>
                            <Badge tone={lTone}>{tr('Đã dùng {0}% hạn mức', [l.quotaPct])}</Badge>
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
            <p className="rv-sub">{tr('Số liệu là ước tính theo bảng giá niêm yết của Claude (không phải hoá đơn), chỉ tính từ khi bật theo dõi. Với gói thuê bao, chi phí thật là phí gói chia theo tỷ lệ token mỗi tính năng dùng.')}</p>
          </div>
        )}

        {tab === 'features' && (data.features.length ? (() => {
          const rows = featureView(data.features, find);
          const maxVnd = Math.max(...data.features.map(f => f.vnd), 1);
          const total = rows.reduce((n, f) => n + (f.vnd || 0), 0);
          return (
            <div className="ct-listview">
              <div className="ct-toolbar">
                <label className="ct-search">
                  <Search size={14} aria-hidden="true" />
                  <input type="search" placeholder={tr('Tìm tính năng hoặc run…')} aria-label={tr('Tìm tính năng')}
                    value={find.q} onChange={e => setFind({ ...find, q: e.target.value })} />
                </label>
                <select className="msel" aria-label={tr('Lọc theo lane')} value={find.lane} onChange={e => setFind({ ...find, lane: e.target.value })}>
                  <option value="all">{tr('Mọi lane ({0})', [data.features.length])}</option>
                  {featureLanes(data.features).map(l => <option key={l.lane} value={String(l.lane)}>Lane {l.lane} ({l.count})</option>)}
                </select>
                <select className="msel" aria-label={tr('Sắp xếp')} value={find.sort} onChange={e => setFind({ ...find, sort: e.target.value })}>
                  {FEATURE_SORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <span className="ct-total" aria-live="polite">{tr('{0} tính năng ·', [rows.length])}{' '}<b>{fmtVnd(total)}</b></span>
              </div>
              <div className="ct-list-head" aria-hidden="true">
                <span>{tr('Tính năng')}</span><span>{tr('Chi phí AI')}</span><span>{tr('AI / người làm')}</span><span />
              </div>
              {rows.length ? (
                <ul className="ct-list">
                  {rows.map(f => <FeatureItem key={f.key} f={f} maxVnd={maxVnd} settings={data.settings} provInfo={provInfo} onSaved={load} />)}
                </ul>
              ) : (
                <div className="ct-empty">
                  <p>{tr('Không có tính năng nào khớp.')}</p>
                  <Button size="sm" variant="ghost" onClick={() => setFind({ q: '', lane: 'all', sort: find.sort })}>{tr('Bỏ lọc')}</Button>
                </div>
              )}
            </div>
          );
        })() : <p className="muted-empty">{tr('Chưa có tính năng nào trong tháng này.')}</p>)}

        {tab === 'lanes' && (
          <div className="ct-listview">
            <p className="ct-intro">{tr('Chi phí và hạn mức của từng lane trong tháng. Bấm vào một lane để đổi hạn mức hoặc model AI cho từng bước.')}</p>
            <div className="ct-list-head ct-list-head-lane" aria-hidden="true">
              <span>Lane</span><span>{tr('Chi phí AI')}</span><span>{tr('Hạn mức lane')}</span><span />
            </div>
            <ul className="ct-list">
              {allLaneRows.map(l => <LaneItem key={l.lane} laneObj={l} provInfo={provInfo} onSaved={load} />)}
            </ul>
          </div>
        )}

        {tab === 'models' && (
          <div className="ct-listview">
            <p className="ct-intro">{tr('Token và chi phí của từng model trong tháng. Để trống hạn mức thì model dùng hạn mức chung.')}</p>
            {data.byModel.length ? (<>
              <div className="ct-list-head ct-list-head-model" aria-hidden="true">
                <span>Model</span><span>{tr('Quy đổi API')}</span><span>{tr('Đã dùng hạn mức')}</span><span>{tr('Hạn mức riêng')}</span>
              </div>
              <ul className="ct-list">
                {data.byModel.map(m => (
                  <ModelItem key={m.model} m={m} limit={modelLimitsEdit[m.model] || {}}
                    onLimit={v => setModelLimitsEdit(prev => ({ ...prev, [m.model]: v }))} />
                ))}
              </ul>
              <div className="ct-save-bar">
                <Button size="sm" variant="primary" icon={Save} onClick={saveModelQuotas}>{tr('Lưu hạn mức các model')}</Button>
                {modelMsg && <span className="ct-msg" role="status">{modelMsg}</span>}
              </div>
            </>) : <p className="muted-empty">{tr('Chưa có model nào phát sinh token trong tháng này.')}</p>}
            <p className="ct-hint">{tr('Gợi ý: bước tốn nhiều mà việc đơn giản (ticket, phản biện plan, QC) có thể chuyển sang Sonnet/Haiku hoặc hạ effort ở từng lane hoặc nhà cung cấp.')}</p>
          </div>
        )}

        {tab === 'settings' && <CostSettingsForm settings={data.settings} onSaved={load} />}
      </div>
    </section>
  );
}
