import React, { useEffect, useState } from 'react';
import { AlertCircle, Workflow, Save, Undo2, GitMerge } from 'lucide-react';
import Button from '../ui/Button.jsx';
import WorkflowEditor from './WorkflowEditor.jsx';
import { platform } from '../../lib/platform.js';
import { workflowProblem } from '../../lib/review.js';
import { cleanConfig } from '../../lib/workflow.js';
import PipelineEditor from './PipelineEditor.jsx';
import { defaultPipeline, normalizePipeline, pipelineProblem } from '../../lib/pipeline.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function ProjectGatesTab({ pid, canManage }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    platform.workflow(pid).then(w => { setSaved(w); setDraft(w); }, e => setErr(e.message));
  }, [pid]);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const w = await platform.setWorkflow(pid, draft.map(x => ({ ...x, config: cleanConfig(x.step, x.config) })));
      setSaved(w); setDraft(w);
      setNotice('Đã lưu. Quy trình mới áp dụng cho các tính năng giao từ bây giờ; tính năng đang chạy giữ quy trình cũ.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!draft) {
    return err ? (
      <div className="alert-banner err" role="alert">
        <AlertCircle size={16} />
        <div className="alert-banner-content">{err}</div>
      </div>
    ) : (
      <p className="muted-empty">Đang tải quy trình…</p>
    );
  }

  const dirty = !same(draft, saved);
  const problem = workflowProblem(draft);

  return (
    <div className="pj-tab-stack">
      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      <div className="card-panel">
        <div className="card-header">
          <div className="card-header-title">
            <Workflow size={17} style={{ color: 'var(--accent-text)' }} />
            <span>Quy trình làm tính năng của dự án</span>
          </div>
        </div>

        <WorkflowEditor value={draft} pid={pid} disabled={!canManage} onChange={w => { setNotice(''); setDraft(w); }} />

        {canManage && (
          <div className="wf-actions">
            {problem ? <span className="m-err" style={{ margin: 0 }}>{problem}</span>
              : notice ? <span className="wf-notice" role="status">{notice}</span>
              : dirty ? <span className="wf-notice">Có thay đổi chưa lưu.</span> : <span />}
            <span className="wf-actions-btns">
              <Button size="sm" icon={Undo2} disabled={!dirty || busy} onClick={() => { setDraft(saved); setNotice(''); }}>Hoàn tác</Button>
              <Button size="sm" variant="primary" icon={Save} disabled={!dirty || busy || !!problem} onClick={save}>
                {busy ? 'Đang lưu…' : 'Lưu quy trình'}
              </Button>
            </span>
          </div>
        )}

        <div className="pj-card-footnote">
          Bấm một bước trên sơ đồ để đặt người duyệt, model AI và giới hạn của bước đó. Cấu hình được lưu cho dự án;
          mỗi tính năng khi bắt đầu giữ nguyên bản cấu hình lúc đó (đổi quy trình không ảnh hưởng tính năng đang chạy).
          {' '}<b>Tự duyệt</b> chỉ cho qua khi CI/test xanh. Lane áp dụng thật: giới hạn phút, ngân sách, thử lại, dừng quy trình,
          thiếu file đầu vào thì dừng trước khi tốn token.
        </div>
      </div>
      <ProjectPipeline pid={pid} canManage={canManage} />
    </div>
  );
}

/** The project's default lane pipeline after the code (every lane follows it unless it overrides). */
function ProjectPipeline({ pid, canManage }) {
  const [saved, setSaved] = useState(null);   // {} = the lane profile decides
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    platform.delivery(pid).then(d => { setSaved(d || {}); setDraft(d && Object.keys(d).length ? { ...defaultPipeline(), ...d } : null); },
      e => setErr(e.message));
  }, [pid]);
  if (saved == null) return err ? <p className="m-err">{err}</p> : null;
  const own = !!draft;
  const dirty = JSON.stringify(own ? normalizeSafe(draft) : {}) !== JSON.stringify(saved);
  const problem = own ? pipelineProblem(draft) : '';
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const d = await platform.setDelivery(pid, own ? normalizePipeline(draft) : {});
      setSaved(d || {}); setDraft(d && Object.keys(d).length ? { ...defaultPipeline(), ...d } : null);
      setNotice('Đã lưu. Áp dụng cho các tính năng giao từ bây giờ; lane nào có quy trình riêng vẫn theo quy trình của lane đó.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div className="card-panel">
      <div className="card-header">
        <div className="card-header-title">
          <GitMerge size={17} style={{ color: 'var(--accent-text)' }} />
          <span>Sau khi code xong — mặc định cho mọi lane của dự án</span>
        </div>
      </div>
      <div className="pl-body">
        <label className="wz-check">
          <input type="checkbox" checked={own} disabled={!canManage}
            onChange={e => { setNotice(''); setDraft(e.target.checked ? { ...defaultPipeline(), ...saved } : null); }} />
          <span>Đặt quy trình riêng cho dự án (bỏ chọn = theo cấu hình gốc trong profile của dự án)</span>
        </label>
        {own && <PipelineEditor value={draft} disabled={!canManage} idPrefix={`pj-${pid}`} onChange={v => { setNotice(''); setDraft(v); }} />}
      </div>
      {canManage && (
        <div className="wf-actions">
          {err ? <span className="m-err" style={{ margin: 0 }}>{err}</span>
            : problem ? <span className="faint">Sửa lỗi ở trên để lưu.</span>
            : notice ? <span className="wf-notice" role="status">{notice}</span>
            : dirty ? <span className="wf-notice">Có thay đổi chưa lưu.</span> : <span />}
          <span className="wf-actions-btns">
            <Button size="sm" icon={Undo2} disabled={!dirty || busy} onClick={() => { setDraft(Object.keys(saved).length ? { ...defaultPipeline(), ...saved } : null); setNotice(''); }}>Hoàn tác</Button>
            <Button size="sm" variant="primary" icon={Save} disabled={!dirty || busy || !!problem} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu'}</Button>
          </span>
        </div>
      )}
      <div className="pj-card-footnote">
        Từng lane có thể ghi đè ở thẻ lane → <b>Quy trình</b>. Thứ tự: lane &gt; dự án &gt; profile. Mỗi tính năng giữ quy trình của dự án lúc bắt đầu.
      </div>
    </div>
  );
}

const normalizeSafe = d => { try { return normalizePipeline(d); } catch { return d; } };
