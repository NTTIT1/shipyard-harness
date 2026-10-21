import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Undo2, MessageSquareWarning, Ban, Pencil, Eye, GitCompare, RotateCcw } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import Markdown from './Markdown.jsx';
import { platform } from '../lib/platform.js';
import { runSteps, STEP_LABEL, ROLE_LABEL, STATUS_LABEL, ACTION_LABEL, validateDecision, sendBackTargets, pendingRevision, previousRevision, lineDiff, inboxItemFor, hasUiToSend, safeImageSrc } from '../lib/review.js';

function Stepper({ steps, current }) {
  return (
    <ol className="stepper" aria-label="Tiến trình">
      {runSteps(steps).map(s => {
        const st = (steps.find(x => x.step === s) || {}).status || 'PENDING';
        return <li key={s} className={`${st}${s === current ? ' on' : ''}`} aria-current={s === current ? 'step' : undefined}>
          {STEP_LABEL[s]} <span className="faint">· {STATUS_LABEL[st]}</span></li>;
      })}
    </ol>
  );
}

function ZoomedImage({ src, onClose }) {
  const btn = React.useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    btn.current?.focus();
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => { document.removeEventListener('keydown', h); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="rv-zoom" onClick={onClose} role="dialog" aria-modal="true" aria-label="Ảnh phóng to">
      <button ref={btn} className="sh-x" onClick={onClose} aria-label="Đóng (Esc)">✕</button>
      <img src={src} alt="" />
    </div>
  );
}

function Diff({ before, after }) {
  const d = useMemo(() => lineDiff(before || '', after || ''), [before, after]);
  return <pre className="diff">{d.map((x, i) => <div key={i} className={x.t}>{x.t === 'add' ? '+ ' : x.t === 'del' ? '- ' : '  '}{x.s}</div>)}</pre>;
}

