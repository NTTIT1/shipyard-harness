import React, { useEffect, useState } from 'react';
import { OctagonPause, ArrowUpRight, Layers, FolderKanban, Rows3, Cpu, Sparkles } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { QuotaRow, GrantActions } from './QuotaParts.jsx';
import { saveCostSettings, grantLaneQuota, resetLaneQuota } from '../../lib/api.js';
import { tr } from '../../lib/i18n.js';

/**
 * "Hạn mức": every limit on the machine in one place, the lanes it has stopped first. A limit reached stops
 * the lane (chat card, no new AI call, no new feature) until an admin grants more here or in the lane.
 */
export default function QuotaBoard({ board, settings, projects = [], onSaved, onOpenLane }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const projectName = id => projects.find(p => p.id === id)?.name || id;
  if (!board) return null;
  const { rows, held } = board;

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try { await fn(); setMsg({ ok, err: '' }); await onSaved(); } catch (e) { setMsg({ ok: '', err: e.message }); }
    setBusy(false);
  };

  return (
    <div className="qb">
      <div className="qb-lead">
        <p>{tr('Lane nào chạm 100% một hạn mức áp lên nó sẽ dừng ngay: báo trong chat của lane, không gọi AI và không nhận tính năng mới, chờ quản trị viên cấp thêm. Từ mức cảnh báo, lane vẫn làm nhưng chat của lane được báo trước.')}</p>
        <WarnPct value={board.warnPct} disabled={busy} onSave={v => run(() => saveCostSettings({ quotaWarnPct: v }), tr('Đã lưu mức cảnh báo.'))} />
      </div>
      {(msg.ok || msg.err) && <p className={msg.err ? 'm-err' : 'qt-ok'} role={msg.err ? 'alert' : 'status'}>{msg.err || msg.ok}</p>}

      {held.length > 0 && (
        <section className="qb-held" aria-labelledby="qb-held-title">
          <h2 id="qb-held-title" className="qb-held-title"><OctagonPause size={16} aria-hidden="true" />{tr('{0} lane đang dừng vì hết hạn mức', [held.length])}</h2>
          {held.map(h => (
            <article key={h.lane} className="qb-held-card" aria-label={tr('Lane {0}', [h.lane])}>
              <div className="qb-held-head">
                <b>{tr('Lane {0}', [h.lane])}</b>
                <span>{[h.feature, h.projectId && projectName(h.projectId)].filter(Boolean).join(' · ')}</span>
                {onOpenLane && <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={() => onOpenLane(h.lane)}>{tr('Mở lane')}</Button>}
              </div>
              {h.checks.map(c => (
                <QuotaRow key={c.id} c={c} projectName={projectName}>
                  <GrantActions c={c} busy={busy}
                    onGrant={(x, add) => run(() => grantLaneQuota(h.lane, x.id, add), tr('Đã cấp thêm cho lane {0}.', [h.lane]))}
                    onReset={x => run(() => resetLaneQuota(h.lane, x.id), tr('Đã đặt lại bộ đếm.'))} />
                </QuotaRow>
              ))}
            </article>
          ))}
        </section>
      )}

      <div className="qb-groups">
        <Group icon={Layers} title={tr('Chung')} hint={tr('Áp cho mọi lane')}>
          {rows.month.map(c => <LimitRow key={c.id} c={c} disabled={busy} required
            onSave={v => run(() => saveCostSettings({ monthlyBudgetUsd: v.usd ?? 0, monthlyTokenLimit: v.tokens ?? 0 }), tr('Đã lưu hạn mức chung.'))} />)}
        </Group>
        <Group icon={FolderKanban} title={tr('Dự án')} hint={tr('Mọi lane của dự án cộng chung')} empty={tr('Chưa có dự án nào dùng AI tháng này.')}>
          {rows.project.map(c => <LimitRow key={c.id} c={c} projectName={projectName} disabled={busy}
            sub={c.lanes?.length ? tr('Lane {0}', [c.lanes.join(', ')]) : ''}
            onSave={v => run(() => saveCostSettings({ projectLimits: { [c.key]: v } }), tr('Đã lưu hạn mức dự án.'))} />)}
        </Group>
        <Group icon={Rows3} title={tr('Lane')} hint={tr('Riêng từng lane')} empty={tr('Chưa có lane nào.')}>
          {rows.lane.map(c => <LimitRow key={c.id} c={c} disabled={busy}
            sub={[c.feature, c.projectId && projectName(c.projectId)].filter(Boolean).join(' · ')}
            onSave={v => run(() => saveCostSettings({ laneLimits: { [c.key]: v } }), tr('Đã lưu hạn mức lane {0}.', [c.key]))} />)}
        </Group>
        <Group icon={Cpu} title={tr('Model')} hint={tr('Mọi lane dùng model đó cộng chung')} empty={tr('Chưa có model nào dùng tháng này.')}>
          {rows.model.map(c => <LimitRow key={c.id} c={c} disabled={busy}
            onSave={v => run(() => saveCostSettings({ modelLimits: { [c.key]: v } }), tr('Đã lưu hạn mức model.'))} />)}
        </Group>
        {rows.plan.length > 0 && (
          <Group icon={Sparkles} title={tr('Gói Claude')} hint={tr('Do Anthropic đặt — tự hồi')}>
            {rows.plan.map(c => <QuotaRow key={c.id} c={c} />)}
          </Group>
        )}
      </div>
    </div>
  );
}

