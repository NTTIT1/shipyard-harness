import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import Modal from './Modal.jsx';
import StepModels from './StepModels.jsx';
import { fetchProviders, fetchSpecs, assignLane } from '../lib/api.js';
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
  const [gates, setGates] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProviders().then(d => { setInfo(d); setModels(d.defaults); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (lane == null) return;
    fetchSpecs(lane).then(d => { setSpecs(d.specs); setSpec(d.specs[0] || ''); }).catch(() => setSpecs([]));
  }, [lane]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      const { impl_agents, effort, ...stepModels } = models;
      await assignLane(lane, {
        ...(mode === 'new' ? { requirement: text } : { spec_dir: spec }),
        models: stepModels, impl_agents, gates, effort,
      });
      onDone(lane);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const canSubmit = !busy && lane != null && models && (mode === 'new' ? text.trim() : spec);

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
            ? <textarea className="req" rows={5} value={text} onChange={e => setText(e.target.value)}
                placeholder="Mô tả tính năng cần làm…" />
            : <select className="msel" value={spec} onChange={e => setSpec(e.target.value)}>
                {specs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>}
          <div className="m-l" style={{ marginTop: 14 }}>AI từng bước</div>
          {info && models && <StepModels info={info} value={models} onChange={setModels} />}
          <div className="m-l" style={{ marginTop: 14 }}>Duyệt cho tính năng này</div>
          <div className="gate-grid">
            {STEPS.map(s => (
              <label key={s}>{STEP_LABEL[s]}
                <select className="msel" value={gates[s] || ''} onChange={e => setGates(g => ({ ...g, [s]: e.target.value }))}>
                  <option value="">Theo dự án</option>
                  <option value="REQUIRED">Bắt buộc duyệt</option>
                  <option value="AUTO">Tự động</option>
                </select>
              </label>
            ))}
          </div>
          <p className="m-hint">Áp dụng khi dự án chạy quy trình role (PM → BA → Kiến trúc → Thiết kế → Lập trình → Kiểm thử). Bước “Tự động” không dừng chờ người duyệt nhưng vẫn được lưu lịch sử và bộ nhớ.</p>
        </>
      )}
      {error && <p className="m-err">{error}</p>}
    </Modal>
  );
}
