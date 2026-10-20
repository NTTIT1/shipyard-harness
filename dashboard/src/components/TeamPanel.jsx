import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bot, FileText, Plus, RefreshCw, RotateCcw, Send, Sparkles, Trash2, Upload, Loader2 } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import { teamApi, roleKeys, ruleColumns, toggleRole, forgetRule, ruleChanges, sameTeam, fileToBase64, formatSize, RULE_NAME_RE } from '../lib/team.js';
import { SETUP_STATUS } from '../lib/scaffold.js';
import '../styles/team.css';

const OPEN_TONE = { queued: 'neutral', drafting: 'accent', 'awaiting-review': 'warn', publishing: 'accent', error: 'danger', done: 'ok', cancelled: 'neutral' };

/** Per-project AI team: who reads which rules, the rules themselves, material for the AI Manager. */
export default function TeamPanel({ pid, onOpenRun }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [team, setTeam] = useState(null);
  const [rules, setRules] = useState({});
  const [cur, setCur] = useState('project.md');
  const [newName, setNewName] = useState('');
  const [note, setNote] = useState('');
  const [aiNote, setAiNote] = useState('');
  const fileInput = useRef(null);

  /** `keepEdits`: refresh status/material only, never the rules or matrix being edited. */
  const load = useCallback(async (refresh = false, keepEdits = false) => {
    setLoading(true);
    try {
      const st = await teamApi.state(pid, refresh);
      setS(st);
      if (!keepEdits) { setTeam(st.team); setRules(st.rules || {}); }
      setErr('');
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [pid]);
  useEffect(() => { load(); }, [load]);

  // Follow an open setup run until it settles.
  const status = s?.setup?.status;
  useEffect(() => {
    if (!['queued', 'drafting', 'publishing'].includes(status)) return undefined;
    const t = setInterval(() => teamApi.state(pid).then(st => {
      setS(st);
      if (!['queued', 'drafting', 'publishing'].includes(st.setup?.status)) { setTeam(st.team); setRules(st.rules || {}); }
    }, () => {}), 5000);
    return () => clearInterval(t);
  }, [pid, status]);

  const act = async (label, fn, done, keepEdits = false) => {
    setBusy(label); setErr(''); setMsg('');
    try { await fn(); if (done) setMsg(done); await load(false, keepEdits); } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const changes = useMemo(() => (s ? ruleChanges(s.rules || {}, rules) : {}), [s, rules]);
  const dirty = !!s && (Object.keys(changes).length > 0 || !sameTeam(s.team, team));
  const locked = !s?.canManage || s?.open || !!busy;
  const cols = ruleColumns(rules);
  const curName = cols.includes(cur) ? cur : cols[0];

  if (loading && !s) {
    return <p className="muted-empty"><Loader2 size={14} className="wz-spin" /> Đang tải đội AI… (lần đầu cần clone repo, có thể mất khoảng 1 phút)</p>;
  }
  if (!s) {
    return (
      <div className="alert-banner err" role="alert">
        <AlertCircle size={16} /><div className="alert-banner-content">{err || 'Không tải được'}</div>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => load(true)}>Thử lại</Button>
      </div>
    );
  }

  const setup = s.setup;
  return (
    <div className="tm">
      {err && <div className="alert-banner err" role="alert"><AlertCircle size={16} /><div className="alert-banner-content">{err}</div></div>}
      {msg && <div className="alert-banner ok" role="status"><div className="alert-banner-content">{msg}</div></div>}

      <div className="tm-bar">
        <span className="tm-where">Nhánh <code>{s.branch}</code> · <span className="mono faint" title="Thư mục làm việc trên máy chủ">{s.dir}</span></span>
        {setup && (
          <span className="tm-run">
            <Badge tone={OPEN_TONE[setup.status] || 'neutral'}>{SETUP_STATUS[setup.status] || setup.status}</Badge>
            {setup.title && <span className="faint">{setup.title}</span>}
            {setup.status === 'awaiting-review' && onOpenRun && <Button size="sm" variant="primary" onClick={() => onOpenRun(setup.runId)}>Xem & duyệt</Button>}
            {setup.status === 'error' && s.canManage && (
              <>
                <span className="tm-err">{setup.error}</span>
                <Button size="sm" icon={RotateCcw} disabled={!!busy} onClick={() => act('retry', () => teamApi.retry(pid), 'Đã chạy lại')}>Thử lại</Button>
              </>
            )}
          </span>
        )}
        <Button size="sm" variant="ghost" icon={RefreshCw} disabled={loading} onClick={() => load(true)}>Tải lại</Button>
      </div>

      {!s.adopted ? (
        <section className="card-panel tm-adopt">
          <h3><Bot size={18} /> Dự án chưa có đội AI</h3>
          <p>Shipyard sẽ thêm <code>.shipyard/team.json</code> và bộ luật khởi đầu, rồi <b>AI Manager đọc code thật</b> để soạn luật cho từng vai trò (Dev, Tester, Review, DevOps…).
            Bộ luật chỉ được dùng sau khi bạn duyệt trong "Chờ duyệt"; khi duyệt xong luật được commit vào nhánh <code>{s.branch}</code>.</p>
          <p className="faint">Trong lúc luật chưa được duyệt lần đầu, dự án tạm thời chưa tạo được tính năng mới.</p>
          {s.canManage ? (
            <>
              <label className="form-label" htmlFor="tm-adopt-note">Lưu ý cho AI Manager (không bắt buộc)</label>
              <textarea id="tm-adopt-note" rows={3} value={aiNote} onChange={e => setAiNote(e.target.value)}
                placeholder="Ví dụ: backend Spring chia module theo nghiệp vụ; frontend dùng Ant Design; không dùng Lombok…" />
              <div><Button variant="primary" icon={Sparkles} disabled={!!busy || s.open}
                onClick={() => act('adopt', () => teamApi.adopt(pid, aiNote), 'AI Manager đang soạn luật — xong sẽ có trong "Chờ duyệt"')}>
                {busy === 'adopt' ? 'Đang thiết lập…' : 'Thiết lập đội AI'}</Button></div>
            </>
          ) : <p className="faint">Chỉ Owner, Maintainer hoặc Tech Lead thiết lập được.</p>}
        </section>
      ) : (
        <>
          {s.teamError && <div className="alert-banner err"><AlertCircle size={16} /><div className="alert-banner-content">{s.teamError}</div></div>}
          {team && (
            <section className="card-panel">
              <div className="card-header tm-head"><strong>Ai đọc luật nào</strong>
                <span className="faint">Mỗi vai trò AI chỉ nhận các file được tích (đọc từ nhánh {s.branch}).</span></div>
              <div className="tm-matrix-wrap">
                <table className="tm-matrix">
                  <thead>
                    <tr><th scope="col">Vai trò</th>{cols.map(c => <th key={c} scope="col"><code>{c.replace(/\.md$/, '')}</code></th>)}<th scope="col">Skill</th></tr>
                  </thead>
                  <tbody>
                    {roleKeys(team).map(role => (
                      <tr key={role}>
                        <th scope="row">{team.roles[role]?.label || role}</th>
                        {cols.map(c => {
                          const p = `rules/${c}`;
                          return (
                            <td key={c}>
                              <input type="checkbox" aria-label={`${team.roles[role]?.label || role} đọc ${c}`} disabled={locked}
                                checked={(team.roles[role]?.reads || []).includes(p)} onChange={() => setTeam(t => toggleRole(t, role, 'reads', p))} />
                            </td>
                          );
                        })}
                        <td className="tm-skills">
                          {s.skills.length === 0 && (team.roles[role]?.skills || []).length === 0 && <span className="faint">—</span>}
                          {[...new Set([...s.skills, ...(team.roles[role]?.skills || [])])].map(sk => {
                            const on = (team.roles[role]?.skills || []).includes(sk);
                            return (
                              <button key={sk} type="button" className={`tm-chip${on ? ' on' : ''}`} aria-pressed={on} disabled={locked}
                                onClick={() => setTeam(t => toggleRole(t, role, 'skills', sk))}>{sk}</button>
                            );
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {s.skills.length === 0 && <p className="faint tm-pad">Repo chưa có skill nào trong <code>.claude/skills/</code>.</p>}
            </section>
          )}

          <section className="card-panel">
            <div className="card-header tm-head"><strong>Luật</strong>
              <span className="faint">Sửa trực tiếp rồi "Gửi duyệt" — luật chỉ có hiệu lực sau khi được duyệt.</span></div>
            <div className="tm-rules">
              <nav className="tm-files" aria-label="File luật">
                {cols.map(c => (
                  <button key={c} type="button" className={`tm-file${c === curName ? ' on' : ''}`} onClick={() => setCur(c)}>
                    <FileText size={13} /> <span>{c}</span>
                    {c in changes && <i className="tm-dot" title="Đã sửa" />}
                  </button>
                ))}
                {Object.entries(changes).filter(([, v]) => v === null).map(([n]) => (
                  <span key={n} className="tm-file gone">{n} <span className="faint">(xoá)</span></span>
                ))}
                {!locked && (
                  <form className="tm-new" onSubmit={e => {
                    e.preventDefault();
                    const n = newName.trim().toLowerCase().replace(/\.md$/, '') + '.md';
                    if (!RULE_NAME_RE.test(n)) { setErr('Tên file: chữ thường, số, - hoặc _'); return; }
                    if (n in rules) { setCur(n); setNewName(''); return; }
                    setRules(r => ({ ...r, [n]: `# ${n.replace(/\.md$/, '')}\n\n- \n` }));
                    setCur(n); setNewName('');
                  }}>
                    <input aria-label="Tên file luật mới" placeholder="arch, security…" value={newName} onChange={e => setNewName(e.target.value)} />
                    <Button size="sm" type="submit" icon={Plus}>Thêm</Button>
                  </form>
                )}
              </nav>
              {curName && (
                <div className="tm-editor">
                  <div className="tm-editor-bar">
                    <code>.shipyard/rules/{curName}</code>
                    {!locked && curName !== 'project.md' && (
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => {
                        setRules(r => { const n = { ...r }; delete n[curName]; return n; });
                        setTeam(t => (t ? forgetRule(t, curName) : t));
                      }}>Xoá file</Button>
                    )}
                  </div>
                  <textarea aria-label={`Nội dung ${curName}`} value={rules[curName] ?? ''} readOnly={locked} spellCheck={false}
                    onChange={e => setRules(r => ({ ...r, [curName]: e.target.value }))} />
                </div>
              )}
            </div>
            {dirty && s.canManage && (
              <div className="tm-submit">
                <input aria-label="Ghi chú cho người duyệt" placeholder="Ghi chú cho người duyệt (không bắt buộc)" value={note} onChange={e => setNote(e.target.value)} />
                <Button variant="ghost" disabled={!!busy} onClick={() => { setTeam(s.team); setRules(s.rules); }}>Huỷ thay đổi</Button>
                <Button variant="primary" icon={Send} disabled={!!busy || s.open}
                  onClick={() => act('propose', () => teamApi.propose(pid, { rules: changes, team: sameTeam(s.team, team) ? undefined : team, note }),
                    'Đã gửi thay đổi — vào "Chờ duyệt" để duyệt').then(() => setNote(''))}>
                  {busy === 'propose' ? 'Đang gửi…' : 'Gửi duyệt'}
                </Button>
              </div>
            )}
          </section>

          <section className="card-panel">
            <div className="card-header tm-head"><strong>Tài liệu cho AI</strong>
              <span className="faint">Nghiệp vụ, chuẩn công ty, kiến trúc, code mẫu… AI Manager đọc để soạn luật (là tài liệu tham khảo, không phải mệnh lệnh).</span></div>
            <ul className="tm-human">
              {s.human.map(h => (
                <li key={h.name}>
                  <FileText size={14} />
                  <a href={teamApi.humanUrl(pid, h.name)} target="_blank" rel="noreferrer">{h.name}</a>
                  <span className="faint">{formatSize(h.size)}</span>
                  {!h.committed && <Badge tone="warn" title="Sẽ được commit cùng lần duyệt luật tiếp theo">chưa commit</Badge>}
                  {s.canManage && (
                    <button type="button" className="linklike tm-del" aria-label={`Xoá ${h.name}`} disabled={!!busy}
                      onClick={() => act('del', () => teamApi.deleteHuman(pid, h.name), '', true)}><Trash2 size={13} /></button>
                  )}
                </li>
              ))}
              {s.human.length === 0 && <li className="faint">Chưa có tài liệu.</li>}
            </ul>
            {s.canManage && (
              <div className="tm-pad">
                <input ref={fileInput} type="file" multiple hidden accept=".md,.txt,.json,.yaml,.yml,.csv,.sql,.xml,.html,.java,.kt,.ts,.tsx,.js,.jsx,.py,.pdf,.png,.jpg,.jpeg"
                  onChange={e => {
                    const files = [...e.target.files];
                    e.target.value = '';
                    act('upload', async () => {
                      for (const f of files) await teamApi.putHuman(pid, f.name, await fileToBase64(f));
                    }, `Đã tải lên ${files.length} file — bấm "Soạn lại luật" để AI đọc`, true);
                  }} />
                <Button size="sm" icon={Upload} disabled={!!busy} onClick={() => fileInput.current?.click()}>
                  {busy === 'upload' ? 'Đang tải lên…' : 'Tải tài liệu lên (tối đa 3MB/file)'}</Button>
              </div>
            )}
          </section>

          {s.canManage && (
            <section className="card-panel">
              <div className="card-header tm-head"><strong>Soạn lại luật bằng AI</strong>
                <span className="faint">Khi có tài liệu mới hoặc code đã thay đổi nhiều. Bản mới vào "Chờ duyệt" như lần đầu.</span></div>
              <div className="tm-pad tm-redraft">
                <textarea rows={3} aria-label="Yêu cầu cho AI Manager" value={aiNote} onChange={e => setAiNote(e.target.value)}
                  placeholder="Ví dụ: thêm luật bảo mật cho API; đọc tài liệu kiến trúc mới tải lên…" />
                <div><Button variant="primary" icon={Sparkles} disabled={!!busy || s.open || dirty}
                  title={dirty ? 'Gửi duyệt hoặc huỷ thay đổi đang sửa trước' : undefined}
                  onClick={() => act('redraft', () => teamApi.redraft(pid, aiNote), 'AI Manager đang soạn lại — xong sẽ có trong "Chờ duyệt"').then(() => setAiNote(''))}>
                  {busy === 'redraft' ? 'Đang gửi…' : 'Soạn lại luật'}</Button></div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
