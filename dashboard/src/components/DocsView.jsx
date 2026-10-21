import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, Download, History, PencilLine,
  FileText, Search, Calendar, Layers
} from 'lucide-react';
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
const RUN_STATUS = {
  RUNNING: 'Đang chạy',
  ACTIVE: 'Đang chạy',
  WAITING_REVIEW: 'Chờ duyệt',
  AWAITING_REVIEW: 'Chờ duyệt',
  DONE: 'Hoàn tất',
  COMPLETED: 'Hoàn tất',
  APPROVED: 'Đã duyệt',
  CANCELLED: 'Đã huỷ',
  RELEASED: 'Đã phát hành',
};
const RUN_TONE = {
  RUNNING: 'accent',
  ACTIVE: 'accent',
  WAITING_REVIEW: 'warn',
  AWAITING_REVIEW: 'warn',
  DONE: 'ok',
  COMPLETED: 'ok',
  APPROVED: 'ok',
  CANCELLED: 'neutral',
};

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
    platform.revision(runId, rev.id).then(d => {
      setDetail(d);
      setDoc(finalDocuments(d)[0]?.name || '');
    }, e => setErr(e.message));
  }, [open, detail, rev, runId]);

  const docs = detail ? finalDocuments(detail) : [];
  const cur = docs.find(d => d.name === doc);
  const images = (detail?.images || []).filter(im => safeImageSrc(im.path));
  const who = rev?.decidedBy ? (users[rev.decidedBy]?.fullName || users[rev.decidedBy]?.email || rev.decidedBy) : '';

  return (
    <div className={`dc-step${open ? ' open' : ''}`}>
      <button
        type="button"
        className="dc-step-head"
        aria-expanded={open}
        disabled={!rev}
        onClick={() => setOpen(o => !o)}>
        <span className="dc-step-chevron">
          {rev ? (open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />) : null}
        </span>
        <span className="dc-step-name">{STEP_LABEL[row.step] || row.step}</span>
        <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{STATUS_LABEL[row.status] || row.status}</Badge>
        {rev && (
          <span className="dc-step-ver">
            bản {rev.revisionNo}{row.count > 1 ? ` / ${row.count} lần nộp` : ''}
          </span>
        )}
        {row.approved && who && (
          <span className="dc-who">
            duyệt bởi <b>{who}</b>
            {rev.decidedAsRole ? ` · ${ROLE_LABEL[rev.decidedAsRole] || rev.decidedAsRole}` : ''}
            {' · '}{fmt(rev.decidedAt)}
          </span>
        )}
        {!rev && (
          <span className="dc-step-empty">
            {row.status === 'SKIPPED' ? 'bỏ qua (không có giao diện)' : 'chưa có tài liệu'}
          </span>
        )}
      </button>

      {open && rev && (
        <div className="dc-body">
          {err && <p className="m-err">{err}</p>}
          {!detail && !err && <p className="muted-empty">Đang tải nội dung tài liệu…</p>}
          {detail && (
            <>
              {rev.summary && (
                <div className="rv-box">
                  <h2>Tóm tắt của AI</h2>
                  <Markdown text={rev.summary} />
                </div>
              )}
              {rev.feedback && <p className="rv-sub">Góp ý khi duyệt: {rev.feedback}</p>}
              {docs.length > 0 && (
                <div className="rv-box">
                  <Tabs value={doc} onChange={setDoc} items={docs.map(d => ({ id: d.name, label: d.name }))} />
                  {cur && (
                    <>
                      <div className="dc-doc-tools">
                        {cur.edited && (
                          <Badge tone="accent">
                            <PencilLine size={12} aria-hidden="true" /> người duyệt đã sửa
                          </Badge>
                        )}
                        {!row.approved && <Badge tone="warn">bản chưa được duyệt</Badge>}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Download}
                          onClick={() => download(mdDownloadName(title, row.step, cur.name), cur.text)}>
                          Tải về (.md)
                        </Button>
                      </div>
                      <div className="dc-doc-content">
                        {cur.name.endsWith('.md') ? <Markdown text={cur.text} /> : <pre className="diff">{cur.text}</pre>}
                      </div>
                    </>
                  )}
                </div>
              )}
              {images.length > 0 && (
                <div className="rv-box">
                  <h2>Hình ảnh đính kèm ({images.length})</h2>
                  <div className="rv-imgs">
                    {images.map((im, i) => (
                      <figure key={i} style={{ margin: 0 }}>
                        <a href={im.path} target="_blank" rel="noreferrer">
                          <img src={im.path} alt={im.caption || ''} loading="lazy" />
                        </a>
                        {im.caption && <figcaption className="rv-sub">{im.caption}</figcaption>}
                      </figure>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Button size="sm" variant="secondary" icon={History} onClick={() => onHistory(runId)}>
                  Xem lịch sử các bản & so sánh
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocsView({ initialRunId, onOpenRun, activeProjectId, onSelectProject }) {
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState('');
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(initialRunId || '');
  const [view, setView] = useState(null);
  const [users, setUsers] = useState({});
  const [query, setQuery] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const ps = await platform.projects();
        setProjects(ps);
        // Follow the project picked in the header; a run opened from elsewhere brings its own project.
        let p = ps.some(x => x.id === activeProjectId) ? activeProjectId : ps[0]?.id || '';
        if (initialRunId) {
          const v = await platform.run(initialRunId);
          p = v.run.projectId || p;
        }
        setPid(p);
        if (p && p !== activeProjectId) onSelectProject?.(p);
      } catch (e) { setErr(e.message); }
    })();
  }, [initialRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The header switcher changed project: show that project's documents.
  useEffect(() => {
    if (activeProjectId && activeProjectId !== 'ALL' && projects.some(x => x.id === activeProjectId) && activeProjectId !== pid) {
      setPid(activeProjectId); setRunId('');
    }
  }, [activeProjectId, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pid) return;
    platform.projectRuns(pid).then(rs => {
      setRuns(rs);
      setRunId(id => (id && rs.some(r => r.id === id) ? id : rs[0]?.id || ''));
    }, e => setErr(e.message));
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

  const filteredRuns = useMemo(() => {
    if (!query.trim()) return runs;
    const q = query.toLowerCase();
    return runs.filter(r => (r.title || '').toLowerCase().includes(q));
  }, [runs, query]);

  return (
    <section className="dc-workspace" aria-labelledby="dc-title">
      <div className="dc-header">
        <div className="dc-header-titles">
          <h1 id="dc-title" className="rv-h1">
            <FileText size={20} strokeWidth={1.85} style={{ color: 'var(--accent-text)' }} />
            <span>Tài liệu đã duyệt</span>
          </h1>
          <p className="rv-page-desc">
            Yêu cầu, nghiệp vụ, kế hoạch, thiết kế và luật AI đã duyệt — theo từng tính năng của dự án đang xem.
          </p>
        </div>

      </div>

      {err && <p className="m-err">{err}</p>}

      {!projects.length && !err ? (
        <div className="modern-empty-state">
          <div className="modern-empty-icon"><FileText size={22} /></div>
          <div className="modern-empty-title">Bạn chưa là thành viên dự án nào</div>
          <div className="modern-empty-desc">Hãy tạo dự án mới hoặc nhờ quản trị viên thêm bạn vào dự án để xem tài liệu.</div>
        </div>
      ) : (
        <div className="dc-layout">
          {/* Left Panel: Feature / Run List */}
          <aside className="dc-sidebar" aria-label="Danh sách tính năng">
            <div className="dc-sidebar-head">
              <span className="dc-sidebar-title">
                <Layers size={14} />
                <span>Tính năng & Phiên ({runs.length})</span>
              </span>
            </div>

            {runs.length > 3 && (
              <div className="dc-sidebar-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Tìm tài liệu tính năng…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
            )}

            <div className="dc-run-list">
              {filteredRuns.map(r => {
                const active = r.id === runId;
                const statusLabel = RUN_STATUS[r.status] || r.status;
                const stepLabel = r.currentStep ? STEP_LABEL[r.currentStep] || r.currentStep : '';
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`dc-run-item${active ? ' active' : ''}`}
                    onClick={() => setRunId(r.id)}>
                    <div className="dc-run-item-top">
                      <span className="dc-run-item-title">{r.title}</span>
                    </div>
                    <div className="dc-run-item-meta">
                      <Badge tone={RUN_TONE[r.status] || 'neutral'}>{statusLabel}</Badge>
                      {stepLabel && <span className="dc-run-item-step">{stepLabel}</span>}
                    </div>
                  </button>
                );
              })}
              {!filteredRuns.length && (
                <p className="muted-empty" style={{ padding: '16px 12px', margin: 0, textAlign: 'center' }}>
                  {runs.length === 0 ? 'Dự án chưa có tài liệu tính năng nào.' : 'Không tìm thấy tính năng phù hợp.'}
                </p>
              )}
            </div>
          </aside>

          {/* Right Panel: Selected Run Document Steps */}
          <div className="dc-main">
            {view ? (
              <div className="dc-detail-card">
                <div className="dc-detail-header">
                  <div className="dc-detail-titles">
                    <h2 className="dc-detail-h2">{view.run.title}</h2>
                    <div className="dc-detail-sub">
                      <span className="dc-detail-date">
                        <Calendar size={13} />
                        <span>Tạo lúc {fmt(view.run.createdAt)}</span>
                      </span>
                      <Badge tone={RUN_TONE[view.run.status] || 'neutral'}>
                        {RUN_STATUS[view.run.status] || view.run.status}
                      </Badge>
                      {view.run.currentStep && (
                        <span className="dc-detail-step-pill">
                          Bước hiện tại: <b>{STEP_LABEL[view.run.currentStep] || view.run.currentStep}</b>
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" icon={History} onClick={() => onOpenRun(view.run.id)}>
                    Lịch sử & Duyệt
                  </Button>
                </div>

                <div className="dc-steps">
                  {finalRevisions(view).map(row => (
                    <StepCard
                      key={row.step + (row.revision?.id || '')}
                      runId={view.run.id}
                      title={view.run.title}
                      row={row}
                      users={users}
                      onHistory={onOpenRun}
                    />
                  ))}
                </div>

                <p className="dc-footnote">
                  Mỗi bước hiển thị bản tài liệu mới nhất hoặc bản đã duyệt cuối cùng (bao gồm cả phần người duyệt chỉnh sửa trực tiếp). Muốn xem các bản cũ và so sánh diff, bấm <b>“Lịch sử & Duyệt”</b>.
                </p>
              </div>
            ) : (
              runs.length > 0 && <p className="muted-empty">Đang tải tài liệu…</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
