import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText, MessagesSquare, ClipboardList, Network, LayoutTemplate, ListChecks, X, ChevronLeft, ChevronRight, Palette, Monitor } from 'lucide-react';
import Button from './ui/Button.jsx';
import Markdown from './Markdown.jsx';
import { Mockups } from './studio/MockupViewer.jsx';
import { projectChat, featureState } from '../lib/studio.js';
import { docOutline, screenTitle, docSummary } from '../lib/projectdocs.js';
import '../styles/studio.css';
import '../styles/hub.css';
import '../styles/pdocs.css';
import { tr } from '../lib/i18n.js';

const SECTIONS = [
  { id: 'brief', icon: ClipboardList, label: 'Yêu cầu sản phẩm' },
  { id: 'architecture', icon: Network, label: 'Thiết kế hệ thống' },
  { id: 'ui', icon: LayoutTemplate, label: 'Giao diện' },
  { id: 'features', icon: ListChecks, label: 'Tính năng' },
];

/**
 * "Tài liệu sản phẩm": the project's approved documents as they stand now, on one screen — sections on the
 * left, the open one on the right (it scrolls on its own, its outline stays on top), screens as a gallery
 * that opens each one large. embedded: the first tab of "Bộ nhớ dự án".
 */
export default function ProjectDocsView({ pid, project, onOpenChat, embedded = false }) {
  const [docs, setDocs] = useState(null);
  const [section, setSection] = useState('brief');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!pid) return;
    setDocs(null); setErr('');
    projectChat.docs(pid).then(setDocs, e => setErr(e.message));
  }, [pid]);

  if (!pid) {
    return (
      <div className="modern-empty-state" style={{ minHeight: 280 }}>
        <div className="modern-empty-icon"><FileText size={24} /></div>
        <div className="modern-empty-title">{tr('Chọn một dự án ở thanh trên')}</div>
      </div>
    );
  }
  const empty = docs && !docs.brief && !docs.architecture;
  const list = docs?.list || [];
  const count = { ui: docs?.mockups.length || 0, features: list.length };
  const meta = {
    brief: docSummary(docs?.brief),
    architecture: tr('{0} mục', [docOutline(docs?.architecture).length]),
    ui: docs?.mockups.length ? tr('{0} màn hình', [docs.mockups.length]) : docs?.design ? tr('Hướng dẫn thiết kế') : tr('Chưa có'),
    features: list.length ? tr('{0} đã có · {1} chờ làm', [list.filter(f => f.status === 'done').length, list.filter(f => f.status !== 'done' && f.status !== 'dropped').length]) : tr('Chưa có'),
  };

  return (
    <section className={`pd${embedded ? ' pd-embedded' : ''}`} aria-label={tr('Tài liệu sản phẩm')}>
      {!embedded && (
        <header className="hub-head">
          <h1 className="pb-h1">{tr('Tài liệu dự án')}{project?.name ? ` · ${project.name}` : ''}</h1>
          {onOpenChat && <Button variant="secondary" icon={MessagesSquare} onClick={() => onOpenChat(pid)}>{tr('Mở chat dự án')}</Button>}
        </header>
      )}
      {err && <p className="m-err" role="alert">{err}</p>}
      {!docs && !err && <p className="faint">{tr('Đang tải…')}</p>}
      {empty && <p className="muted-empty">{tr('Dự án chưa có tài liệu đã duyệt. Thêm tính năng trong chat dự án: AI đọc code sẵn có rồi cùng bạn viết tài liệu.')}</p>}
      {docs && !empty && (
        <div className="pd-layout">
          <nav className="pd-rail" aria-label={tr('Các phần tài liệu')}>
            {SECTIONS.map(s => (
              <button key={s.id} type="button" className={`pd-rail-item${section === s.id ? ' on' : ''}`} aria-current={section === s.id ? 'page' : undefined}
                onClick={() => setSection(s.id)}>
                <s.icon size={16} className="pd-rail-icon" aria-hidden="true" />
                <span className="pd-rail-text">
                  <span className="pd-rail-name">{tr(s.label)}{count[s.id] ? <span className="pd-rail-n">{count[s.id]}</span> : null}</span>
                  {meta[s.id] && <span className="pd-rail-meta">{meta[s.id]}</span>}
                </span>
              </button>
            ))}
          </nav>
          <div className="pd-pane">
            {section === 'brief' && <DocPane key="brief" title={tr('Yêu cầu sản phẩm')} md={docs.brief} />}
            {section === 'architecture' && <DocPane key="arch" title={tr('Thiết kế hệ thống')} md={docs.architecture} />}
            {section === 'ui' && <UiPane docs={docs} />}
            {section === 'features' && <FeaturesPane features={list} />}
          </div>
        </div>
      )}
    </section>
  );
}

/** A long document: its outline as chips on a translucent bar that stays on top; a chip jumps to its section. */
function DocPane({ title, md }) {
  const body = useRef(null);
  const outline = docOutline(md);
  const jump = k => body.current?.querySelectorAll('.pd-read h2')[k]?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return (
    <div className="pd-doc" ref={body}>
      <div className="pd-bar">
        <h2 className="pd-title">{title}</h2>
        {outline.length > 1 && (
          <div className="pd-outline" role="list" aria-label={tr('Mục lục')}>
            {outline.map((h, k) => <button key={k} type="button" role="listitem" className="pd-chip" onClick={() => jump(k)}>{h}</button>)}
          </div>
        )}
      </div>
      <div className="pd-read">{md ? <Markdown text={md} /> : <p className="faint">{tr('Chưa có.')}</p>}</div>
    </div>
  );
}

