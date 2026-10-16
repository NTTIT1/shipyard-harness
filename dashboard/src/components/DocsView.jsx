import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, History, PencilLine } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import Markdown from './Markdown.jsx';
import { platform } from '../lib/platform.js';
import { STEP_LABEL, ROLE_LABEL, STATUS_LABEL, safeImageSrc } from '../lib/review.js';
import { finalRevisions, finalDocuments, mdDownloadName } from '../lib/docs.js';
import '../styles/docs.css';

const fmt = iso => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const STATUS_TONE = { APPROVED: 'ok', AWAITING_REVIEW: 'warn', AI_WORKING: 'accent', SKIPPED: 'neutral', PENDING: 'neutral' };
const RUN_STATUS = { RUNNING: 'đang chạy', ACTIVE: 'đang chạy', DONE: 'hoàn tất', COMPLETED: 'hoàn tất', CANCELLED: 'đã huỷ', RELEASED: 'đã phát hành' };

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StepCard({ runId, title, row, users, onHistory }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [doc, setDoc] = useState('');
  const [err, setErr] = useState('');
  const rev = row.revision;
  useEffect(() => {
    if (!open || detail || !rev) return;
    platform.revision(runId, rev.id).then(d => { setDetail(d); setDoc(finalDocuments(d)[0]?.name || ''); }, e => setErr(e.message));
  }, [open, detail, rev, runId]);
  const docs = detail ? finalDocuments(detail) : [];
  const cur = docs.find(d => d.name === doc);
  const images = (detail?.images || []).filter(im => safeImageSrc(im.path));
  const who = rev?.decidedBy ? (users[rev.decidedBy]?.fullName || users[rev.decidedBy]?.email || rev.decidedBy) : '';
  return (
    <div className={`dc-step${open ? ' open' : ''}`}>
      <button className="dc-step-head" aria-expanded={open} disabled={!rev} onClick={() => setOpen(o => !o)}>
        {rev ? (open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />) : <span className="dc-gap" />}
        <span className="dc-step-name">{STEP_LABEL[row.step]}</span>
        <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{STATUS_LABEL[row.status] || row.status}</Badge>
        {rev && <span className="faint">bản {rev.revisionNo}{row.count > 1 ? ` / ${row.count} lần nộp` : ''}</span>}
        {row.approved && who && <span className="dc-who">duyệt bởi <b>{who}</b>{rev.decidedAsRole ? ` · ${ROLE_LABEL[rev.decidedAsRole] || rev.decidedAsRole}` : ''} · {fmt(rev.decidedAt)}</span>}
        {!rev && <span className="faint">{row.status === 'SKIPPED' ? 'bỏ qua (không có giao diện)' : 'chưa có'}</span>}
      </button>
      {open && rev && (
        <div className="dc-body">
          {err && <p className="m-err">{err}</p>}
          {!detail && !err && <p className="muted-empty">Đang tải…</p>}
          {detail && (<>
            {rev.summary && <div className="rv-box"><h2>Tóm tắt của AI</h2><Markdown text={rev.summary} /></div>}
            {rev.feedback && <p className="rv-sub">Góp ý khi duyệt: {rev.feedback}</p>}
            {docs.length > 0 && (
              <div className="rv-box">
                <Tabs value={doc} onChange={setDoc} items={docs.map(d => ({ id: d.name, label: d.name }))} />
                {cur && (<>
                  <div className="dc-doc-tools">
                    {cur.edited && <Badge tone="accent"><PencilLine size={12} aria-hidden="true" /> người duyệt đã sửa</Badge>}
                    {!row.approved && <Badge tone="warn">bản chưa được duyệt</Badge>}
                    <Button size="sm" variant="ghost" icon={Download} onClick={() => download(mdDownloadName(title, row.step, cur.name), cur.text)}>Tải về</Button>
                  </div>
                  {cur.name.endsWith('.md') ? <Markdown text={cur.text} /> : <pre className="diff">{cur.text}</pre>}
                </>)}
              </div>
            )}
            {images.length > 0 && (
              <div className="rv-box"><h2>Hình ảnh ({images.length})</h2>
                <div className="rv-imgs">{images.map((im, i) => (
                  <figure key={i} style={{ margin: 0 }}>
                    <a href={im.path} target="_blank" rel="noreferrer"><img src={im.path} alt={im.caption || ''} loading="lazy" /></a>
                    {im.caption && <figcaption className="rv-sub">{im.caption}</figcaption>}
                  </figure>))}
                </div>
              </div>
            )}
            <Button size="sm" variant="ghost" icon={History} onClick={() => onHistory(runId)}>Xem lịch sử các bản & so sánh</Button>
          </>)}
        </div>
      )}
    </div>
  );
}

