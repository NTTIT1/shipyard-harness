import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import PipelineEditor from './projects/PipelineEditor.jsx';
import { fetchLanePipeline, saveLanePipeline, clearLanePipeline } from '../lib/api.js';
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
    <Modal title={`Quy trình của lane ${n} — sau khi code xong`} wide onClose={onClose} buttons={buttons}>
      {err && <p className="m-err" role="alert">{err}</p>}
      {!info ? (!err && <p className="muted-empty">Đang tải…</p>) : (
        <div className="pl-body">
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
