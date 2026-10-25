import React, { useEffect, useState } from 'react';
import { Trash2, Plus, Check, RotateCcw } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Modal from './Modal.jsx';
import StepModels from './StepModels.jsx';
import ModelSelect from './ModelSelect.jsx';
import { claudeGeminiModels, claudeGeminiStudio, geminiModel } from '../lib/modelPresets.js';
import { fetchProviders, saveProviders, testProvider, saveClaudeAuth, saveStudioModels, saveModelDefaults, saveLaneModelDefaults, restartGateway } from '../lib/api.js';

export default function ProvidersModal({ lanes = [], onClose }) {
  const [info, setInfo] = useState(null);
  const [edits, setEdits] = useState({});       // id -> { api_key, base_url, label }
  const [defaults, setDefaults] = useState(null);
  const [laneDefs, setLaneDefs] = useState({}); // laneNumStr -> { ...models, impl_agents, effort } | { reset: true }
  const [scope, setScope] = useState('global'); // 'global' | '1' | '2' ...
  const [msg, setMsg] = useState({});           // id -> status text
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCustom, setNewCustom] = useState('');

  const load = async () => {
    const d = await fetchProviders();
    setInfo(d);
    setDefaults(prev => prev || d.defaults);
    setLaneDefs(d.lane_defaults || {});
  };
  useEffect(() => { load().catch(e => setError(e.message)); }, []);

  const edit = (id, k, v) => setEdits(e => ({ ...e, [id]: { ...(e[id] || {}), [k]: v } }));

  const saveKeys = async () => {
    if (!Object.keys(edits).length) return;
    await saveProviders(edits);
    setEdits({});
  };

  const test = async id => {
    setMsg(m => ({ ...m, [id]: 'đang kiểm tra…' }));
    try {
      await saveKeys();
      const r = await testProvider(id);
      setMsg(m => ({ ...m, [id]: `${r.models.length} model` }));
      await load();
    } catch (e) { setMsg(m => ({ ...m, [id]: `lỗi: ${e.message}` })); }
  };

  const remove = async id => {
    const label = info?.providers[id]?.label || id;
    if (!window.confirm(`Xoá nhà cung cấp ${label}? Key đã lưu sẽ mất.`)) return;
    try { setError(''); await saveProviders({ [id]: { remove: true } }); await load(); }
    catch (e) { setError(e.message); }
  };

  const addCustom = async () => {
    const slug = newCustom.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return;
    try {
      setError('');
      await saveProviders({ [`custom-${slug}`]: { label: newCustom.trim(), base_url: '' } });
      setNewCustom('');
      await load();
    } catch (e) { setError(e.message); }
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      await saveKeys();
      await saveModelDefaults(defaults);
      for (const [ln, cfg] of Object.entries(laneDefs)) {
        await saveLaneModelDefaults(ln, cfg);
      }
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  // Applies at once: the next AI run (lane step, lane session, studio) uses the chosen account.
  const setAuth = async mode => {
    setError('');
    try { const r = await saveClaudeAuth(mode); setInfo(i => ({ ...i, claude_auth: r.claude_auth })); }
    catch (e) { setError(e.message); }
  };

  // The idea chat's roles: their own models (Gemini here never changes what the lanes run). Saved at once.
  const setStudioModel = async (role, value) => {
    setError(''); setMsg(m => ({ ...m, _studio: 'đang lưu…' }));
    try {
      const r = await saveStudioModels({ ...info.studio_models, [role]: value });
      setInfo(i => ({ ...i, studio_models: r.studio_models }));
      setMsg(m => ({ ...m, _studio: 'đã lưu' }));
    } catch (e) { setMsg(m => ({ ...m, _studio: '' })); setError(e.message); }
  };

  const gw = async () => {
    setMsg(m => ({ ...m, _gw: 'đang khởi động lại…' }));
    try { const r = await restartGateway(); setMsg(m => ({ ...m, _gw: r.ok ? 'đã chạy' : `lỗi: ${r.output}` })); await load(); }
    catch (e) { setMsg(m => ({ ...m, _gw: `lỗi: ${e.message}` })); }
  };

  const laneNumbers = [...new Set([
    ...lanes.map(l => String(l.lane)),
    ...Object.keys(laneDefs).filter(k => !laneDefs[k]?.reset),
    '1', '2', '3',
  ])].sort((a, b) => Number(a) - Number(b));

  const currentModelValue = scope === 'global'
    ? defaults
    : (laneDefs[scope] && !laneDefs[scope].reset ? laneDefs[scope] : defaults);

  const handleModelChange = nextVal => {
    if (scope === 'global') {
      setDefaults(nextVal);
    } else {
      setLaneDefs(prev => ({ ...prev, [scope]: nextVal }));
    }
  };

  const isCustomForScope = scope !== 'global' && laneDefs[scope] && !laneDefs[scope].reset;

  return (
    <Modal wide title="Nhà cung cấp AI & Cấu hình Model theo Lane" onClose={onClose}
      buttons={[{ label: 'Đóng', fn: onClose, disabled: busy }, { label: busy ? 'Đang lưu…' : 'Lưu', cls: 'add', fn: save, disabled: busy || !info }]}>
      {!info ? <p className="m-text">Đang tải…</p> : (
        <>
          <fieldset className="prov-auth">
            <legend className="prov-name">Claude chạy bằng</legend>
            {[
              ['login', 'Tài khoản Claude đăng nhập trên máy', 'Mặc định. Không dùng API key.'],
              ['api_key', 'API key Anthropic khi có', 'Có key hợp lệ (sk-ant-api…) thì dùng key; chưa có key, key sai hoặc hết tiền thì tự quay về tài khoản đăng nhập.'],
            ].map(([id, label, hint]) => (
              <label key={id} className={`prov-auth-opt${info.claude_auth?.mode === id ? ' on' : ''}`}>
                <input type="radio" name="claude-auth" checked={(info.claude_auth?.mode || 'login') === id} onChange={() => setAuth(id)} />
                <span><b>{label}</b><small>{hint}</small></span>
              </label>
            ))}
            <p className={info.claude_auth?.using === 'api_key' ? 'prov-ok' : 'prov-msg'} role="status">
              <Check size={13} strokeWidth={2} aria-hidden="true" />{' '}
              Đang dùng: {info.claude_auth?.using === 'api_key' ? 'API key Anthropic' : 'tài khoản đăng nhập trên máy'}
              {info.claude_auth?.why ? ` — ${info.claude_auth.why}` : ''}
            </p>
          </fieldset>
          {info.studio_roles && (
            <fieldset className="prov-auth">
              <legend className="prov-name">Chat ý tưởng</legend>
              <p className="prov-msg" style={{ margin: 0 }}>Model của từng vai trong <b>Ý tưởng sản phẩm</b>. Riêng cho chat ý tưởng — không đổi model của các lane. Model không phải Claude chạy qua cổng LiteLLM, không tốn hạn mức Claude.</p>
              {info.studio_roles.map(r => (
                <div className="prov-row" key={r.id} style={{ borderBottom: 0, padding: '2px 0' }}>
                  <span className="prov-name" style={{ width: 'auto', minWidth: 260, fontWeight: 500 }}>{r.label}</span>
                  <ModelSelect id={`studio-${r.id}`} value={info.studio_models?.[r.id] || ''} info={info} openhands={false}
                    label={`Model — ${r.label}`} onChange={v => setStudioModel(r.id, v)} />
                </div>
              ))}
              <div className="prov-row" style={{ borderBottom: 0 }}>
                <Button size="sm" disabled={!claudeGeminiStudio(info)} title={geminiModel(info) ? '' : 'Nhập key Gemini và bấm Kiểm tra trước'}
                  onClick={async () => { const m = claudeGeminiStudio(info); for (const [r, v] of Object.entries(m)) await setStudioModel(r, v); }}>
                  Bộ Claude + Gemini
                </Button>
                <span className="prov-msg">{msg._studio || 'PM, Thiết kế: Gemini · Kiến trúc sư: Claude Sonnet'}</span>
              </div>
            </fieldset>
          )}
          {Object.entries(info.providers).map(([id, p]) => (
            <div className="prov-row" key={id}>
              <span className="prov-name">{p.label}</span>
              {p.needsUrl && (
                <input className="prov-in" placeholder={info.catalog[id]?.defaultUrl || 'https://…/v1'}
                  defaultValue={p.base_url} onChange={e => edit(id, 'base_url', e.target.value)} />
              )}
              {p.workspace && (
                <input className="prov-in" placeholder="Workspace ID (wrkspc_…) — nếu key không gắn workspace"
                  aria-label={`Workspace ID — ${p.label}`}
                  defaultValue={p.workspace_id} onChange={e => edit(id, 'workspace_id', e.target.value)} />
              )}
              {!p.keyless && (
                <input className="prov-in" type="password" autoComplete="off"
                  placeholder={p.key_hint ? `đã lưu ${p.key_hint} — nhập để thay` : 'API key'}
                  onChange={e => edit(id, 'api_key', e.target.value)} />
              )}
              <Button size="sm" onClick={() => test(id)}>Kiểm tra</Button>
              {(p.configured || p.custom) && <Button size="sm" variant="danger" icon={Trash2} onClick={() => remove(id)} title="xoá nhà cung cấp này" aria-label="xoá nhà cung cấp này" />}
              <span className="prov-msg">{msg[id] || (p.models.length ? `${p.models.length} model` : '')}</span>
            </div>
          ))}
          <div className="prov-row">
            <input className="prov-in" placeholder="Tên nhà cung cấp tuỳ chỉnh (URL tương thích OpenAI)"
              value={newCustom} onChange={e => setNewCustom(e.target.value)} />
            <Button size="sm" icon={Plus} onClick={addCustom}>Thêm</Button>
          </div>
          <div className="prov-row">
            <span className="prov-name">Gateway</span>
            <span className={info.gateway.running ? 'prov-ok' : 'prov-msg'}>{info.gateway.running ? '● đang chạy :4000' : '○ chưa chạy (tự bật khi cần)'}</span>
            <Button size="sm" onClick={gw}>Khởi động lại</Button>
            <span className="prov-msg">{msg._gw || ''}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 16, marginBottom: 8 }}>
            <div className="m-l" style={{ margin: 0 }}>
              Cấu hình AI cho từng bước — {scope === 'global' ? 'Mặc định chung' : `Riêng Lane ${scope}`}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                size="sm"
                variant={scope === 'global' ? 'primary' : 'ghost'}
                onClick={() => setScope('global')}>
                Mặc định chung
              </Button>
              {laneNumbers.map(ln => {
                const hasCustom = laneDefs[ln] && !laneDefs[ln].reset;
                return (
                  <Button
                    key={ln}
                    size="sm"
                    variant={scope === ln ? 'primary' : 'ghost'}
                    onClick={() => setScope(ln)}>
                    Lane {ln}{hasCustom ? ' ●' : ''}
                  </Button>
                );
              })}
            </div>
          </div>

          {scope !== 'global' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {isCustomForScope
                  ? `Lane ${scope} đang dùng cấu hình model riêng biệt.`
                  : `Lane ${scope} đang kế thừa cấu hình chung. Chỉnh bất kỳ bước nào bên dưới để tạo cấu hình riêng cho Lane ${scope}.`}
              </span>
              {isCustomForScope && (
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setLaneDefs(prev => ({ ...prev, [scope]: { reset: true } }))}>
                  Đặt lại theo mặc định chung
                </Button>
              )}
            </div>
          )}

          {currentModelValue && (
            <div className="prov-preset">
              <Button size="sm" variant="primary" disabled={!geminiModel(info)}
                title={geminiModel(info) ? '' : 'Nhập key Gemini và bấm Kiểm tra trước'}
                onClick={() => handleModelChange(claudeGeminiModels(info, currentModelValue))}>
                Bộ Claude + Gemini (tiết kiệm token)
              </Button>
              <span className="prov-msg">
                Claude Sonnet: phiên chính, code, kiến trúc, QC trình duyệt, kiểm định cuối · {geminiModel(info).replace('gemini:', 'Gemini ') || 'Gemini'}: PM, BA, thiết kế, test, phản biện plan, review code.
                Áp cho {scope === 'global' ? 'mặc định chung (mọi lane không có cấu hình riêng)' : `riêng lane ${scope}`} — bấm Lưu để giữ.
              </span>
            </div>
          )}
          {currentModelValue && <StepModels info={info} value={currentModelValue} onChange={handleModelChange} />}
          <p className="m-hint">Key chỉ lưu trên máy này (config/providers.json). Bạn có thể đặt model mặc định chung hoặc cấu hình mỗi Lane chạy bộ model riêng biệt.</p>
        </>
      )}
      {error && <p className="m-err">{error}</p>}
    </Modal>
  );
}
