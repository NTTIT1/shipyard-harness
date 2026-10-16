import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Button from './ui/Button.jsx';
import Modal from './Modal.jsx';
import { platform } from '../lib/platform.js';
import { deleteConfirmMatches } from '../lib/projects.js';

// OWNER only. Deletes the project with its features, approvals, gate policy and AI memory.
export default function DeleteProjectButton({ project, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = deleteConfirmMatches(typed, project.slug);
  const close = () => { if (!busy) { setOpen(false); setTyped(''); setErr(''); } };
  const run = async () => {
    if (!ok) return;
    setBusy(true); setErr('');
    try { await platform.deleteProject(project.id, project.slug); setOpen(false); onDeleted?.(); }
    catch (e) { setErr(e.status === 503 ? 'Không xoá được dữ liệu ở dịch vụ khác — dự án vẫn còn, thử lại sau.' : e.message); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" variant="ghost" icon={Trash2} className="pj-delete" onClick={() => setOpen(true)}>Xoá dự án</Button>
      {open && (
        <Modal title={`Xoá dự án “${project.name}”?`} onClose={close}
          buttons={[{ label: 'Huỷ', fn: close, disabled: busy },
            { label: busy ? 'Đang xoá…' : 'Xoá vĩnh viễn', cls: 'warn', icon: Trash2, fn: run, disabled: !ok || busy }]}>
          <div className="pj-form" style={{ border: 0, padding: 0 }}>
            <p className="m-text">Thao tác này <b>không hoàn tác được</b>. Sẽ xoá: mọi tính năng và các bản AI đã nộp, lịch sử duyệt,
              cấu hình cổng duyệt, bộ nhớ AI của dự án và danh sách thành viên. Code trong repo và các lane không bị đụng tới —
              nhưng lane đang chạy tính năng của dự án này sẽ bị dừng.</p>
            <label className="rv-sub" htmlFor="pj-del-confirm">Gõ <b className="mono">{project.slug}</b> để xác nhận</label>
            <input id="pj-del-confirm" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') run(); }} />
            {err && <p className="m-err" role="alert">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
