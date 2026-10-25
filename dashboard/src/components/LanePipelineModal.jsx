import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import PipelineEditor from './projects/PipelineEditor.jsx';
import { fetchLanePipeline, saveLanePipeline, clearLanePipeline, fetchProviders, saveLaneModelDefaults } from '../lib/api.js';
import { STEP_LABEL } from '../lib/review.js';
import { defaultPipeline, pipelineProblem, pipelineSteps, SOURCE_LABEL } from '../lib/pipeline.js';

const STEPS = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];
const strip = ({ source, ...p }) => p;
const cleanGates = g => Object.fromEntries(Object.entries(g || {}).filter(([, v]) => v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Lane N's own workflow, both halves, saved together: the feature steps (PM → Test, each following
 * the project or overridden for this lane) and the pipeline after the code (profile < project <
 * this lane). Applies from the next feature / next stage the lane reaches.
 */
export default function LanePipelineModal({ n, onClose }) {
  const [info, setInfo] = useState(null);       // { effective, override }
  const [laneModels, setLaneModels] = useState(null);
  const [gates, setGates] = useState({});
  const [draft, setDraft] = useState(null);     // null = follow the project
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  const loadPipeline = r => { setInfo(r); setDraft(r.override ? { ...defaultPipeline(r.effective.prBase), ...strip(r.effective) } : null); };
  useEffect(() => {
    fetchLanePipeline(n).then(loadPipeline, e => setErr(e.message));
    fetchProviders().then(d => { const l = (d.lane_defaults || {})[String(n)] || d.defaults; setLaneModels(l); setGates(l.gates || {}); },
      e => setErr(e.message));
  }, [n]);

  const own = !!draft;
  const gatesDirty = !!laneModels && !same(cleanGates(gates), cleanGates(laneModels.gates));
  const pipelineDirty = !!info && (own ? !same(draft, { ...defaultPipeline(info.effective.prBase), ...strip(info.effective) }) || !info.override : !!info.override);
  const dirty = gatesDirty || pipelineDirty;
  const problem = own ? pipelineProblem(draft) : '';

  const save = async () => {
    setBusy(true); setErr(''); setNotice('');
    try {
      if (gatesDirty) {
        const r = await saveLaneModelDefaults(n, { ...laneModels, gates: cleanGates(gates) });
        const l = (r.lane_defaults || {})[String(n)] || { ...laneModels, gates: cleanGates(gates) };
        setLaneModels(l); setGates(l.gates || {});
      }
      if (pipelineDirty) loadPipeline(await (own ? saveLanePipeline(n, draft) : clearLanePipeline(n)));
      setNotice('Đã lưu — lane áp dụng từ tính năng / bước tiếp theo nó chạy tới.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const eff = info?.effective;
  return (
    <Modal title={`Quy trình của lane ${n}`} wide onClose={onClose} buttons={[
      { label: 'Đóng', fn: onClose },
      { label: busy ? 'Đang lưu…' : 'Lưu', cls: 'add', disabled: busy || !dirty || !!problem, fn: save },
    ]}>
      {err && <p className="m-err" role="alert">{err}</p>}
      {!info || !laneModels ? (!err && <p className="muted-empty">Đang tải…</p>) : (
        <div className="pl-body">
          <section className="pl-sec" aria-labelledby={`lp${n}-steps`}>
            <h3 className="pl-h" id={`lp${n}-steps`}>Các bước của tính năng</h3>
            <p className="pl-sub">“Theo dự án” = như Quy trình &amp; duyệt của dự án. Đổi ở đây chỉ áp cho lane {n}.</p>
            <div className="gate-grid">
              {STEPS.map(st => (
                <label key={st}>{STEP_LABEL[st]}
                  <select className="msel" value={gates[st] || ''} onChange={e => { setNotice(''); setGates(g => ({ ...g, [st]: e.target.value })); }}>
                    <option value="">Theo dự án</option>
                    <option value="REQUIRED">Cần người duyệt</option>
                    <option value="AUTO">Tự duyệt khi xanh</option>
                    {st !== 'DEV' && <option value="SKIP">Bỏ bước</option>}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="pl-sec" aria-labelledby={`lp${n}-after`}>
            <h3 className="pl-h" id={`lp${n}-after`}>Sau khi code xong</h3>
            <p className="pl-now">
              <span className="pl-sub">Đang chạy theo <b>{SOURCE_LABEL[eff.source] || eff.source}</b></span>
              <span className="pl-summary">{pipelineSteps(eff).join(' → ')}</span>
            </p>
            <label className="wz-check">
              <input type="checkbox" checked={own}
                onChange={e => { setNotice(''); setDraft(e.target.checked ? { ...defaultPipeline(eff.prBase), ...strip(eff) } : null); }} />
              <span>Dùng quy trình riêng cho lane này <span className="faint">(bỏ chọn rồi Lưu = theo dự án)</span></span>
            </label>
            {own && <PipelineEditor value={draft} idPrefix={`lane${n}`} baseHint={eff.prBase || 'nhánh tích hợp'} onChange={v => { setNotice(''); setDraft(v); }} />}
          </section>
          {notice && <p className="wf-notice" role="status">{notice}</p>}
        </div>
      )}
    </Modal>
  );
}
