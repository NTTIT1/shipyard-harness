import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X, FileText, Upload, Sparkles, Eye, Loader2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Modal from '../Modal.jsx';
import Markdown from '../Markdown.jsx';
import { teamApi, roleKeys, toggleRole, skillRows, roleLibrary, skillIdFrom, parseSkillMd, SKILL_ID_RE } from '../../lib/team.js';
import { tr } from '../../lib/i18n.js';
import '../../styles/skills.css';

const KIND = {
  new: ['accent', tr('Mới · chờ duyệt')],
  installed: ['ok', tr('Cài sẵn')],
  repo: ['neutral', tr('Trong repo')],
  catalog: ['info', tr('Gợi ý Shipyard')],
  unknown: ['warn', tr('Không tìm thấy')],
};
const FILTER_LABEL = { suggested: tr('Gợi ý'), all: tr('Tất cả'), repo: tr('Trong repo'), installed: tr('Cài sẵn'), catalog: tr('Shipyard'), new: tr('Mới thêm') };
const PAGE = 30;

const Kind = ({ k }) => <span className={`sk-kind sk-kind-${KIND[k]?.[0] || 'neutral'}`}>{KIND[k]?.[1] || k}</span>;

/**
 * "Kỹ năng AI": pick a role, see the skills it uses, add more from a searchable library. Scales to
 * hundreds of skills (search + filters + paging) where a skill × role grid of checkboxes does not.
 * Skills a person writes (.md) join the library as "Mới" and go into the repo with the next approval.
 */
