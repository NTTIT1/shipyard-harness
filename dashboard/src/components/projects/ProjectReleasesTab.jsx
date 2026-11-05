import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Rocket, PackagePlus, Settings2, Check, X, ExternalLink, GitBranch, Tag } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import Markdown from '../Markdown.jsx';
import { authFetch } from '../../lib/api.js';
import { confirmDialog } from '../../lib/dialog.js';
import { draftNotes, envGate, isProd, VERSION_RE } from '../../lib/releases.js';
import { fmtWhen } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';

async function api(method, url, body) {
  const r = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const ENV_STATUS = {
  deployed: [tr('Đã đưa lên — chờ xác nhận'), 'info'], verified: [tr('Đạt'), 'ok'], rejected: [tr('Không đạt'), 'danger'],
};
const REL_STATUS = { open: [tr('Đang phát hành'), 'accent'], released: [tr('Đã lên Production'), 'ok'], cancelled: [tr('Đã huỷ'), 'neutral'] };
const DEPLOY = { success: [tr('deploy xong'), 'ok'], pending: [tr('đang deploy'), 'warn'], failure: [tr('deploy lỗi'), 'danger'] };

/**
 * "Phát hành": finished features are grouped into a version frozen from the integration branch, sent to
 * UAT, confirmed there by a person, then released to Production (merge + tag). The repo's CI deploys.
 */
export default function ProjectReleasesTab({ pid }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [deploy, setDeploy] = useState({});
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try { setSt(await api('GET', `/api/releases/${pid}`)); setErr(''); } catch (e) { setErr(e.message); }
  }, [pid]);
  useEffect(() => { load(); }, [load]);

  // Deploy status from the repo's CI, for open releases on environments that name one.
  useEffect(() => {
    if (!st) return undefined;
    const open = st.releases.filter(r => r.status === 'open' && Object.keys(r.envs || {}).length);
    if (!open.length || !st.settings.envs.some(e => e.deployContext)) return undefined;
    let live = true;
    const poll = () => Promise.all(open.map(r => api('GET', `/api/releases/${pid}/${r.id}/deploy-status`).then(s => [r.id, s], () => [r.id, {}])))
      .then(rows => { if (live) setDeploy(Object.fromEntries(rows)); });
    poll();
    const t = setInterval(poll, 20_000);
    return () => { live = false; clearInterval(t); };
  }, [st, pid]);

  const act = async (key, fn) => {
    setBusy(key); setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  if (!st) return <div className="pj-tab-stack">{err ? <p className="m-err" role="alert">{err}</p> : <p className="po-empty">{tr('đang tải…')}</p>}</div>;
  const { settings, can } = st;
  const prodLabel = settings.envs[settings.envs.length - 1]?.label || 'Production';

  return (
    <div className="pj-tab-stack rl">
      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={16} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
          <button className="linklike" onClick={() => setErr('')} style={{ color: 'inherit', marginLeft: 'auto' }} aria-label={tr('Đóng')}>✕</button>
        </div>
      )}

      <section className="po-block" aria-labelledby="rl-h-envs">
        <div className="rl-head">
          <h2 id="rl-h-envs" className="po-h">{tr('Môi trường')}</h2>
          {can.prod && !editing && <Button size="sm" variant="ghost" icon={Settings2} onClick={() => setEditing(true)}>{tr('Cấu hình')}</Button>}
        </div>
        {editing
          ? <EnvSettings settings={settings} busy={busy === 'settings'} onCancel={() => setEditing(false)}
              onSave={s => act('settings', async () => { await api('PUT', `/api/releases/${pid}/settings`, s); setEditing(false); })} />
          : (
            <ol className="rl-envs">
              <li><span className="rl-env-name"><GitBranch size={13} aria-hidden="true" /> {tr('Tích hợp')}</span><code>{settings.source}</code></li>
              {settings.envs.map(e => (
                <li key={e.id}>
                  <span className="rl-env-name">{e.label}</span>
                  <code>{e.branch}</code>
                  {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="rl-link">{e.url.replace(/^https?:\/\//, '')} <ExternalLink size={11} aria-hidden="true" /></a>}
                </li>
              ))}
            </ol>
          )}
        {!st.configured && !editing && (
          <p className="po-empty">{tr('Đang dùng mặc định: bản phát hành đi {0} → nhánh uat → nhánh main. CI của repo deploy khi nhánh nhận code mới.', [settings.source])}</p>
        )}
      </section>

      {can.release && <NewRelease st={st} busy={busy === 'create'}
        onCreate={body => act('create', () => api('POST', `/api/releases/${pid}`, body))} />}

      <section className="po-block" aria-labelledby="rl-h-list">
        <h2 id="rl-h-list" className="po-h">{tr('Các bản phát hành')}</h2>
        {st.releases.length === 0 ? <p className="po-empty">{tr('Chưa có bản phát hành nào.')}</p> : (
          <ul className="rl-list">
            {st.releases.map(r => (
              <Release key={r.id} r={r} settings={settings} can={can} busy={busy} deploy={deploy[r.id] || {}} prodLabel={prodLabel}
                onDeploy={async env => {
                  const e = settings.envs.find(x => x.id === env);
                  if (isProd(settings, env) && !await confirmDialog({
                    title: tr('Phát hành {0}', [e.label]),
                    message: tr('Gộp v{0} vào nhánh {1} và gắn tag v{0}? CI của repo sẽ deploy lên {2}.', [r.version, e.branch, e.label]),
                    confirmLabel: tr('Phát hành'), cancelLabel: tr('Không'),
                  })) return;
                  act(`deploy-${r.id}`, () => api('POST', `/api/releases/${pid}/${r.id}/deploy`, { env }));
                }}
                onVerify={(env, ok, note) => act(`verify-${r.id}`, () => api('POST', `/api/releases/${pid}/${r.id}/verify`, { env, ok, note }))}
                onCancel={async () => {
                  if (!await confirmDialog({ title: tr('Huỷ bản phát hành'), message: tr('Huỷ v{0}? Các tính năng của nó được gom lại vào bản sau.', [r.version]), confirmLabel: tr('Huỷ bản'), cancelLabel: tr('Không'), danger: true })) return;
                  act(`cancel-${r.id}`, () => api('POST', `/api/releases/${pid}/${r.id}/cancel`, {}));
                }} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewRelease({ st, busy, onCreate }) {
  const [picked, setPicked] = useState(() => new Set(st.candidates.map(c => c.runId)));
  const [version, setVersion] = useState(st.nextVersion);
  const [notes, setNotes] = useState(null);
  useEffect(() => { setVersion(st.nextVersion); setPicked(new Set(st.candidates.map(c => c.runId))); setNotes(null); }, [st.nextVersion, st.candidates]);
  const features = st.candidates.filter(c => picked.has(c.runId));
  const text = notes ?? draftNotes(version, features);
  const bad = !VERSION_RE.test(version.replace(/^v/i, ''));
  const toggle = id => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <section className="po-block" aria-labelledby="rl-h-new">
      <h2 id="rl-h-new" className="po-h">{tr('Tạo bản phát hành')}</h2>
      <p className="po-empty">{tr('Khoá trạng thái hiện tại của nhánh {0} thành một phiên bản; việc làm sau đó không lọt vào bản này.', [st.settings.source])}</p>
      {st.candidates.length === 0 ? <p className="po-empty">{tr('Không có tính năng hoàn tất nào chưa phát hành.')}</p> : (
        <fieldset className="rl-pick">
          <legend>{tr('Tính năng hoàn tất chưa phát hành')}</legend>
          {st.candidates.map(c => (
            <label key={c.runId} className="rl-check">
              <input type="checkbox" checked={picked.has(c.runId)} onChange={() => toggle(c.runId)} />
              <span>{c.title || c.runId}</span>
              {c.doneAt && <span className="faint">{fmtWhen(c.doneAt)}</span>}
            </label>
          ))}
        </fieldset>
      )}
      <div className="rl-form">
        <label className="rl-field">
          <span>{tr('Phiên bản')}</span>
          <input value={version} onChange={e => { setVersion(e.target.value); }} aria-invalid={bad} placeholder="1.2.0" />
        </label>
        <label className="rl-field rl-notes">
          <span>{tr('Ghi chú phát hành')}</span>
          <textarea rows={5} value={text} onChange={e => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="rl-actions">
        <Button variant="primary" icon={PackagePlus} disabled={busy || bad}
          onClick={() => onCreate({ version, runIds: [...picked].filter(id => st.candidates.some(c => c.runId === id)), notes: text })}>
          {busy ? tr('Đang tạo…') : tr('Tạo v{0}', [version.replace(/^v/i, '')])}
        </Button>
        {bad && <span className="m-err">{tr('Phiên bản dạng 1.2.3')}</span>}
      </div>
    </section>
  );
}

function Release({ r, settings, can, busy, deploy, onDeploy, onVerify, onCancel }) {
  const [note, setNote] = useState('');
  const [s, tone] = REL_STATUS[r.status] || [r.status, 'neutral'];
  return (
    <li className="rl-item">
      <div className="rl-item-head">
        <strong className="rl-version">v{r.version}</strong>
        <Badge tone={tone}>{s}</Badge>
        {r.tag && <span className="rl-meta"><Tag size={12} aria-hidden="true" /> {r.tag}</span>}
        <span className="rl-meta"><code>{r.branch}</code> · {r.sha.slice(0, 7)} · {fmtWhen(r.createdAt)}</span>
      </div>
      {r.features.length > 0 && <p className="rl-features">{r.features.map(f => f.title).join(' · ')}</p>}

      <ol className="rl-stages">
        {settings.envs.map(e => {
          const cur = r.envs?.[e.id];
          const gate = envGate(settings, r, e.id);
          const prod = isProd(settings, e.id);
          const mayDeploy = r.status === 'open' && (prod ? can.prod : can.release);
          const [label, t] = cur ? ENV_STATUS[cur.status] || [cur.status, 'neutral'] : [tr('Chưa đưa lên'), 'neutral'];
          const dep = DEPLOY[deploy[e.id]];
          return (
            <li key={e.id} className="rl-stage">
              <div className="rl-stage-head">
                <span className="rl-env-name">{e.label}</span>
                <Badge tone={t}>{label}</Badge>
                {dep && <Badge tone={dep[1]}>{dep[0]}</Badge>}
              </div>
              {cur && <span className="rl-meta">{tr('{0} · {1}', [cur.by || '—', fmtWhen(cur.at)])}{cur.verifiedBy ? ` · ${tr('xác nhận: {0}', [cur.verifiedBy])}` : ''}</span>}
              {cur?.note && <span className="rl-meta">{cur.note}</span>}
              <div className="rl-stage-actions">
                {!cur && mayDeploy && (
                  <Button size="sm" variant={prod ? 'primary' : 'secondary'} icon={Rocket} disabled={!gate.ok || !!busy}
                    title={gate.ok ? undefined : gate.why} onClick={() => onDeploy(e.id)}>
                    {tr('Đưa lên {0}', [e.label])}
                  </Button>
                )}
                {!cur && !gate.ok && r.status === 'open' && <span className="rl-meta">{gate.why}</span>}
                {cur && cur.status !== 'verified' && can.verify && r.status === 'open' && (
                  <>
                    <Button size="sm" icon={Check} disabled={!!busy} onClick={() => onVerify(e.id, true, note)}>{tr('Xác nhận đạt')}</Button>
                    <input className="rl-note" value={note} onChange={ev => setNote(ev.target.value)} placeholder={tr('Lý do nếu không đạt…')} aria-label={tr('Lý do không đạt')} />
                    <Button size="sm" variant="ghost" icon={X} disabled={!!busy || !note.trim()} onClick={() => onVerify(e.id, false, note)}>{tr('Không đạt')}</Button>
                  </>
                )}
                {e.url && cur && <a href={e.url} target="_blank" rel="noreferrer" className="rl-link">{tr('Mở {0}', [e.label])} <ExternalLink size={11} aria-hidden="true" /></a>}
              </div>
            </li>
          );
        })}
      </ol>

      <details className="rl-more">
        <summary>{tr('Ghi chú & lịch sử')}</summary>
        <Markdown text={r.notes} />
        <ul className="rl-history">{r.history.map((h, i) => <li key={i}><span className="faint">{fmtWhen(h.at)}</span> {h.what} <span className="faint">{h.by}</span></li>)}</ul>
        {r.status === 'open' && can.release && <Button size="sm" variant="ghost" disabled={!!busy} onClick={onCancel}>{tr('Huỷ bản phát hành')}</Button>}
      </details>
    </li>
  );
}

function EnvSettings({ settings, busy, onSave, onCancel }) {
  const [s, setS] = useState(() => structuredClone(settings));
  const setEnv = (i, k, v) => setS(x => ({ ...x, envs: x.envs.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));
  return (
    <form className="rl-settings" onSubmit={e => { e.preventDefault(); onSave(s); }}>
      <label className="rl-field"><span>{tr('Nhánh tích hợp (nguồn của bản phát hành)')}</span>
        <input value={s.source} onChange={e => setS(x => ({ ...x, source: e.target.value }))} required />
      </label>
      {s.envs.map((e, i) => (
        <fieldset key={i} className="rl-env-edit">
          <legend>{i === s.envs.length - 1 ? tr('{0} (môi trường cuối — Production)', [e.label || e.id]) : e.label || e.id}</legend>
          <label className="rl-field"><span>{tr('Tên')}</span><input value={e.label} onChange={ev => setEnv(i, 'label', ev.target.value)} /></label>
          <label className="rl-field"><span>{tr('Nhánh')}</span><input value={e.branch} onChange={ev => setEnv(i, 'branch', ev.target.value)} required /></label>
          <label className="rl-field"><span>{tr('Địa chỉ')}</span><input value={e.url} onChange={ev => setEnv(i, 'url', ev.target.value)} placeholder="https://uat.example.com" /></label>
          <label className="rl-field"><span>{tr('Trạng thái deploy trên CI (tuỳ chọn)')}</span><input value={e.deployContext} onChange={ev => setEnv(i, 'deployContext', ev.target.value)} placeholder="deploy-uat" /></label>
        </fieldset>
      ))}
      <div className="rl-actions">
        <Button type="submit" variant="primary" disabled={busy}>{tr('Lưu')}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{tr('Huỷ')}</Button>
      </div>
    </form>
  );
}
