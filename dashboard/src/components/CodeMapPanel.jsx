import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, ChevronRight, AlertCircle } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Markdown from './Markdown.jsx';
import { platform } from '../lib/platform.js';
import { authFetch } from '../lib/api.js';
import { fmtWhen } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

const TYPES = [
  ['', tr('Tất cả')], ['MODULE', tr('Module')], ['API', 'API'], ['TABLE', tr('Bảng')], ['SCREEN', tr('Màn hình')], ['DOC', tr('Tài liệu')],
];
const TYPE_LABEL = Object.fromEntries(TYPES.filter(([id]) => id));
const TYPE_TONE = { MODULE: 'neutral', API: 'info', TABLE: 'warn', SCREEN: 'accent', DOC: 'ok', FEATURE: 'accent', AC: 'neutral', COMPONENT: 'neutral' };
const EDGE_LABEL = {
  DEPENDS_ON: [tr('dùng'), tr('được dùng bởi')], IMPLEMENTS: [tr('cung cấp'), tr('được cung cấp bởi')], TOUCHES: [tr('đọc/ghi'), tr('được đọc/ghi bởi')],
  MENTIONS: [tr('nhắc tới'), tr('được nhắc trong')], LINKS: [tr('liên kết tới'), tr('được liên kết từ')], SHOWS: [tr('hiển thị'), tr('hiển thị bởi')],
  CALLS: [tr('gọi'), tr('được gọi bởi')],
};

async function api(method, url) {
  const r = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/**
 * "Bản đồ mã nguồn & tài liệu": what the AI team knows about the repo — modules, APIs, tables, screens and
 * documents, how they connect, and which documents talk about which code. Rebuilt from the integration branch.
 */
export default function CodeMapPanel({ projectId }) {
  const [graph, setGraph] = useState(null);
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sel, setSel] = useState(null);
  const [related, setRelated] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, maps, st] = await Promise.all([
        platform.memoryGraph(projectId, { q, type, limit: 80 }),
        platform.memory(projectId, { kind: 'CODE_MAP' }),
        api('GET', `/api/projects/${projectId}/code-graph`).catch(() => null),
      ]);
      setGraph(g); setReport(maps?.[0] || null); setStatus(st); setErr('');
    } catch (e) { setErr(e.message); }
  }, [projectId, q, type]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  useEffect(() => {
    if (!sel) { setRelated(null); return; }
    let live = true;
    platform.memoryRelated(projectId, sel.type, sel.key).then(r => { if (live) setRelated(r); }, e => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [projectId, sel]);

  const rebuild = async () => {
    setBusy(true); setErr('');
    try { await api('POST', `/api/projects/${projectId}/code-graph`); setSel(null); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const counts = graph?.counts || {};
  const empty = graph && !Object.keys(counts).some(k => k !== 'FEATURE' && counts[k]);

  return (
    <div className="cm">
      <div className="cm-head">
        <p className="cm-sub">
          {report ? tr('Dựng từ {0} · {1}', [report.title.replace(/^.*\(([^)]+)\)$/, '$1'), fmtWhen(report.createdAt)])
            : tr('Chưa có bản đồ. Dựng một lần để AI tìm được tài liệu và các phần code liên quan khi làm tính năng.')}
        </p>
        {status?.canManage && (
          <Button size="sm" icon={RefreshCw} disabled={busy || status?.running} onClick={rebuild}>
            {busy || status?.running ? tr('Đang đọc repo…') : report ? tr('Dựng lại bản đồ') : tr('Dựng bản đồ')}
          </Button>
        )}
      </div>
      {err && <p className="m-err" role="alert"><AlertCircle size={14} aria-hidden="true" /> {err}</p>}
      {status?.last?.error && !err && <p className="m-err">{tr('Lần dựng trước lỗi: {0}', [status.last.error])}</p>}

      {graph && !empty && (
        <dl className="cm-counts">
          {['MODULE', 'API', 'TABLE', 'SCREEN', 'DOC'].map(t => (
            <div key={t}><dt>{TYPE_LABEL[t]}</dt><dd>{counts[t] || 0}</dd></div>
          ))}
        </dl>
      )}

      {graph && !empty && (
        <div className="cm-body">
          <section className="cm-list" aria-label={tr('Thành phần')}>
            <div className="cm-filters">
              <label className="cm-search">
                <Search size={14} aria-hidden="true" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('Tìm module, API, bảng, tài liệu…')} aria-label={tr('Tìm trong bản đồ')} />
              </label>
              <select className="msel" value={type} onChange={e => setType(e.target.value)} aria-label={tr('Loại')}>
                {TYPES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </div>
            {graph.nodes.length === 0 ? <p className="po-empty">{tr('Không có gì khớp.')}</p> : (
              <ul className="cm-nodes">
                {graph.nodes.map(n => (
                  <li key={n.id}>
                    <button type="button" className={`cm-node${sel?.id === n.id ? ' is-on' : ''}`} onClick={() => setSel(n)} aria-pressed={sel?.id === n.id}>
                      <Badge tone={TYPE_TONE[n.type] || 'neutral'}>{TYPE_LABEL[n.type] || n.type}</Badge>
                      <span className="cm-node-name">{n.name}</span>
                      <span className="cm-deg" title={tr('số quan hệ')}>{n.degree}</span>
                      <ChevronRight size={13} aria-hidden="true" className="po-chev" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cm-detail" aria-live="polite">
            {!sel ? (
              report ? <div className="cm-report"><Markdown text={report.content} /></div> : null
            ) : (
              <>
                <h3 className="cm-title"><Badge tone={TYPE_TONE[sel.type] || 'neutral'}>{TYPE_LABEL[sel.type] || sel.type}</Badge> {sel.name}</h3>
                {!related ? <p className="po-empty">{tr('đang tải…')}</p> : related.length === 0 ? <p className="po-empty">{tr('Không có quan hệ nào.')}</p> : (
                  <ul className="cm-rel">
                    {related.map((r, i) => (
                      <li key={i}>
                        <span className="cm-rel-verb">{(EDGE_LABEL[r.edgeType] || [r.edgeType, r.edgeType])[r.direction === 'out' ? 0 : 1]}</span>
                        <button type="button" className="linklike" onClick={() => setSel({ id: `${r.entityType}:${r.entityKey}`, type: r.entityType, key: r.entityKey, name: r.entityName })}>
                          {r.entityName}
                        </button>
                        <Badge tone={TYPE_TONE[r.entityType] || 'neutral'}>{TYPE_LABEL[r.entityType] || r.entityType}</Badge>
                        <span className="faint cm-rel-src">{r.sourceTitle}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSel(null)}>{tr('Về tổng quan')}</Button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
