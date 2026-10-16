import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, Coins, Gauge, Save, RotateCcw, Sparkles, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import StepModels from './StepModels.jsx';
import {
  fetchProviders, fetchLaneUsage, saveLaneModels, saveLaneModelDefaults,
  saveFeatureModels, saveLaneLimit, sendChat
} from '../lib/api.js';
import { fmtVnd, fmtTokens, fmtUsd, sumTokens } from '../lib/costs.js';

function pctTone(pct) {
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'warn';
  return 'ok';
}

function QuotaBar({ pct, tone }) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)';
  return (
    <div style={{ width: '100%', height: 7, borderRadius: 999, background: 'var(--border)', overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .2s var(--ease)' }} />
    </div>
  );
}

export default function LaneAiPanel({ lane, onUpdated }) {
  const n = lane.lane;
  const [info, setInfo] = useState(null);
  const [usage, setUsage] = useState(null);
  const [mode, setMode] = useState('lane-default'); // 'lane-default' | 'feature'
  const [laneDef, setLaneDef] = useState(null);
  const [hasCustomLane, setHasCustomLane] = useState(false);
  const [featKey, setFeatKey] = useState('');
  const [featModels, setFeatModels] = useState(null);
  const [limitForm, setLimitForm] = useState({ usd: '', tokens: '' });
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [busy, setBusy] = useState(false);

  const currentFeatKey = lane.run_id || (lane.spec_dir ? `lane${n}:${lane.spec_dir}` : (lane.feature_title ? `lane${n}:${lane.feature_title}` : `lane${n}:current`));

  const load = useCallback(async () => {
    try {
      const [prov, u] = await Promise.all([fetchProviders(), fetchLaneUsage(n)]);
      setInfo(prov);
      setUsage(u);
      const customLane = (prov.lane_defaults || {})[String(n)];
      setHasCustomLane(!!customLane);
      const effectiveLane = customLane || prov.defaults;
      setLaneDef(effectiveLane);

      const fk = featKey || currentFeatKey;
      if (!featKey) setFeatKey(fk);
      const savedFeat = (prov.feature_models || {})[fk];
      const activeModels = (fk === currentFeatKey && lane.models && Object.keys(lane.models).length)
        ? { ...effectiveLane, ...lane.models, impl_agents: lane.impl_agents || effectiveLane.impl_agents || 1, effort: { ...(effectiveLane.effort || {}), ...(lane.effort || {}) } }
        : (savedFeat || effectiveLane);
      setFeatModels(activeModels);

      setLimitForm({
        usd: u.lane?.limitUsd ?? 100,
        tokens: u.lane?.limitTokens ?? 10000000,
      });
    } catch (e) {
      setMsg({ ok: '', err: e.message });
    }
  }, [n, featKey, currentFeatKey, lane.models, lane.effort, lane.impl_agents]);

  useEffect(() => { load(); }, [load]);

  const handleSelectFeature = fk => {
    setFeatKey(fk);
    if (!info) return;
    const effectiveLane = (info.lane_defaults || {})[String(n)] || info.defaults;
    const savedFeat = (info.feature_models || {})[fk];
    if (fk === currentFeatKey && lane.models && Object.keys(lane.models).length) {
      setFeatModels({
        ...effectiveLane,
        ...lane.models,
        impl_agents: lane.impl_agents || effectiveLane.impl_agents || 1,
        effort: { ...(effectiveLane.effort || {}), ...(lane.effort || {}) },
      });
    } else {
      setFeatModels(savedFeat || effectiveLane);
    }
  };

  const saveLaneDefault = async () => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      await saveLaneModelDefaults(n, laneDef);
      setMsg({ ok: `Đã lưu cấu hình model riêng cho Lane ${n}.`, err: '' });
      await load();
      onUpdated?.();
    } catch (e) {
      setMsg({ ok: '', err: e.message });
    } finally {
      setBusy(false);
    }
  };

  const resetLaneDefault = async () => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      await saveLaneModelDefaults(n, { reset: true });
      setMsg({ ok: `Lane ${n} đã quay về dùng model mặc định chung.`, err: '' });
      await load();
      onUpdated?.();
    } catch (e) {
      setMsg({ ok: '', err: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveForFeature = async (resumeBlocked = false) => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      const { impl_agents, effort, ...stepModels } = featModels;
      if (featKey === currentFeatKey) {
        await saveLaneModels(n, stepModels, effort, { impl_agents, featureKey: featKey });
      } else {
        await saveFeatureModels({ key: featKey, models: stepModels, effort, impl_agents });
      }
      if (resumeBlocked) {
        await sendChat(n, 'continue — models for the failed step were changed on the dashboard; re-run that step');
      }
      setMsg({ ok: `Đã lưu cấu hình model cho tính năng "${featKey}".`, err: '' });
      await load();
      onUpdated?.();
    } catch (e) {
      setMsg({ ok: '', err: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveLimit = async e => {
    e.preventDefault();
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      await saveLaneLimit(n, { usd: Number(limitForm.usd), tokens: Number(limitForm.tokens) });
      setMsg({ ok: `Đã lưu hạn mức sử dụng cho Lane ${n}.`, err: '' });
      await load();
    } catch (e2) {
      setMsg({ ok: '', err: e2.message });
    } finally {
      setBusy(false);
    }
  };

  if (!info || !usage) {
    return msg.err ? <p className="m-err">{msg.err}</p> : <p className="muted-empty">Đang tải cấu hình AI & chi phí của Lane {n}…</p>;
  }

  const lu = usage.lane || { usd: 0, vnd: 0, tokens: {}, quotaPct: 0, sharePct: 0, usdPct: 0, tokenPct: 0, limitUsd: 100, limitTokens: 10000000 };
  const q5h = usage.plan?.five_hour?.utilization ?? usage.quotas?.five_hour?.pct ?? 0;
  const q7d = usage.plan?.seven_day?.utilization ?? usage.quotas?.seven_day?.pct ?? 0;
  const featureOptions = [
    { key: currentFeatKey, label: lane.feature_title ? `Hiện tại: ${lane.feature_title}` : `Tính năng hiện tại trên Lane ${n}` },
    ...(usage.features || []).filter(f => f.key !== currentFeatKey).map(f => ({ key: f.key, label: `${f.title || f.key}` })),
  ];

  return (
    <div className="rv-page" style={{ gap: 16 }}>
      {msg.err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{msg.err}</div>
        </div>
      )}
      {msg.ok && (
        <div className="alert-banner ok" role="status">
          <CheckCircle2 size={16} />
          <div className="alert-banner-content rv-sub" style={{ margin: 0, color: 'var(--ok)' }}>{msg.ok}</div>
        </div>
      )}

      {/* 1. Per-Lane Quota %, Token & Cost Summary */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className={`stat-icon ${pctTone(lu.quotaPct)}`}><Gauge size={18} /></div>
          <div className="stat-info" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <span className="stat-val">{lu.quotaPct}%</span>
              <Badge tone={pctTone(lu.quotaPct)}>Hạn mức Lane {n}</Badge>
            </div>
            <QuotaBar pct={lu.quotaPct} tone={pctTone(lu.quotaPct)} />
            <span className="stat-label" style={{ marginTop: 4 }}>
              {fmtUsd(lu.usd)} / {fmtUsd(lu.limitUsd)} ({lu.usdPct}%) · {fmtTokens(sumTokens(lu.tokens))} / {fmtTokens(lu.limitTokens)} token ({lu.tokenPct}%)
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon accent"><Coins size={18} /></div>
          <div className="stat-info">
            <span className="stat-val">{fmtVnd(lu.vnd)}</span>
            <span className="stat-label">
              Chi phí Lane {n} ({fmtUsd(lu.usd)} API · chiếm <b>{lu.sharePct}%</b> tổng hệ thống)
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon info"><Cpu size={18} /></div>
          <div className="stat-info">
            <span className="stat-val">{fmtTokens(sumTokens(lu.tokens))} token</span>
            <span className="stat-label">
              Vào {fmtTokens(lu.tokens?.in)} · Ra {fmtTokens(lu.tokens?.out)} · Cache {fmtTokens((lu.tokens?.cacheRead || 0) + (lu.tokens?.cacheWrite || 0))}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className={`stat-icon ${pctTone(Math.max(q5h, q7d))}`}><Sparkles size={18} /></div>
          <div className="stat-info" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600 }}>
              <span>5 giờ: {Math.round(q5h)}%</span>
              <span>7 ngày: {Math.round(q7d)}%</span>
            </div>
            <QuotaBar pct={Math.max(q5h, q7d)} tone={pctTone(Math.max(q5h, q7d))} />
            <span className="stat-label" style={{ marginTop: 4 }}>% Hạn mức phiên Claude toàn cục</span>
          </div>
        </div>
      </div>

      {/* Inline Quota Limit Editor for this Lane */}
      <div className="card-panel">
        <div className="card-header">
          <div className="card-header-title">
            <Gauge size={16} style={{ color: 'var(--accent)' }} />
            <span>Hạn mức sử dụng riêng của Lane {n} (Tháng {usage.month})</span>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={saveLimit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-field" style={{ minWidth: 180 }}>
              <label className="form-label">Hạn mức ngân sách Lane {n} (USD)</label>
              <input
                type="number"
                min="0"
                step="1"
                aria-label={`Hạn mức USD Lane ${n}`}
                value={limitForm.usd}
                onChange={e => setLimitForm({ ...limitForm, usd: e.target.value })}
              />
            </div>
            <div className="form-field" style={{ minWidth: 200 }}>
              <label className="form-label">Hạn mức Token tháng của Lane {n}</label>
              <input
                type="number"
                min="0"
                step="100000"
                aria-label={`Hạn mức Token Lane ${n}`}
                value={limitForm.tokens}
                onChange={e => setLimitForm({ ...limitForm, tokens: e.target.value })}
              />
            </div>
            <Button type="submit" variant="secondary" icon={Save} disabled={busy}>Lưu hạn mức Lane {n}</Button>
          </form>

          {/* Per-Model usage on this lane */}
          {usage.byModel && usage.byModel.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Mức sử dụng theo từng Model trên Lane {n}:</div>
              <div className="modern-table-wrap">
                <table className="grid modern-table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="num">Token vào</th>
                      <th className="num">Token ra</th>
                      <th className="num">Cache</th>
                      <th className="num">Chi phí API</th>
                      <th>% trên Lane {n}</th>
                      <th>% Hạn mức Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.byModel.map(m => (
                      <tr key={m.model}>
                        <td className="mono">{m.model}</td>
                        <td className="num">{fmtTokens(m.tokens.in)}</td>
                        <td className="num">{fmtTokens(m.tokens.out)}</td>
                        <td className="num">{fmtTokens((m.tokens.cacheRead || 0) + (m.tokens.cacheWrite || 0))}</td>
                        <td className="num">{fmtUsd(m.usd)}</td>
                        <td><Badge tone="accent">{m.sharePct}%</Badge></td>
                        <td style={{ minWidth: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Badge tone={pctTone(m.quotaPct)}>{m.quotaPct}%</Badge>
                            <div style={{ flex: 1 }}><QuotaBar pct={m.quotaPct} tone={pctTone(m.quotaPct)} /></div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Per-Lane vs Per-Feature AI Model Configuration */}
      <div className="card-panel">
        <div className="card-header">
          <div className="card-header-title">
            <Cpu size={17} style={{ color: 'var(--accent)' }} />
            <span>Cấu hình Model AI & Effort — Lane {n}</span>
            <Badge tone={hasCustomLane ? 'accent' : 'neutral'}>
              {hasCustomLane ? `Đang dùng cấu hình riêng Lane ${n}` : 'Đang kế thừa mặc định chung'}
            </Badge>
          </div>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 14 }}>
          <Tabs
            value={mode}
            onChange={setMode}
            items={[
              { id: 'lane-default', label: `Model mặc định riêng của Lane ${n}` },
              { id: 'feature', label: 'Model theo từng Tính năng trên Lane' },
            ]}
          />

          {mode === 'lane-default' && laneDef && (
            <div style={{ display: 'grid', gap: 12 }}>
              <p className="rv-sub" style={{ margin: 0 }}>
                Thiết lập bộ Model AI & mức Effort riêng cho <b>Lane {n}</b>. Mỗi bước (PM, BA, Kiến trúc, Thiết kế, Code, Kiểm thử…) trên Lane {n} có thể chạy một model khác hẳn các lane khác.
              </p>
              <StepModels info={info} value={laneDef} onChange={setLaneDef} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <Button variant="primary" icon={Save} disabled={busy} onClick={saveLaneDefault}>
                  Lưu cấu hình riêng cho Lane {n}
                </Button>
                {hasCustomLane && (
                  <Button variant="ghost" icon={RotateCcw} disabled={busy} onClick={resetLaneDefault}>
                    Đặt lại theo mặc định chung
                  </Button>
                )}
              </div>
            </div>
          )}

          {mode === 'feature' && featModels && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Layers size={16} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Chọn tính năng cần cấu hình model:</span>
                <select
                  className="role-select-box"
                  aria-label="Chọn tính năng cấu hình model"
                  value={featKey}
                  onChange={e => handleSelectFeature(e.target.value)}
                  style={{ minWidth: 260 }}>
                  {featureOptions.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <p className="rv-sub" style={{ margin: 0 }}>
                Cấu hình model bên dưới chỉ áp dụng riêng cho tính năng đã chọn (ưu tiên cao hơn cấu hình của Lane {n} và mặc định chung).
              </p>
              <StepModels info={info} value={featModels} onChange={setFeatModels} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <Button variant="primary" icon={Save} disabled={busy} onClick={() => saveForFeature(false)}>
                  Lưu model cho tính năng này
                </Button>
                {lane.status === 'blocked' && featKey === currentFeatKey && (
                  <Button variant="secondary" disabled={busy} onClick={() => saveForFeature(true)}>
                    Lưu & tiếp tục chạy bước đang dừng
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
