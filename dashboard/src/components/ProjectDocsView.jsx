import React, { useEffect, useState } from 'react';
import { FileText, MessagesSquare } from 'lucide-react';
import Button from './ui/Button.jsx';
import Tabs from './ui/Tabs.jsx';
import Markdown from './Markdown.jsx';
import { Mockups } from './studio/MockupViewer.jsx';
import { projectChat, FEATURE_STATUS_LABEL } from '../lib/studio.js';
import '../styles/studio.css';
import '../styles/hub.css';
import { tr } from '../lib/i18n.js';

/**
 * "Tài liệu dự án": what the project chat approved — the product brief, the architecture (with the
 * feature roadmap and where each feature is), the UI design and its screens, and every feature added
 * later — to read back at any time without reopening the chat.
 */
export default function ProjectDocsView({ pid, project, onOpenChat }) {
  const [docs, setDocs] = useState(null);
  const [tab, setTab] = useState('brief');
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
  return (
    <section className="hub" aria-labelledby="pd-title">
      <header className="hub-head">
        <div>
          <h1 id="pd-title" className="pb-h1">{tr('Tài liệu dự án')}{project?.name ? ` · ${project.name}` : ''}</h1>
          <p className="pb-subtitle">{tr('Những gì đã duyệt trong chat dự án: yêu cầu sản phẩm, thiết kế hệ thống, giao diện và các tính năng thêm sau. Cũng có trong Bộ nhớ dự án để các AI dùng lại.')}</p>
        </div>
        <Button variant="secondary" icon={MessagesSquare} onClick={() => onOpenChat(pid)}>{tr('Mở chat dự án')}</Button>
      </header>
      {err && <p className="m-err" role="alert">{err}</p>}
      {!docs && !err && <p className="faint">{tr('Đang tải…')}</p>}
      {empty && <p className="muted-empty">{tr('Dự án chưa có tài liệu đã duyệt. Thêm tính năng trong chat dự án: AI đọc code sẵn có rồi cùng bạn viết tài liệu.')}</p>}
      {docs && !empty && (
        <>
          <Tabs value={tab} onChange={setTab} items={[
            { id: 'brief', label: tr('Yêu cầu sản phẩm') },
            { id: 'architecture', label: tr('Thiết kế hệ thống') },
            ...(docs.design || docs.mockups.length ? [{ id: 'ui', label: tr('Giao diện'), badge: docs.mockups.length || null }] : []),
            { id: 'features', label: tr('Tính năng'), badge: docs.features.length || null },
          ]} />
          <div className="card-panel pd-body">
            {tab === 'brief' && (docs.brief ? <Markdown text={docs.brief} /> : <p className="faint">{tr('Chưa có.')}</p>)}
            {tab === 'architecture' && (docs.architecture ? <Markdown text={docs.architecture} /> : <p className="faint">{tr('Chưa có.')}</p>)}
            {tab === 'ui' && (
              <>
                {docs.mockups.length > 0 && <Mockups mockups={docs.mockups} />}
                {docs.design && <Markdown text={docs.design} />}
              </>
            )}
            {tab === 'features' && (docs.features.length ? (
              <ul className="hub-list">
                {docs.features.map(f => (
                  <li key={f.slug} className="hub-row">
                    <span className="hub-main" style={{ cursor: 'default' }}>
                      <span className="hub-text"><span className="hub-name">{f.title}</span></span>
                      <span className={`pc-chip pc-${f.status === 'approved' ? 'waiting' : f.status}`}>{tr(FEATURE_STATUS_LABEL[f.status] || f.status)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="faint">{tr('Chưa có tính năng nào được thêm qua chat dự án.')}</p>)}
          </div>
        </>
      )}
    </section>
  );
}