/** Screens at a glance (live thumbnails), each opened large from where it sits; the design guide one switch away. */
function UiPane({ docs }) {
  const [view, setView] = useState(docs.mockups.length ? 'screens' : 'guide');
  const [open, setOpen] = useState(null);           // { index, origin }
  return (
    <div className="pd-doc">
      <div className="pd-bar">
        <h2 className="pd-title">{tr('Giao diện')}</h2>
        {docs.mockups.length > 0 && docs.design && (
          <div className="pd-seg" role="tablist" aria-label={tr('Chế độ xem giao diện')}>
            <button type="button" role="tab" aria-selected={view === 'screens'} className={view === 'screens' ? 'on' : ''} onClick={() => setView('screens')}>
              <Monitor size={13} aria-hidden="true" /> {tr('Màn hình ({0})', [docs.mockups.length])}
            </button>
            <button type="button" role="tab" aria-selected={view === 'guide'} className={view === 'guide' ? 'on' : ''} onClick={() => setView('guide')}>
              <Palette size={13} aria-hidden="true" /> {tr('Hướng dẫn thiết kế')}
            </button>
          </div>
        )}
      </div>
      {view === 'screens' && docs.mockups.length > 0 ? (
        <ul className="pd-gallery">
          {docs.mockups.map((m, k) => (
            <li key={m.name}>
              <button type="button" className="pd-shot" aria-label={tr('Xem lớn màn {0}', [screenTitle(m)])}
                onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setOpen({ index: k, origin: `${r.left + r.width / 2}px ${r.top + r.height / 2}px` }); }}>
                <Thumb html={m.html} title={screenTitle(m)} />
                <span className="pd-shot-name"><span className="pd-shot-n">{k + 1}</span>{screenTitle(m)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pd-read">{docs.design ? <Markdown text={docs.design} /> : <p className="faint">{tr('Chưa có hướng dẫn thiết kế.')}</p>}</div>
      )}
      {open && <ScreenSheet mockups={docs.mockups} start={open.index} origin={open.origin} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A live, scaled-down render of a screen (it lays out at desktop width, then shrinks to the card). */
function Thumb({ html, title }) {
  const box = useRef(null);
  const [scale, setScale] = useState(0.2);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <span className="pd-thumb" ref={box} aria-hidden="true">
      <iframe title={title} srcDoc={html} sandbox="" loading="lazy" tabIndex={-1} style={{ transform: `scale(${scale})` }} />
    </span>
  );
}

/** The large viewer: grows out of the card it came from, dims the page, ← → between screens, Esc closes. */
function ScreenSheet({ mockups, start, origin, onClose }) {
  const [i, setI] = useState(start);
  const [shown, setShown] = useState(false);
  const closeBtn = useRef(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus();
    const key = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI(x => Math.min(x + 1, mockups.length - 1));
      if (e.key === 'ArrowLeft') setI(x => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); };
  }, [mockups.length, onClose]);
  return (
    <div className={`pd-sheet-scrim${shown ? ' in' : ''}`}>
      {/* The stage covers the viewport, so the card's centre (viewport coordinates) is where the sheet grows from. */}
      <div className={`pd-sheet-stage${shown ? ' in' : ''}`} style={{ transformOrigin: origin }} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pd-sheet" role="dialog" aria-modal="true" aria-label={screenTitle(mockups[i])}>
        <div className="pd-sheet-head">
          <button type="button" className="btn btn-sm btn-ghost" aria-label={tr('Màn trước')} disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={16} /></button>
          <span className="pd-sheet-title">{screenTitle(mockups[i])}<span className="faint"> · {i + 1}/{mockups.length}</span></span>
          <button type="button" className="btn btn-sm btn-ghost" aria-label={tr('Màn sau')} disabled={i === mockups.length - 1} onClick={() => setI(i + 1)}><ChevronRight size={16} /></button>
          <button type="button" ref={closeBtn} className="btn btn-sm btn-ghost pd-sheet-x" aria-label={tr('Đóng')} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="pd-sheet-body"><Mockups mockups={mockups} start={i} onIndex={setI} /></div>
      </div>
      </div>
    </div>
  );
}

/** The roadmap — the first MVP list and every feature added in the chat — with where each one is. */
function FeaturesPane({ features }) {
  return (
    <div className="pd-doc">
      <div className="pd-bar"><h2 className="pd-title">{tr('Tính năng')}</h2></div>
      {features.length ? (
        <ol className="pd-features">
          {features.map((f, k) => (
            <li key={k} className={`pd-feat st-${f.status}`}>
              <span className="pd-feat-n">{k + 1}</span>
              <span className="pd-feat-text">
                <span className="pd-feat-title">{f.title}</span>
                {f.text && <span className="pd-feat-desc">{f.text}</span>}
              </span>
              <span className={`pc-chip pc-${f.status}`}>{featureState(f)}</span>
            </li>
          ))}
        </ol>
      ) : <p className="faint pd-read">{tr('Thiết kế hệ thống chưa có mục “Lộ trình tính năng”.')}</p>}
    </div>
  );
}
