import React, { useEffect, useState } from 'react';
import { AlertCircle, Workflow, Save, Undo2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import WorkflowEditor from './WorkflowEditor.jsx';
import { platform } from '../../lib/platform.js';
import { workflowProblem } from '../../lib/review.js';

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
      const w = await platform.setWorkflow(pid, draft);
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
          Kéo biểu tượng <b>⋮⋮</b> để đổi thứ tự các bước. <b>Cần người duyệt</b>: AI làm xong thì dừng chờ người có vai trò hoặc thành viên được chỉ định duyệt.
          {' '}<b>Tự duyệt</b>: tự qua khi kết quả xanh — test hoặc CI đỏ thì vẫn dừng chờ người. <b>Bỏ bước</b>: bước không chạy, bước sau làm từ yêu cầu gốc.
          {' '}Code chỉ bắt đầu khi mọi bước đứng trước đã qua. Khi giao việc, từng lane / tính năng vẫn có thể chọn khác.
        </div>
      </div>
    </div>
  );
}
