import React from 'react';
import { Inbox, ChevronRight } from 'lucide-react';
import Badge from './ui/Badge.jsx';
import { STEP_LABEL, ROLE_LABEL } from '../lib/review.js';
import { fmtAge } from '../lib/format.js';

export default function InboxView({ items, error, onOpen }) {
  return (
    <section className="rv-page" aria-labelledby="inbox-title">
      <h1 id="inbox-title" className="rv-h1"><Inbox size={20} strokeWidth={1.75} aria-hidden="true" /> Chờ tôi duyệt</h1>
      {error && <p className="m-err">{error}</p>}
      {!error && items.length === 0 && <p className="muted-empty">Không có bước nào đang chờ bạn.</p>}
      <ul className="inbox-list">
        {items.map(i => {
          const [age] = fmtAge((Date.now() - Date.parse(i.waitingSince)) / 1000);
          return (
            <li key={i.approvalId}>
              <button className="inbox-item" onClick={() => onOpen(i)}>
                <span className="ii-main">
                  <span className="ii-title">{i.runTitle}</span>
                  <span className="ii-meta">{STEP_LABEL[i.step]} · bản {i.revisionNo} · chờ {age}</span>
                </span>
                {i.decideAs === 'OWNER_FALLBACK' ? <Badge tone="warn">duyệt thay (Owner)</Badge> : <Badge tone="accent">{ROLE_LABEL[i.decideAs] || i.decideAs}</Badge>}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
