import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import PipelineEditor from './projects/PipelineEditor.jsx';
import { fetchLanePipeline, saveLanePipeline, clearLanePipeline, fetchProviders, saveLaneModelDefaults } from '../lib/api.js';
import { STEP_LABEL } from '../lib/review.js';

const STEPS = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];
import { defaultPipeline, pipelineProblem, pipelineSteps, SOURCE_LABEL } from '../lib/pipeline.js';

const strip = ({ source, ...p }) => p;

/**
 * What lane N runs after the code (profile < project default < this lane) and this lane's own
 * override. Saved locally for the lane; applies from the next stage the lane reaches.
 */
export default function LanePipelineModal({ n, onClose }) {
  const [info, setInfo] = useState(null);
  const [draft, setDraft] = useState(null);   // null = follow the project
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const load = r => { setInfo(r); setDraft(r.override ? { ...defaultPipeline(r.effective.prBase), ...strip(r.effective) } : null); };
  useEffect(() => { fetchLanePipeline(n).then(load, e => setErr(e.message)); }, [n]);

  const act = fn => async () => {
    setBusy(true); setErr('');
    try { load(await fn()); setNotice('Đã lưu — lane áp dụng từ bước tiếp theo nó chạy tới.'); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const own = !!draft;
  const problem = own ? pipelineProblem(draft) : '';
  const buttons = [
    { label: 'Đóng', fn: onClose },
    ...(info?.override && !own ? [{ label: busy ? 'Đang lưu…' : 'Theo dự án', cls: 'add', disabled: busy, fn: act(() => clearLanePipeline(n)) }] : []),
    ...(own ? [{ label: busy ? 'Đang lưu…' : 'Lưu quy trình của lane', cls: 'add', disabled: busy || !!problem, fn: act(() => saveLanePipeline(n, draft)) }] : []),
  ];
  const eff = info?.effective;
  return (
    <Modal title={`Quy trình của lane ${n}`} wide onClose={onClose} buttons={buttons}>
      {err && <p className="m-err" role="alert">{err}</p>}
      {!info ? (!err && <p className="muted-empty">Đang tải…</p>) : (
        <div className="pl-body">
          <LaneSteps n={n} />
          <h3 className="pl-h">Sau khi code xong</h3>
          <p className="pl-now">
            <span className="faint">Lane đang chạy theo <b>{SOURCE_LABEL[eff.source] || eff.source}</b>:</span>
            <span className="pl-summary">{pipelineSteps(eff).join(' → ')}</span>
          </p>
          <label className="wz-check">
            <input type="checkbox" checked={own}
              onChange={e => { setNotice(''); setDraft(e.target.checked ? { ...defaultPipeline(eff.prBase), ...strip(eff) } : null); }} />
            <span>Lane này dùng quy trình riêng (bỏ chọn rồi bấm <b>Theo dự án</b> để quay về mặc định của dự án)</span>
          </label>
          {own && <PipelineEditor value={draft} idPrefix={`lane${n}`} baseHint={eff.prBase || 'nhánh tích hợp'} onChange={v => { setNotice(''); setDraft(v); }} />}
          {notice && <p className="wf-notice" role="status">{notice}</p>}
        </div>
      )}
    </Modal>
  );
}

/**
 * The feature steps (PM → Test) for this lane: each follows the project's workflow unless the lane
 * says otherwise (stored with the lane's defaults as `gates`, the same choices "Giao việc" offers).
 */
function LaneSteps({ n }) {
  const [lane, setLane] = useState(null);   // the lane's model config (with gates)
  const [gates, setGates] = useState({});
  const [msg, setMsg] = useState('');
  useEffect(() => {
    fetchProviders().then(d => { const l = (d.lane_defaults || {})[String(n)] || d.defaults; setLane(l); setGates(l.gates || {}); },
      e => setMsg(e.message));
  }, [n]);
  if (!lane) return msg ? <p className="m-err">{msg}</p> : null;
  const changed = JSON.stringify(gates) !== JSON.stringify(lane.gates || {});
  const save = async () => {
    setMsg('đang lưu…');
    try {
      const clean = Object.fromEntries(Object.entries(gates).filter(([, v]) => v));
      const r = await saveLaneModelDefaults(n, { ...lane, gates: clean });
      const l = (r.lane_defaults || {})[String(n)] || { ...lane, gates: clean };
      setLane(l); setGates(l.gates || {}); setMsg('Đã lưu — áp dụng cho tính năng giao cho lane từ giờ.');
    } catch (e) { setMsg(e.message); }
  };
  return (
    <section>
      <h3 className="pl-h">Các bước của tính năng</h3>
      <p className="wfi-hint" style={{ margin: '0 0 8px' }}>Để "Theo dự án" thì lane theo quy trình của dự án (Quy trình &amp; duyệt). Đổi ở đây chỉ áp cho lane {n}.</p>
      <div className="gate-grid">
        {STEPS.map(st => (
          <label key={st}>{STEP_LABEL[st]}
            <select className="msel" value={gates[st] || ''} onChange={e => { setMsg(''); setGates(g => ({ ...g, [st]: e.target.value })); }}>
              <option value="">Theo dự án</option>
              <option value="REQUIRED">Cần người duyệt</option>
              <option value="AUTO">Tự duyệt khi xanh</option>
              {st !== 'DEV' && <option value="SKIP">Bỏ bước</option>}
            </select>
          </label>
        ))}
      </div>
      <div className="wf-actions" style={{ padding: '8px 0 0' }}>
        <span className="wf-notice" role="status">{msg}</span>
        <button type="button" className="btn btn-sm btn-primary" disabled={!changed} onClick={save}>Lưu các bước của lane</button>
      </div>
    </section>
  );
}
