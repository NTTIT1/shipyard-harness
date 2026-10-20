import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Layers, ArrowRight, RotateCcw, Save } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import StepModels from '../StepModels.jsx';
import { platform } from '../../lib/platform.js';
import { fetchProviders, saveFeatureModels } from '../../lib/api.js';
import { STEPS, STEP_LABEL } from '../../lib/review.js';

export default function ProjectRunsTab({ pid, onOpenRun }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [providersData, setProvidersData] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [featForm, setFeatForm] = useState({ models: {}, impl_agents: 2, effort: {} });
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const r = await platform.projectRuns(pid);
      setRuns(r || []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
    fetchProviders().then(setProvidersData).catch(() => {});
  }, [pid]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const featureModels = providersData?.feature_models || {};
  const globalDefaults = providersData?.defaults || {};

  const openEditor = (key, titleFallback = '') => {
    if (editingKey === key) {
      setEditingKey(null);
      return;
    }
    const existing = featureModels[key] || (titleFallback && featureModels[titleFallback]) || null;
    setEditingKey(key);
    setFeatForm(existing || globalDefaults);
    setMsg('');
  };

  const handleSave = async (key, titleAlias = '') => {
    setSaving(true);
    setMsg('');
    try {
      const { impl_agents, effort, ...stepModels } = featForm || {};
      await saveFeatureModels({
        key,
        models: stepModels,
        impl_agents,
        effort,
      });
      if (titleAlias && titleAlias !== key) {
        await saveFeatureModels({
          key: titleAlias,
          models: stepModels,
          impl_agents,
          effort,
        });
      }
      await loadAll();
      setMsg(`Đã lưu cấu hình model cho tính năng "${titleAlias || key}"`);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg(`Lỗi: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (key, titleAlias = '') => {
    setSaving(true);
    try {
      await saveFeatureModels({ key, reset: true });
      if (titleAlias && titleAlias !== key) {
        await saveFeatureModels({ key: titleAlias, reset: true });
      }
      await loadAll();
      setEditingKey(null);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="muted-empty">Đang tải danh sách tính năng…</p>;

  return (
    <div className="pj-tab-stack">
      {msg && (
        <div className="alert-banner ok">
          <CheckCircle2 size={16} />
          <div className="alert-banner-content" style={{ margin: 0 }}>{msg}</div>
        </div>
      )}

      <div className="pj-invite-bar">
        <div className="pj-invite-label">
          <Cpu size={16} style={{ color: 'var(--accent-text)' }} />
          <span>Cấu hình trước Model cho tính năng mới:</span>
        </div>
        <input
          type="text"
          aria-label="Tên tính năng hoặc spec slug cần cấu hình model"
          placeholder="Nhập tên tính năng hoặc spec slug (vd: auth-sso)…"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          className="pj-invite-input"
        />
        <Button
          size="sm"
          variant="secondary"
          icon={Cpu}
          disabled={!newKey.trim()}
          onClick={() => {
            const k = newKey.trim();
            if (!k) return;
            openEditor(k, k);
            setNewKey('');
          }}>
          Chọn Model
        </Button>
      </div>

      {editingKey && !runs.some(r => r.id === editingKey) && (
        <div className="card-panel" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Cấu hình Model cho tính năng: <span className="mono">{editingKey}</span></strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>Đóng</Button>
              <Button size="sm" variant="primary" icon={Save} disabled={saving} onClick={() => handleSave(editingKey, editingKey)}>
                {saving ? 'Đang lưu…' : 'Lưu Model cho tính năng'}
              </Button>
            </div>
          </div>
          {providersData && featForm && (
            <StepModels info={providersData} value={featForm} onChange={setFeatForm} />
          )}
        </div>
      )}

      {!runs.length ? (
        <div className="modern-empty-state">
          <div className="modern-empty-icon">
            <Layers size={22} />
          </div>
          <div className="modern-empty-title">Chưa có tính năng nào chạy qua quy trình role.</div>
          <div className="modern-empty-desc">
            Khi một lane được gán tính năng và cấu hình PLATFORM_PROJECT_ID của dự án này, tiến trình sẽ hiển thị tại đây.
          </div>
        </div>
      ) : (
        <div className="card-panel">
          <div className="card-header">
            <div className="card-header-title">
              <Layers size={17} style={{ color: 'var(--accent-text)' }} />
              <span>Danh sách tính năng & cấu hình Model riêng</span>
              <span className="bdg bdg-neutral">{runs.length}</span>
            </div>
          </div>
          <div className="card-body" style={{ padding: 12 }}>
            <div className="runs-card-list">
              {runs.map(r => {
                const customCfg = featureModels[r.id] || featureModels[r.title];
                const isOpen = editingKey === r.id;
                const stepIdx = STEPS.indexOf(r.currentStep);
                const runProg = r.status === 'DONE' || r.status === 'APPROVED'
                  ? 100
                  : (stepIdx >= 0 ? Math.round(((stepIdx + 1) / STEPS.length) * 100) : null);
                return (
                  <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="run-item-card">
                      <div style={{ minWidth: 0 }}>
                        <button className="linklike run-title-link" onClick={() => onOpenRun(r.id)}>
                          <span>{r.title}</span>
                          <ArrowRight size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Bước hiện tại:</span>
                          <Badge tone="accent">{STEP_LABEL[r.currentStep] || '—'}</Badge>
                          {runProg != null && (
                            <span className="ov-prog" title={`Tiến độ quy trình ${runProg}%`}>
                              <span className="ov-bar"><i style={{ width: `${runProg}%` }} /></span>{runProg}%
                            </span>
                          )}
                          {customCfg && <Badge tone="ok">Đã gắn Model riêng</Badge>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <Button
                          size="sm"
                          variant={isOpen ? 'primary' : 'secondary'}
                          icon={Cpu}
                          onClick={() => openEditor(r.id, r.title)}>
                          {isOpen ? 'Đóng Model' : 'Model AI'}
                        </Button>
                        <Badge tone={r.status === 'APPROVED' || r.status === 'DONE' ? 'ok' : 'neutral'}>
                          {r.status}
                        </Badge>
                      </div>
                    </div>
                    {isOpen && providersData && featForm && (
                      <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--bg-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <strong style={{ fontSize: 13 }}>Model AI riêng cho tính năng: {r.title}</strong>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                              Ghi đè model của từng bước (PM, BA, Arch, Dev, Review, QC...) khi chạy tính năng này.
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {customCfg && (
                              <Button size="sm" variant="ghost" icon={RotateCcw} disabled={saving} onClick={() => handleReset(r.id, r.title)}>
                                Xoá cấu hình riêng
                              </Button>
                            )}
                            <Button size="sm" variant="primary" icon={Save} disabled={saving} onClick={() => handleSave(r.id, r.title)}>
                              {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
                            </Button>
                          </div>
                        </div>
                        <StepModels info={providersData} value={featForm} onChange={setFeatForm} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