export default function DocsView({ initialRunId, onOpenRun }) {
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState('');
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(initialRunId || '');
  const [view, setView] = useState(null);
  const [users, setUsers] = useState({});
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const ps = await platform.projects();
        setProjects(ps);
        let p = ps[0]?.id || '';
        if (initialRunId) { const v = await platform.run(initialRunId); p = v.run.projectId || p; }
        setPid(p);
      } catch (e) { setErr(e.message); }
    })();
  }, [initialRunId]);
  useEffect(() => {
    if (!pid) return;
    platform.projectRuns(pid).then(rs => { setRuns(rs); setRunId(id => (id && rs.some(r => r.id === id) ? id : rs[0]?.id || '')); }, e => setErr(e.message));
  }, [pid]);
  const loadRun = useCallback(async id => {
    if (!id) { setView(null); return; }
    try {
      const v = await platform.run(id);
      setView(v);
      const ids = [...new Set(v.revisions.map(r => r.decidedBy).filter(Boolean))];
      const us = await platform.users(ids);
      setUsers(Object.fromEntries(us.map(u => [u.id, u])));
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { loadRun(runId); }, [runId, loadRun]);

  return (
    <section className="rv-page" aria-labelledby="dc-title">
      <div className="rv-head">
        <h1 id="dc-title" className="rv-h1">Tài liệu</h1>
        {projects.length > 1 && (
          <select className="msel" aria-label="Dự án" value={pid} onChange={e => { setPid(e.target.value); setRunId(''); }}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      {err && <p className="m-err">{err}</p>}
      {!projects.length && !err ? <p className="muted-empty">Bạn chưa là thành viên dự án nào.</p> : (
        <div className="pj-grid">
          <nav className="pj-list" aria-label="Tính năng">
            {runs.map(r => (
              <Button key={r.id} variant={r.id === runId ? 'secondary' : 'ghost'} className="dc-run" onClick={() => setRunId(r.id)}>
                <span className="dc-run-title">{r.title}</span>
                <span className="faint">{RUN_STATUS[r.status] || r.status}{r.currentStep ? ` · ${STEP_LABEL[r.currentStep]}` : ''}</span>
              </Button>
            ))}
            {!runs.length && <p className="muted-empty">Dự án chưa có tính năng nào.</p>}
          </nav>
          {view ? (
            <div className="rv-page">
              <div><strong>{view.run.title}</strong> <span className="faint">· tạo {fmt(view.run.createdAt)} · {RUN_STATUS[view.run.status] || view.run.status}</span></div>
              <div className="dc-steps">
                {finalRevisions(view).map(row => (
                  <StepCard key={row.step + (row.revision?.id || '')} runId={view.run.id} title={view.run.title} row={row} users={users} onHistory={onOpenRun} />
                ))}
              </div>
              <p className="rv-sub">Mỗi bước hiển thị bản đã duyệt cuối cùng (gồm cả phần người duyệt sửa trực tiếp). Muốn xem các bản cũ và so sánh, bấm “Xem lịch sử”.</p>
            </div>
          ) : runs.length > 0 && <p className="muted-empty">Đang tải…</p>}
        </div>
      )}
    </section>
  );
}
