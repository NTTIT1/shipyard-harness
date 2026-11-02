import React, { useCallback, useEffect, useState } from 'react';
import { Plus, MessagesSquare, Settings2, Loader2, Trash2, FolderKanban, Lightbulb, LayoutTemplate, GitBranch } from 'lucide-react';
import Button from './ui/Button.jsx';
import { studio, isDraft, draftStep } from '../lib/studio.js';
import '../styles/hub.css';
import { tr } from '../lib/i18n.js';

const KIND_ICON = { idea: Lightbulb, template: LayoutTemplate, git: GitBranch };
const KIND_LABEL = { idea: 'Từ ý tưởng', template: 'Từ khung', git: 'Từ git có sẵn' };

/**
 * "Dự án" (Điều hành): create a project, and every project in one list — the ones still being shaped
 * with the AIs (drafts: open the chat where you left it) and the created ones (open their chat or settings).
 */
export default function ProjectHubView({ projects = [], lanes = [], canScaffold, onCreate, onOpenDraft, onOpenChat, onOpenSettings }) {
  const [drafts, setDrafts] = useState([]);
  const [err, setErr] = useState('');
  const load = useCallback(() => (canScaffold ? studio.list().then(l => setDrafts(l.filter(isDraft)), e => setErr(e.message)) : Promise.resolve()), [canScaffold]);
  useEffect(() => { load(); }, [load]);
  // A draft whose AI is answering shows it; the list follows on its own.
  useEffect(() => {
    if (!drafts.some(d => d.busy)) return undefined;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [drafts, load]);
  const remove = async d => {
    if (!window.confirm(tr('Xoá bản nháp "{0}"? Toàn bộ tài liệu nháp và lịch sử trao đổi sẽ bị xoá.', [d.title]))) return;
    try { await studio.remove(d.id); load(); } catch (e) { setErr(e.message); }
  };
  const laneCount = pid => lanes.filter(l => l.run_project_id === pid).length;

  return (
    <section className="hub" aria-labelledby="hub-title">
      <header className="hub-head">
        <div>
          <h1 id="hub-title" className="pb-h1">{tr('Dự án')}</h1>
          <p className="pb-subtitle">{tr('Tạo dự án mới, hoặc mở lại dự án đang trao đổi với AI và dự án đã có.')}</p>
        </div>
        {canScaffold && <Button variant="primary" icon={Plus} onClick={onCreate}>{tr('Tạo dự án')}</Button>}
      </header>
      {err && <p className="m-err" role="alert">{err}</p>}

      {canScaffold && drafts.length > 0 && (
        <div className="hub-group">
          <h2 className="hub-h2">{tr('Đang tạo ({0})', [drafts.length])}</h2>
          <ul className="hub-list">
            {drafts.map(d => {
              const Icon = KIND_ICON[d.kind] || Lightbulb;
              return (
                <li key={d.id} className="hub-row">
                  <button type="button" className="hub-main" onClick={() => onOpenDraft(d.id)}>
                    <Icon size={16} className="hub-icon" aria-hidden="true" />
                    <span className="hub-text">
                      <span className="hub-name">{d.title}</span>
                      <span className="hub-meta">{tr(KIND_LABEL[d.kind] || KIND_LABEL.idea)} · {draftStep(d)}</span>
                    </span>
                    {d.busy && <span className="hub-busy"><Loader2 size={13} className="wz-spin" aria-hidden="true" /> {tr('AI đang trả lời')}</span>}
                  </button>
                  <Button size="sm" variant="secondary" icon={MessagesSquare} onClick={() => onOpenDraft(d.id)}>{tr('Tiếp tục')}</Button>
                  <button type="button" className="btn btn-sm btn-ghost" aria-label={tr('Xoá bản nháp "{0}"', [d.title])} onClick={() => remove(d)}><Trash2 size={13} /></button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="hub-group">
        <h2 className="hub-h2">{tr('Danh sách dự án ({0})', [projects.length])}</h2>
        {projects.length ? (
          <ul className="hub-list">
            {projects.map(p => (
              <li key={p.id} className="hub-row">
                <button type="button" className="hub-main" onClick={() => onOpenChat(p.id)}>
                  <FolderKanban size={16} className="hub-icon" aria-hidden="true" />
                  <span className="hub-text">
                    <span className="hub-name">{p.name}</span>
                    <span className="hub-meta">{[p.description, tr('{0} lane', [laneCount(p.id)])].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
                <Button size="sm" variant="secondary" icon={MessagesSquare} onClick={() => onOpenChat(p.id)}>{tr('Chat dự án')}</Button>
                <Button size="sm" variant="ghost" icon={Settings2} onClick={() => onOpenSettings(p.id)}>{tr('Cài đặt')}</Button>
              </li>
            ))}
          </ul>
        ) : <p className="faint">{canScaffold ? tr('Chưa có dự án nào. Bấm "Tạo dự án" để bắt đầu.') : tr('Bạn chưa thuộc dự án nào.')}</p>}
      </div>
    </section>
  );
}
