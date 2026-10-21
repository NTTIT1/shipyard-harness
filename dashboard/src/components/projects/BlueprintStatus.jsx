import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, Hourglass } from 'lucide-react';
import { scaffold, BLUEPRINT_STATUS } from '../../lib/scaffold.js';
import '../../styles/wizard.css';

/** Progress of the architecture-first BLUEPRINT run (wizard and project page). */
export default function BlueprintStatus({ runId, initial = null, onOpen }) {
  const [s, setS] = useState(initial);
  const [poke, setPoke] = useState(0);
  useEffect(() => {
    let stop = false, t;
    const tick = () => scaffold.blueprint(runId).then(v => {
      if (stop) return;
      setS(v);
      if (!['done', 'cancelled', 'error'].includes(v.status)) t = setTimeout(tick, v.status === 'awaiting-review' ? 8000 : 3000);
    }, () => {});
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [runId, poke]);
  if (!s) return null;
  const busy = ['queued', 'drafting', 'building'].includes(s.status) || s.busy;
  return (
    <div className={`wz-setup ${s.status}`} role="status">
      {busy ? <Loader2 size={16} className="wz-spin" aria-hidden="true" />
        : s.status === 'error' ? <AlertTriangle size={16} aria-hidden="true" />
        : s.status === 'awaiting-review' ? <Hourglass size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
      <span><b>Kiến trúc:</b> {BLUEPRINT_STATUS[s.status] || s.status}{s.error ? ` — ${s.error}` : ''}</span>
      {onOpen && s.status === 'awaiting-review' && (
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => onOpen(runId)}>Mở bản kiến trúc</button>
      )}
      {s.status === 'error' && !busy && (
        <button type="button" className="btn btn-sm btn-secondary"
          onClick={() => scaffold.retryBlueprint(runId).then(() => { setS({ ...s, status: 'queued', error: null }); setPoke(n => n + 1); })}>Thử lại</button>
      )}
    </div>
  );
}
