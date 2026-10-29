import { useEffect, useMemo, useState } from 'react';
import { platform } from '../lib/platform.js';

/**
 * The platform runs behind the given lanes (their workflow steps), as { [run_id]: view }. A run is
 * refetched whenever its lane moves; one the platform cannot serve is simply absent.
 */
export function useRunViews(lanes) {
  const [views, setViews] = useState({});
  const key = (lanes || []).filter(l => l?.run_id).map(l => `${l.run_id}|${l.stage}|${l.status}|${l.needs_action || ''}`).join(',');
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    for (const id of new Set(key.split(',').map(k => k.split('|')[0]))) {
      platform.run(id)
        .then(v => { if (live && v?.run?.id === id) setViews(prev => ({ ...prev, [id]: v })); })
        .catch(() => { if (live) setViews(prev => { const { [id]: _, ...rest } = prev; return rest; }); });
    }
    return () => { live = false; };
  }, [key]);
  return views;
}

/** The platform run behind one lane; null if none/unreachable. */
export function useRunView(lane) {
  const lanes = useMemo(() => [lane], [lane.run_id, lane.stage, lane.status, lane.needs_action]);
  return useRunViews(lanes)[lane.run_id] || null;
}
