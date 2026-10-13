import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import StepModels from './StepModels.jsx';
import { fetchProviders, saveProviders, testProvider, saveModelDefaults, restartGateway } from '../lib/api.js';

export default function ProvidersModal({ onClose }) {
  const [info, setInfo] = useState(null);
  const [edits, setEdits] = useState({});       // id -> { api_key, base_url, label }
  const [defaults, setDefaults] = useState(null);
  const [msg, setMsg] = useState({});           // id -> status text
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCustom, setNewCustom] = useState('');

  const load = async () => {
    const d = await fetchProviders();
    setInfo(d);
    setDefaults(prev => prev || d.defaults);
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
      setMsg(m => ({ ...m, [id]: `✓ ${r.models.length} model` }));
      await load();
    } catch (e) { setMsg(m => ({ ...m, [id]: `✗ ${e.message}` })); }
  };

  const remove = async id => { await saveProviders({ [id]: { remove: true } }); await load(); };

  const addCustom = async () => {
    const slug = newCustom.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return;
    await saveProviders({ [`custom-${slug}`]: { label: newCustom.trim(), base_url: '' } });
    setNewCustom('');
    await load();
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      await saveKeys();
      await saveModelDefaults(defaults);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const gw = async () => {
    setMsg(m => ({ ...m, _gw: 'đang khởi động lại…' }));
    try { const r = await restartGateway(); setMsg(m => ({ ...m, _gw: r.ok ? '✓ đã chạy' : `✗ ${r.output}` })); await load(); }
    catch (e) { setMsg(m => ({ ...m, _gw: `✗ ${e.message}` })); }
  };

  return (
    <Modal wide title="Nhà cung cấp AI" onClose={onClose}
      buttons={[{ label: 'Đóng', fn: onClose, disabled: busy }, { label: busy ? 'Đang lưu…' : 'Lưu', cls: 'add', fn: save, disabled: busy || !info }]}>
      {!info ? <p className="m-text">Đang tải…</p> : (
        <>
          <div className="prov-row">
            <span className="prov-name">Claude</span>
            <span className="prov-ok">✓ dùng tài khoản Claude đã đăng nhập trên máy</span>
          </div>
          {Object.entries(info.providers).map(([id, p]) => (
            <div className="prov-row" key={id}>
              <span className="prov-name">{p.label}</span>
              {p.needsUrl && (
                <input className="prov-in" placeholder={info.catalog[id]?.defaultUrl || 'https://…/v1'}
                  defaultValue={p.base_url} onChange={e => edit(id, 'base_url', e.target.value)} />
              )}
              {!p.keyless && (
                <input className="prov-in" type="password" autoComplete="off"
                  placeholder={p.key_hint ? `đã lưu ${p.key_hint} — nhập để thay` : 'API key'}
                  onChange={e => edit(id, 'api_key', e.target.value)} />
              )}
              <button onClick={() => test(id)}>Kiểm tra</button>
              {(p.configured || p.custom) && <button className="warn" onClick={() => remove(id)} title="xoá nhà cung cấp này">🗑</button>}
              <span className="prov-msg">{msg[id] || (p.models.length ? `${p.models.length} model` : '')}</span>
            </div>
          ))}
          <div className="prov-row">
            <input className="prov-in" placeholder="Tên nhà cung cấp tuỳ chỉnh (URL tương thích OpenAI)"
              value={newCustom} onChange={e => setNewCustom(e.target.value)} />
            <button onClick={addCustom}>＋ Thêm</button>
          </div>
          <div className="prov-row">
            <span className="prov-name">Gateway</span>
            <span className={info.gateway.running ? 'prov-ok' : 'prov-msg'}>{info.gateway.running ? '● đang chạy :4000' : '○ chưa chạy (tự bật khi cần)'}</span>
            <button onClick={gw}>Khởi động lại</button>
            <span className="prov-msg">{msg._gw || ''}</span>
          </div>
          <div className="m-l" style={{ marginTop: 14 }}>AI mặc định cho từng bước</div>
          {defaults && <StepModels info={info} value={defaults} onChange={setDefaults} />}
          <p className="m-hint">Key chỉ lưu trên máy này (config/providers.json). Bấm Kiểm tra để lấy danh sách model của hãng.</p>
        </>
      )}
      {error && <p className="m-err">{error}</p>}
    </Modal>
  );
}
