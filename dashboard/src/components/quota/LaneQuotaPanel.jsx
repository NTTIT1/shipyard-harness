import React, { useCallback, useEffect, useState } from 'react';
import { OctagonPause, Play, Cpu } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { QuotaRow, GrantActions } from './QuotaParts.jsx';
import { fetchLaneQuota, grantLaneQuota, resetLaneQuota, continueLaneQuota } from '../../lib/api.js';
import { tr } from '../../lib/i18n.js';

/**
 * The lane is stopped by its quota: which limit, how far over, and — for an admin — grant more, reset the
 * counter or switch model, then the lane goes on where it stopped. Everyone else sees who can unblock it.
 * refreshKey: bump to re-read (a quota event arrived in the chat).
 */
export default function LaneQuotaPanel({ n, refreshKey, onChangeModel, onState }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const load = useCallback(() => fetchLaneQuota(n).then(d => { setData(d); onState?.(d); }).catch(() => {}), [n]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!data?.hold) return null;
  const stillBlocked = (data.quota?.blocking || []).filter(c => c.scope !== 'plan');
  const checks = stillBlocked.length ? stillBlocked : data.hold.checks;
  const act = fn => async (...a) => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      const r = await fn(...a);
      setMsg({ ok: r.hold ? tr('Đã lưu — lane vẫn còn hạn mức khác bị chạm.') : tr('Đã cấp thêm — lane đang làm tiếp.'), err: '' });
      await load();
    } catch (e) { setMsg({ ok: '', err: e.message }); }
    setBusy(false);
  };
  const grant = act((c, add) => grantLaneQuota(n, c.id, add));
  const reset = act(c => resetLaneQuota(n, c.id));
  const resume = act(() => continueLaneQuota(n));

  return (
    <section className="qt-hold" role="region" aria-labelledby={`qt-hold-${n}`}>
      <header className="qt-hold-head">
        <span className="qt-hold-icon" aria-hidden="true"><OctagonPause size={18} /></span>
        <div className="qt-hold-text">
          <h3 id={`qt-hold-${n}`}>{tr('Lane đã dừng — hết hạn mức')}</h3>
          <p>{stillBlocked.length
            ? tr('Lane không gọi AI nữa cho tới khi được cấp thêm. Việc đang dở được giữ nguyên và làm tiếp đúng chỗ đã dừng.')
            : tr('Hạn mức đã đủ. Bấm Tiếp tục để lane làm tiếp đúng chỗ đã dừng.')}</p>
        </div>
      </header>
      <div className="qt-hold-body">
        {checks.map(c => (
          <QuotaRow key={c.id} c={c}>
            {data.can_manage && stillBlocked.some(s => s.id === c.id) && <GrantActions c={c} busy={busy} onGrant={grant} onReset={reset} />}
          </QuotaRow>
        ))}
      </div>
      {data.can_manage ? (
        <footer className="qt-hold-foot">
          {onChangeModel && <Button size="sm" variant="ghost" icon={Cpu} onClick={onChangeModel} disabled={busy}>{tr('Đổi model')}</Button>}
          <Button size="sm" variant={stillBlocked.length ? 'secondary' : 'primary'} icon={Play} disabled={busy || stillBlocked.length > 0} onClick={resume}>{tr('Tiếp tục')}</Button>
        </footer>
      ) : (
        <p className="qt-note qt-hold-foot">{tr('Chỉ quản trị viên cấp thêm được hạn mức. Hãy báo quản trị viên, lane sẽ tự làm tiếp khi được cấp.')}</p>
      )}
      {(msg.ok || msg.err) && <p className={msg.err ? 'm-err' : 'qt-ok'} role={msg.err ? 'alert' : 'status'}>{msg.err || msg.ok}</p>}
    </section>
  );
}