export default function ReviewView({ runId, approvalId, inboxItems, onBack, onDecided }) {
  const [view, setView] = useState(null);
  const [revId, setRevId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [prev, setPrev] = useState(null);
  const [doc, setDoc] = useState('');
  const [mode, setMode] = useState('view');
  const [edits, setEdits] = useState({});
  const [feedback, setFeedback] = useState('');
  const [sendBackTo, setSendBackTo] = useState('');
  const [hasUi, setHasUi] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const v = await platform.run(runId);
      setView(v);
      const pick = (approvalId && v.revisions.find(r => r.approvalId === approvalId)) || pendingRevision(v) || v.revisions[v.revisions.length - 1];
      setRevId(pick ? pick.id : null);
    } catch (e) { setErr(e.message); }
  }, [runId, approvalId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!view || !revId) return;
    const rev = view.revisions.find(r => r.id === revId);
    const p = previousRevision(view, rev);
    let alive = true;
    Promise.all([platform.revision(runId, revId), p ? platform.revision(runId, p.id) : null]).then(([d, pd]) => {
      if (!alive) return;
      setDetail(d); setPrev(pd);
      setDoc(Object.keys(d.documents || {})[0] || '');
      setEdits({}); setMode('view'); setFeedback(''); setSendBackTo(''); setHasUi(view.run.hasUi ?? null);
    }).catch(e => setErr(e.message));
    return () => { alive = false; };
  }, [view, revId, runId]);

  if (err && !view) return <section className="rv-page"><Button icon={ArrowLeft} onClick={onBack}>Quay lại</Button><p className="m-err">{err}</p></section>;
  if (!view || !detail) return <section className="rv-page"><p className="muted-empty">Đang tải…</p></section>;

  const rev = detail.revision;
  const pending = rev.approvalStatus === 'PENDING';
  const inboxItem = inboxItemFor(inboxItems, rev);
  const canDecide = pending && !!inboxItem;
  const docs = { ...(detail.documents || {}) };
  const names = Object.keys(docs);
  const current = doc && (edits[doc] ?? docs[doc]);
  const prevText = prev?.documents?.[doc] ?? prev?.approvedDocuments?.[doc];
  const steps = view.steps;
  const meta = detail.meta || {};

  const decide = async action => {
    const realEdits = Object.fromEntries(Object.entries(edits).filter(([k, v]) => v !== docs[k]));
    const problem = validateDecision({ action, feedback, sendBackTo, edits: realEdits, currentStep: rev.step, steps });
    if (problem) { setMsg({ tone: 'warn', text: problem }); return; }
    if (action === 'CANCEL' && !window.confirm('Huỷ cả tính năng này? AI sẽ dừng lại.')) return;
    setBusy(true); setMsg(null);
    try {
      const body = { action, step: rev.step, feedback: feedback.trim() || undefined };
      if (Object.keys(realEdits).length) body.editedDocuments = realEdits;
      if (action === 'SEND_BACK') body.sendBackTo = sendBackTo;
      const ui = rev.step === 'ARCH' && action === 'APPROVE' ? hasUiToSend(view.run.hasUi ?? null, hasUi) : undefined;
      if (ui !== undefined) body.hasUi = ui;
      const r = await platform.decide(rev.approvalId, body);
      setMsg(r.resumed
        ? { tone: 'ok', text: `Đã ${ACTION_LABEL[action].toLowerCase()} — lane đã được đánh thức để làm tiếp.` }
        : { tone: 'warn', text: `Đã ${ACTION_LABEL[action].toLowerCase()}. Không đánh thức được lane trên máy này — mở lane và bấm “Tiếp tục”.` });
      onDecided?.();
      await load();
    } catch (e) {
      setMsg({ tone: 'warn', text: e.status === 409 ? 'Bước này vừa được người khác quyết định — đã tải lại.'
        : e.status === 413 ? 'Tài liệu sửa quá lớn để gửi.' : e.message });
      if (e.status === 409) { onDecided?.(); await load(); }
    } finally { setBusy(false); }
  };

  return (
    <section className="rv-page" aria-labelledby="rv-title">
      <div><Button variant="ghost" icon={ArrowLeft} onClick={onBack}>Hộp duyệt</Button></div>
      <div className="rv-head">
        <div>
          <h1 id="rv-title" className="rv-h1">{view.run.title}</h1>
          <p className="rv-sub">{STEP_LABEL[rev.step]} · bản {rev.revisionNo} · cần vai trò {ROLE_LABEL[detail.requiredRole] || detail.requiredRole}
            {inboxItem?.decideAs === 'OWNER_FALLBACK' && ' · bạn duyệt thay với tư cách Owner'}</p>
        </div>
        <label className="rv-sub">Bản sửa đổi{' '}
          <select value={revId} onChange={e => {
            const dirty = Object.keys(edits).some(k => edits[k] !== docs[k]);
            if (!dirty || window.confirm('Bỏ các chỗ đã sửa tay chưa gửi?')) setRevId(e.target.value);
          }}>
            {view.revisions.map(r => <option key={r.id} value={r.id}>{STEP_LABEL[r.step]} · bản {r.revisionNo} · {r.approvalStatus || ''}</option>)}
          </select>
        </label>
      </div>
      <Stepper steps={steps} current={view.run.currentStep || rev.step} />

      <div className="rv-box"><h2>Tóm tắt của AI</h2><Markdown text={rev.summary} />
        {rev.feedback && !pending && <p className="rv-sub">Góp ý khi duyệt ({ROLE_LABEL[rev.decidedAsRole] || rev.decidedAsRole}): {rev.feedback}</p>}
      </div>

      {(detail.contextUsed || []).length > 0 && (
        <details className="rv-box"><summary>AI đã dùng {detail.contextUsed.length} mục ngữ cảnh</summary>
          <ul className="rv-ctx">{detail.contextUsed.map((c, i) => <li key={i}>[{c.kind}] {c.title} <span className="faint">({c.via})</span></li>)}</ul>
        </details>
      )}

      {names.length > 0 && (
        <div className="rv-box">
          <h2>Tài liệu</h2>
          <Tabs value={doc} onChange={setDoc} items={names.map(n => ({ id: n, label: n + (edits[n] !== undefined && edits[n] !== docs[n] ? ' •' : '') }))} />
          <div className="rv-doc-tools">
            <Button size="sm" variant={mode === 'view' ? 'secondary' : 'ghost'} icon={Eye} onClick={() => setMode('view')}>Xem</Button>
            {canDecide && <Button size="sm" variant={mode === 'edit' ? 'secondary' : 'ghost'} icon={Pencil} onClick={() => setMode('edit')}>Sửa</Button>}
            {prevText !== undefined && <Button size="sm" variant={mode === 'diff' ? 'secondary' : 'ghost'} icon={GitCompare} onClick={() => setMode('diff')}>So với bản trước</Button>}
            {edits[doc] !== undefined && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setEdits(({ [doc]: _, ...rest }) => rest)}>Bỏ bản sửa</Button>}
          </div>
          {mode === 'view' && (doc.endsWith('.md') ? <Markdown text={current} /> : <pre className="diff">{current}</pre>)}
          {mode === 'edit' && (
            <div className="rv-edit">
              <textarea aria-label={`Sửa ${doc}`} value={current} onChange={e => setEdits(x => ({ ...x, [doc]: e.target.value }))} />
              {doc.endsWith('.md') ? <Markdown text={current} /> : <pre className="diff">{current}</pre>}
            </div>
          )}
          {mode === 'diff' && <Diff before={prevText} after={current} />}
        </div>
      )}

      {(detail.images || []).length > 0 && (
        <div className="rv-box"><h2>Hình ảnh ({detail.images.length})</h2>
          <div className="rv-imgs">
            {detail.images.filter(im => safeImageSrc(im.path)).map((im, i) => (
              <figure key={i} style={{ margin: 0 }}>
                <button onClick={() => setZoom(im.path)} aria-label={`Phóng to ${im.caption || im.path}`}><img src={im.path} alt={im.caption || ''} loading="lazy" /></button>
                <figcaption>{im.caption || im.path.split('/').pop()}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
      {zoom && <ZoomedImage src={zoom} onClose={() => setZoom(null)} />}

      {Object.keys(meta).length > 0 && (
        <div className="rv-box"><h2>Thông tin kỹ thuật</h2>
          <dl className="kv">{Object.entries(meta).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd></React.Fragment>)}</dl>
        </div>
      )}

      {canDecide ? (
        <div className="rv-actions">
          <textarea aria-label="Góp ý cho AI" placeholder="Góp ý cho AI (bắt buộc khi yêu cầu sửa / trả về)…" value={feedback} onChange={e => setFeedback(e.target.value)} />
          {rev.step === 'ARCH' && (
            <label className="rv-sub"><input type="checkbox" checked={!!hasUi} onChange={e => setHasUi(e.target.checked)} /> Tính năng có giao diện (cần bước Thiết kế)</label>
          )}
          {rev.step === 'BLUEPRINT' && (
            <p className="rv-sub">Dự án chưa có code. <b>Duyệt</b> → Shipyard tạo khung dự án theo bản kiến trúc này (lưu ở <code>docs/architecture.md</code>);
              {' '}<b>Yêu cầu sửa</b> → kiến trúc sư AI soạn lại; <b>Huỷ</b> → không tạo khung (dự án đã đăng ký vẫn còn, có thể xoá).</p>
          )}
          <div className="rv-btns">
            <Button variant="primary" icon={Check} disabled={busy} onClick={() => decide('APPROVE')}>
              {Object.keys(edits).some(k => edits[k] !== docs[k]) ? 'Duyệt kèm bản đã sửa' : 'Duyệt'}</Button>
            <Button icon={MessageSquareWarning} disabled={busy} onClick={() => decide('REQUEST_CHANGES')}>Yêu cầu sửa</Button>
            <select aria-label="Trả về bước" value={sendBackTo} onChange={e => setSendBackTo(e.target.value)}>
              <option value="">Trả về bước…</option>
              {sendBackTargets(rev.step, steps).map(s => <option key={s} value={s}>{STEP_LABEL[s]}</option>)}
            </select>
            <Button icon={Undo2} disabled={busy || !sendBackTo} onClick={() => decide('SEND_BACK')}>Trả về</Button>
            <Button variant="ghost" icon={Ban} disabled={busy} onClick={() => decide('CANCEL')}>{rev.step === 'BLUEPRINT' ? 'Huỷ' : 'Huỷ tính năng'}</Button>
          </div>
          {msg && <p className={`rv-note ${msg.tone}`} role="status">{msg.text}</p>}
        </div>
      ) : (
        <div className="rv-box">
          <Badge tone={pending ? 'warn' : 'neutral'}>{pending ? 'Đang chờ người có vai trò phù hợp duyệt' : `Đã quyết định: ${rev.approvalStatus || '—'}`}</Badge>
          {msg && <p className={`rv-note ${msg.tone}`} role="status">{msg.text}</p>}
        </div>
      )}
    </section>
  );
}