export default function SkillLibrary({ pid, s, team, setTeam, newSkills, setNewSkills, locked }) {
  const roles = roleKeys(team);
  const [role, setRole] = useState(roles.includes('DEV') ? 'DEV' : roles[0]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('suggested');
  const [limit, setLimit] = useState(PAGE);
  const [preview, setPreview] = useState(null);
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => skillRows(s, team, newSkills), [s, team, newSkills]);
  const lib = useMemo(() => roleLibrary(rows, team, role, { q, filter }), [rows, team, role, q, filter]);
  useEffect(() => setLimit(PAGE), [role, q, filter]);
  // Nothing suggested for this role: show the whole library instead of an empty list.
  useEffect(() => { if (filter === 'suggested' && !lib.counts.suggested && lib.counts.all) setFilter('all'); }, [role]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = r => team.roles[r]?.label || r;
  const toggle = id => setTeam(t => toggleRole(t, role, 'skills', id));

  return (
    <section className="card-panel sk" aria-labelledby="sk-h">
      <header className="sk-head">
        <div>
          <h3 id="sk-h" className="tm-h">{tr('Kỹ năng AI')}</h3>
          <p>{tr('Chọn một vai trò, rồi thêm kỹ năng từ thư viện. Kỹ năng là một file .md hướng dẫn AI cách làm; có hiệu lực sau khi duyệt.')}</p>
        </div>
        {!locked && <Button icon={Plus} onClick={() => setAdding(true)}>{tr('Thêm kỹ năng (.md)')}</Button>}
      </header>

      <div className="sk-body">
        <nav className="sk-roles" role="tablist" aria-label={tr('Vai trò AI')}>
          {roles.map(r => {
            const n = (team.roles[r]?.skills || []).length;
            return (
              <button key={r} type="button" role="tab" aria-selected={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                <span>{label(r)}</span><span className="sk-n">{n}</span>
              </button>
            );
          })}
        </nav>

        <div className="sk-pane" role="tabpanel" aria-label={label(role)}>
          <div className="sk-sec-head"><h4>{tr('{0} đang dùng', [label(role)])}</h4><span>{lib.used.length}</span></div>
          {lib.used.length ? (
            <ul className="sk-list sk-used">
              {lib.used.map(sk => (
                <li key={sk.id} className="sk-row">
                  <button type="button" className="sk-main" onClick={() => setPreview(sk)} aria-label={tr('Xem kỹ năng {0}', [sk.label])}>
                    <span className="sk-ic"><Sparkles size={14} aria-hidden="true" /></span>
                    <span className="sk-text"><b>{sk.label}</b><Kind k={sk.kind} />{sk.desc && <small>{sk.desc}</small>}</span>
                  </button>
                  {!locked && <button type="button" className="sk-btn sk-remove" aria-label={tr('Bỏ {0} khỏi {1}', [sk.label, label(role)])} onClick={() => toggle(sk.id)}><X size={14} /></button>}
                </li>
              ))}
            </ul>
          ) : <p className="sk-empty">{tr('Vai trò này chưa dùng kỹ năng nào — thêm từ thư viện bên dưới.')}</p>}

          <div className="sk-lib-head">
            <h4>{tr('Thư viện')}</h4>
            <label className="sk-search">
              <Search size={14} aria-hidden="true" />
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={tr('Tìm theo tên hoặc mô tả…')} aria-label={tr('Tìm kỹ năng')} />
            </label>
          </div>
          <div className="sk-filters" role="radiogroup" aria-label={tr('Lọc kỹ năng')}>
            {Object.keys(FILTER_LABEL).filter(f => f === 'suggested' || f === 'all' || lib.counts[f]).map(f => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {FILTER_LABEL[f]}<span>{lib.counts[f]}</span>
              </button>
            ))}
          </div>
          {lib.available.length ? (
            <ul className="sk-list">
              {lib.available.slice(0, limit).map(sk => (
                <li key={sk.id} className="sk-row">
                  <button type="button" className="sk-main" onClick={() => setPreview(sk)} aria-label={tr('Xem kỹ năng {0}', [sk.label])}>
                    <span className="sk-ic muted"><FileText size={14} aria-hidden="true" /></span>
                    <span className="sk-text"><b>{sk.label}</b><Kind k={sk.kind} />
                      {filter !== 'suggested' && sk.suggested.includes(role) && <span className="sk-sug">{tr('Gợi ý cho vai trò này')}</span>}
                      {sk.desc && <small>{sk.desc}</small>}</span>
                  </button>
                  {!locked && <button type="button" className="sk-btn sk-add" onClick={() => toggle(sk.id)} aria-label={tr('Thêm {0} cho {1}', [sk.label, label(role)])}><Plus size={14} />{tr('Thêm')}</button>}
                </li>
              ))}
            </ul>
          ) : <p className="sk-empty">{q ? tr('Không có kỹ năng nào khớp “{0}”.', [q]) : tr('Không còn kỹ năng nào trong mục này.')}</p>}
          {lib.available.length > limit && (
            <button type="button" className="sk-more" onClick={() => setLimit(l => l + PAGE)}>{tr('Hiện thêm {0} kỹ năng', [Math.min(PAGE, lib.available.length - limit)])}</button>
          )}
        </div>
      </div>

      {preview && <SkillPreview pid={pid} sk={preview} text={newSkills[preview.id]} onClose={() => setPreview(null)} />}
      {adding && (
        <AddSkills roles={roles} label={label} defaultRole={role} rows={rows} onClose={() => setAdding(false)}
          onAdd={drafts => {
            setNewSkills(cur => ({ ...cur, ...Object.fromEntries(drafts.map(d => [d.id, d.text])) }));
            setTeam(t => drafts.reduce((acc, d) => d.roles.reduce((a, r) => ((a.roles[r]?.skills || []).includes(d.id) ? a : toggleRole(a, r, 'skills', d.id)), acc), t));
            if (drafts.some(d => d.roles.includes(role))) setFilter('suggested');
            setAdding(false);
          }} />
      )}
    </section>
  );
}

/** A skill's text as it reaches the AI. */
function SkillPreview({ pid, sk, text, onClose }) {
  const [content, setContent] = useState(text ?? null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (text != null) return;
    teamApi.skill(pid, sk.id).then(r => setContent(r.content), e => setErr(e.message));
  }, [pid, sk.id, text]);
  const body = content == null ? null : parseSkillMd(content).body;
  return (
    <Modal title={sk.label} wide onClose={onClose}>
      <div className="sk-preview">
        <p className="sk-preview-meta"><Kind k={sk.kind} /> <code>.claude/skills/{sk.id}/SKILL.md</code></p>
        {sk.desc && <p className="sk-preview-desc">{sk.desc}</p>}
        {err && <p className="m-err">{err}</p>}
        {content == null && !err && <p className="faint"><Loader2 size={14} className="wz-spin" /> {tr('Đang tải…')}</p>}
        {body != null && <div className="sk-preview-body"><Markdown text={body} /></div>}
      </div>
    </Modal>
  );
}

