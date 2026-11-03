import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Button from './ui/Button.jsx';
import Tabs from './ui/Tabs.jsx';
import {
  Tile, DayBars, FeatureItem, LaneItem, CostSettingsForm, pctTone
} from './costs/CostRows.jsx';
import QuotaBoard from './quota/QuotaBoard.jsx';
import { fetchCosts, fetchProviders } from '../lib/api.js';
import { fmtVnd, fmtTokens, fmtUsd, sumTokens, featureView, featureLanes, FEATURE_SORTS } from '../lib/costs.js';
import '../styles/costs.css';
import { tr } from '../lib/i18n.js';

export default function CostsView({ projects = [], onOpenLane }) {
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [provInfo, setProvInfo] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('quota');
  const [find, setFind] = useState({ q: '', lane: 'all', sort: 'cost' });

  const load = useCallback(() => {
    fetchCosts(month).then(d => {
      if (d.ok === false) throw new Error(d.error);
      setData(d);
      setErr('');
    }).catch(e => setErr(e.message));
    fetchProviders().then(setProvInfo).catch(() => {});
  }, [month]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <section className="rv-page"><h1 className="rv-h1">{tr('Chi phí')}</h1>{err ? <p className="m-err">{err}</p> : <p className="muted-empty">{tr('Đang tải…')}</p>}</section>;

  const t = data.totals;
  const qMonth = data.quotas?.month || { quotaPct: 0, usdPct: 0, tokenPct: 0, limitUsd: 100, limitTokens: 10000000 };
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

  const board = data.quota_board;
  const heldCount = board?.held?.length || 0;

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
          sub={data.settings.planFeeVnd > 0 ? tr('phân bổ từ phí gói') : tr('{0} quy đổi API · {1} token', [fmtUsd(t.usd), fmtTokens(sumTokens(t.tokens))])}
        />
        <Tile
          label={tr('Hạn mức chung tháng')}
          value={`${Math.round(qMonth.usdPct)}%`}
          pct={qMonth.usdPct}
          tone={pctTone(qMonth.usdPct)}
          sub={tr('{0} / {1}', [fmtUsd(t.usd), fmtUsd(qMonth.limitUsd)])}
        />
        <Tile
          label={tr('Lane đang dừng vì hạn mức')}
          value={String(heldCount)}
          tone={heldCount ? 'danger' : 'ok'}
          sub={heldCount ? tr('chờ quản trị viên cấp thêm') : tr('không lane nào bị chặn')}
        />
        <Tile
          label={tr('Tiến độ trung bình')}
          value={projProg != null ? `${projProg}%` : '—'}
          pct={projProg != null ? projProg : 0}
          tone={projProg === 100 ? 'ok' : undefined}
          sub={activeLanesCount > 0 ? tr('TB cộng từ {0} lane đang có việc', [activeLanesCount]) : tr('chưa có lane nào có việc')}
        />
        <Tile
          label={tr('Tính năng AI tốn hơn người')}
          value={String(over)}
          tone={over ? 'danger' : 'ok'}
          sub={tr('trên {0} tính năng', [data.features.length])}
        />
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'quota', label: heldCount ? tr('Hạn mức ({0} lane dừng)', [heldCount]) : tr('Hạn mức') },
        { id: 'overview', label: tr('Chi phí theo ngày') },
        { id: 'features', label: tr('Tính năng') },
        { id: 'lanes', label: tr('Model AI theo lane') },
        { id: 'settings', label: tr('Cài đặt') },
      ]} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'quota' && <QuotaBoard board={board} settings={data.settings} projects={projects} onSaved={load} onOpenLane={onOpenLane} />}

        {tab === 'overview' && (
          <div className="stack-16">
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
            <p className="ct-intro">{tr('Model AI cho từng bước của mỗi lane. Hạn mức của lane đặt ở tab Hạn mức.')}</p>
            <div className="ct-list-head ct-list-head-lane" aria-hidden="true">
              <span>Lane</span><span>{tr('Chi phí AI')}</span><span>{tr('Hạn mức')}</span><span />
            </div>
            <ul className="ct-list">
              {allLaneRows.map(l => <LaneItem key={l.lane} laneObj={l} provInfo={provInfo} onSaved={load} />)}
            </ul>
          </div>
        )}

        {tab === 'settings' && <CostSettingsForm settings={data.settings} onSaved={load} />}
      </div>
    </section>
  );
}