function Group({ icon: Icon, title, hint, empty, children }) {
  const list = React.Children.toArray(children);
  return (
    <section className="qb-group" aria-label={title}>
      <div className="qb-group-head">
        <h3><Icon size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--text-muted)' }} />{title}</h3>
        {hint && <p>{hint}</p>}
      </div>
      {list.length ? list : <p className="qb-empty">{empty}</p>}
    </section>
  );
}

/** A limit with its own editor: USD and/or tokens; clearing an optional one hands it back to the shared limit. */
function LimitRow({ c, projectName, sub, onSave, disabled, required = false }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ usd: '', tokens: '' });
  useEffect(() => { setV({ usd: c.limitUsd || '', tokens: c.limitTokens || '' }); }, [c.limitUsd, c.limitTokens, open]);
  const save = e => {
    e.preventDefault();
    const out = {};
    if (String(v.usd).trim() !== '') out.usd = Number(v.usd);
    if (String(v.tokens).trim() !== '') out.tokens = Number(v.tokens);
    onSave(required || Object.keys(out).length ? out : null);
    setOpen(false);
  };
  return (
    <QuotaRow c={c} projectName={projectName}
      aside={<button type="button" className="qb-edit" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? tr('Đóng') : c.enforced ? tr('Sửa') : tr('Đặt hạn mức')}</button>}>
      {sub && <span className="qb-sub">{sub}</span>}
      {open && (
        <form className="qb-editor" onSubmit={save}>
          <label>USD<input type="number" min="0" step="any" inputMode="decimal" value={v.usd} placeholder={required ? '0' : tr('trống')} onChange={e => setV({ ...v, usd: e.target.value })} /></label>
          <label>{tr('Token')}<input type="number" min="0" step="100000" value={v.tokens} placeholder={required ? '0' : tr('trống')} onChange={e => setV({ ...v, tokens: e.target.value })} /></label>
          <Button size="sm" variant="primary" type="submit" disabled={disabled}>{tr('Lưu')}</Button>
          {!required && c.enforced && (
            <Button size="sm" variant="ghost" type="button" disabled={disabled} onClick={() => { onSave(null); setOpen(false); }}>{tr('Bỏ hạn mức riêng')}</Button>
          )}
          <span className="qt-note">{tr('Token chỉ tính cho model miễn phí (qua gateway); model có giá tính theo USD.')}</span>
        </form>
      )}
    </QuotaRow>
  );
}

function WarnPct({ value, onSave, disabled }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { const n = Number(v); if (n > 0 && n < 100 && n !== value) onSave(n); else setV(value); };
  return (
    <label className="qb-warn">{tr('Cảnh báo khi đạt')}
      <input type="number" min="1" max="99" value={v} disabled={disabled} onChange={e => setV(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />%
    </label>
  );
}