/** Add skills written as .md: drop / choose files or paste one, name each, pick who uses it. */
function AddSkills({ roles, label, defaultRole, rows, onAdd, onClose }) {
  const [drafts, setDrafts] = useState([]);
  const [paste, setPaste] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const known = new Map(rows.map(r => [r.id, r]));
  const draft = (name, text) => {
    const p = parseSkillMd(text);
    return { key: `${name}-${Math.random()}`, id: skillIdFrom(p.name || name || p.title) || '', text, desc: p.desc, roles: [defaultRole] };
  };
  const readFiles = async files => {
    const md = [...files].filter(f => /\.(md|markdown|txt)$/i.test(f.name));
    const out = [];
    for (const f of md) out.push(draft(f.name, await f.text()));
    setDrafts(d => [...d, ...out]);
  };
  const problem = d => {
    if (!SKILL_ID_RE.test(d.id)) return tr('Tên chỉ gồm chữ thường, số, - hoặc _');
    if (!d.text.trim()) return tr('Nội dung rỗng');
    if (d.text.length > 60000) return tr('Quá dài (tối đa 60.000 ký tự)');
    if (known.get(d.id)?.kind === 'installed') return tr('Trùng tên kỹ năng cài sẵn — đặt tên khác');
    if (drafts.filter(x => x.id === d.id).length > 1) return tr('Trùng tên với kỹ năng khác trong danh sách');
    return '';
  };
  const ok = drafts.length > 0 && drafts.every(d => !problem(d));
  const set = (key, patch) => setDrafts(ds => ds.map(d => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <Modal title={tr('Thêm kỹ năng cho AI')} wide onClose={onClose}
      buttons={[{ label: tr('Huỷ'), fn: onClose }, { label: drafts.length ? tr('Thêm {0} kỹ năng', [drafts.length]) : tr('Thêm kỹ năng'), cls: 'add', disabled: !ok, fn: () => onAdd(drafts) }]}>
      <div className="sk-adder">
        <div className={`sk-drop${over ? ' over' : ''}`}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); readFiles(e.dataTransfer.files); }}>
          <Upload size={20} aria-hidden="true" />
          <div><b>{tr('Kéo thả file .md vào đây')}</b><span>{tr('hoặc')}{' '}<button type="button" className="linklike" onClick={() => input.current?.click()}>{tr('chọn file')}</button>{' '}{tr('— chọn được nhiều file một lần')}</span></div>
          <input ref={input} type="file" accept=".md,.markdown,.txt" multiple hidden onChange={e => { readFiles(e.target.files); e.target.value = ''; }} />
        </div>
        <details className="sk-paste">
          <summary>{tr('Hoặc dán nội dung')}</summary>
          <textarea rows={6} value={paste} onChange={e => setPaste(e.target.value)} placeholder={tr('# Tên kỹ năng\n- Quy tắc 1\n- Quy tắc 2')} spellCheck={false} />
          <Button size="sm" disabled={!paste.trim()} onClick={() => { setDrafts(d => [...d, draft('', paste)]); setPaste(''); }}>{tr('Thêm vào danh sách')}</Button>
        </details>

        {drafts.length > 0 && (
          <ul className="sk-drafts">
            {drafts.map(d => {
              const why = problem(d);
              const prev = known.get(d.id);
              return (
                <li key={d.key} className={why ? 'bad' : ''}>
                  <div className="sk-draft-top">
                    <label className="sk-draft-id">{tr('Tên')}
                      <input value={d.id} onChange={e => set(d.key, { id: e.target.value.toLowerCase() })} aria-invalid={!!why} spellCheck={false} />
                    </label>
                    <button type="button" className="sk-btn" aria-label={tr('Bỏ {0}', [d.id])} onClick={() => setDrafts(ds => ds.filter(x => x.key !== d.key))}><X size={14} /></button>
                  </div>
                  {d.desc && <p className="sk-draft-desc">{d.desc}</p>}
                  {why ? <p className="sk-draft-err" role="alert">{why}</p>
                    : prev && prev.kind !== 'new' && <p className="sk-draft-note">{tr('Sẽ thay bản “{0}” đang có ({1}).', [prev.label, KIND[prev.kind]?.[1] || prev.kind])}</p>}
                  <div className="sk-draft-roles" role="group" aria-label={tr('Vai trò dùng kỹ năng này')}>
                    <span>{tr('Dùng cho')}</span>
                    {roles.map(r => {
                      const on = d.roles.includes(r);
                      return <button key={r} type="button" aria-pressed={on} className={on ? 'on' : ''}
                        onClick={() => set(d.key, { roles: on ? d.roles.filter(x => x !== r) : [...d.roles, r] })}>{label(r).replace(/^AI /, '')}</button>;
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="faint">{tr('Kỹ năng được thêm vào')}{' '}<code>.claude/skills/&lt;tên&gt;/SKILL.md</code>{' '}{tr('của repo khi bạn bấm "Gửi duyệt" và thay đổi được duyệt.')}</p>
      </div>
    </Modal>
  );
}
