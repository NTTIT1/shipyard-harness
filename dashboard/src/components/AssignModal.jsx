import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import Modal from './Modal.jsx';
import StepModels from './StepModels.jsx';
import { fetchProviders, fetchSpecs, assignLane, saveLaneModelDefaults } from '../lib/api.js';
import { STEPS, STEP_LABEL } from '../lib/review.js';

const isFree = l => !l.session_running && ['idle', 'down', '', undefined].includes(l.status);

export default function AssignModal({ lanes, initialLane, onClose, onDone }) {
  const free = lanes.filter(isFree);
  const [lane, setLane] = useState(initialLane ?? free[0]?.lane ?? null);
  const [mode, setMode] = useState('new');
  const [text, setText] = useState('');
  const [specs, setSpecs] = useState([]);
  const [spec, setSpec] = useState('');
  const [info, setInfo] = useState(null);
  const [models, setModels] = useState(null);
  const [saveAsLaneDef, setSaveAsLaneDef] = useState(false);
  const [gates, setGates] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProviders().then(d => {
      setInfo(d);
      const laneModels = (d.lane_defaults || {})[String(lane)] || d.defaults;
      setModels(laneModels);
      setGates(laneModels.gates || {});
    }).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (lane == null) return;
    if (info) {
      const laneModels = (info.lane_defaults || {})[String(lane)] || info.defaults;
      setModels(laneModels);
      setGates(laneModels.gates || {});
    }
    fetchSpecs(lane).then(d => { setSpecs(d.specs); setSpec(d.specs[0] || ''); }).catch(() => setSpecs([]));
  }, [lane, info]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      if (saveAsLaneDef && models) {
        await saveLaneModelDefaults(lane, { ...models, gates });
      }
      const { impl_agents, effort, gates: _gates, ...stepModels } = models;
      await assignLane(lane, {
        ...(mode === 'new' ? { requirement: text } : { spec_dir: spec }),
        models: stepModels, impl_agents, gates, effort,
      });
      onDone(lane);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const canSubmit = !busy && lane != null && models && (mode === 'new' ? text.trim() : spec);
  const hasLaneCustom = !!(info && lane != null && (info.lane_defaults || {})[String(lane)]);

  return (
    <Modal wide title="Giao việc" onClose={onClose}
      buttons={[{ label: 'Huỷ', fn: onClose, disabled: busy }, { label: busy ? 'Đang bắt đầu…' : 'Bắt đầu', icon: busy ? undefined : Play, cls: 'add', fn: submit, disabled: !canSubmit }]}>
      {!free.length && initialLane == null ? <p className="m-text">Không có lane nào rảnh. Thêm lane hoặc chờ lane xong việc.</p> : (
        <>
          <label className="m-l">Lane
            <select className="msel" value={lane ?? ''} onChange={e => setLane(parseInt(e.target.value, 10))}>
              {free.map(l => <option key={l.lane} value={l.lane}>Lane {l.lane} (rảnh)</option>)}
            </select>
          </label>
          <div className="m-l">Yêu cầu
            <span className="seg">
              <label className={mode === 'new' ? 'on' : ''}><input type="radio" name="assign-mode" checked={mode === 'new'} onChange={() => setMode('new')} /> Mô tả mới</label>
              <label className={mode === 'spec' ? 'on' : ''}><input type="radio" name="assign-mode" checked={mode === 'spec'} disabled={!specs.length} onChange={() => setMode('spec')} /> Spec có sẵn</label>
            </span>
          </div>
          {mode === 'new'
            ? <textarea className="req" rows={5} value={text} onChange={e => setText(e.target.value)} aria-label="Mô tả tính năng"
                placeholder="Mô tả tính năng cần làm: ai dùng, làm được gì, điều kiện xong…" />
            : <select className="msel" aria-label="Spec có sẵn" value={spec} onChange={e => setSpec(e.target.value)}>
                {specs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>}
          {/* The common path is lane + request → Start; per-step AI and workflow are one level deeper. */}
          <details className="am-advanced">
            <summary>
              <span className="am-adv-title">Tuỳ chỉnh AI & quy trình cho tính năng này</span>
              <span className="am-adv-sum">
                {hasLaneCustom ? `cấu hình riêng Lane ${lane}` : 'mặc định chung'}
                {' · '}{Object.values(gates).filter(Boolean).length ? `${Object.values(gates).filter(Boolean).length} bước đổi quy trình` : 'quy trình theo dự án'}
              </span>
            </summary>
            <div className="am-adv-body">
              <div className="am-adv-row">
                <span className="m-l" style={{ margin: 0 }}>AI từng bước</span>
                <label className="am-check">
                  <input type="checkbox" checked={saveAsLaneDef} onChange={e => setSaveAsLaneDef(e.target.checked)} />
                  Lưu làm mặc định riêng cho Lane {lane}
                </label>
              </div>
              {info && models && <StepModels info={info} value={models} onChange={setModels} />}
              <div className="m-l" style={{ marginTop: 14 }}>Quy trình</div>
              <div className="gate-grid">
                {STEPS.map(s => (
                  <label key={s}>{STEP_LABEL[s]}
                    <select className="msel" value={gates[s] || ''} onChange={e => setGates(g => ({ ...g, [s]: e.target.value }))}>
                      <option value="">Theo dự án</option>
                      <option value="REQUIRED">Cần người duyệt</option>
                      <option value="AUTO">Tự duyệt</option>
                      {s !== 'DEV' && <option value="SKIP">Bỏ bước</option>}
                    </select>
                  </label>
                ))}
              </div>
              <p className="m-hint">“Theo dự án” dùng quy trình ở <b>Quy trình &amp; duyệt</b>. Code chỉ bắt đầu khi mọi bước trước đã qua.</p>
            </div>
          </details>
        </>
      )}
      {error && <p className="m-err">{error}</p>}
    </Modal>
  );
}
