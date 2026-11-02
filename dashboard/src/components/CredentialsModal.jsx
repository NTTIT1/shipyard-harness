import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Hourglass, Check, X } from 'lucide-react';
import Modal from './Modal.jsx';
import { fetchCreds, postAction } from '../lib/api.js';
import { tr } from '../lib/i18n.js';

function PwField({ id, label, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <label className="m-l">{label}
      <span className="m-pw">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange}
          autoComplete="off" autoCapitalize="off" spellCheck="false" />
        <button type="button" className={`m-eye ${show ? 'on' : ''}`} tabIndex={-1}
          onClick={() => setShow(!show)} title={tr('show / hide')} aria-label={tr('show / hide')}>{show ? <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={14} strokeWidth={1.75} aria-hidden="true" />}</button>
      </span>
    </label>
  );
}

export default function CredentialsModal({ lane, mode, config, onClose, onDone }) {
  const [creds, setCreds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const focusRef = useRef(null);

  useEffect(() => {
    fetchCreds(lane).then(c => {
      const safe = {
        dev: { email: '', password: '', ...c?.dev },
        local: { email: '', password: '', ...c?.local },
        tracker: { email: '', password: '', ...c?.tracker },
      };
      setCreds(safe);
      setTimeout(() => { if (focusRef.current) focusRef.current.focus(); }, 40);
    }).catch(() => { setResult({ ok: false, output: 'Could not load credentials' }); });
  }, [lane]);

  if (result) {
    return (
      <Modal title={`Lane ${lane}${mode === 'agents' ? ': agents re-populated' : ': credentials'}`}
        onClose={() => { onClose(); onDone(); }}
        buttons={[{ label: tr('Close'), fn: () => { onClose(); onDone(); } }]}>
        <div className={`m-status ${result.ok ? 'ok' : 'bad'}`}>{result.ok ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <X size={14} strokeWidth={2} aria-hidden="true" />} {result.ok ? 'done' : 'failed'}</div>
        <pre className="m-out">{result.output || '(no output)'}</pre>
      </Modal>
    );
  }

  if (busy) {
    return (
      <Modal title={`Lane ${lane}${mode === 'agents' ? ': re-populating agents' : ': applying credentials'}`}
        onClose={() => {}} buttons={[]}>
        <p className="m-spin"><Hourglass size={14} strokeWidth={1.75} aria-hidden="true" />{' '}{tr('Writing creds → re-embedding agents → {0} — please wait…', [mode === 'agents' ? 'syncing MCP' : 're-seeding sessions'])}</p>
      </Modal>
    );
  }

  if (!creds) {
    return (
      <Modal title={tr('Loading…')} onClose={onClose} buttons={[{ label: tr('Cancel'), fn: onClose }]}>
        <p className="m-spin"><Hourglass size={14} strokeWidth={1.75} aria-hidden="true" />{' '}{tr('Loading current credentials…')}</p>
      </Modal>
    );
  }

  const update = (section, field, val) => {
    setCreds(prev => ({ ...prev, [section]: { ...prev[section], [field]: val } }));
  };

  const submit = async () => {
    setBusy(true);
    const ep = mode === 'agents' ? 'repopulate' : 'creds';
    try {
      const d = await postAction(lane, ep, creds);
      setResult({ ok: d.ok !== false, output: (d.error ? 'error: ' + d.error + '\n' : '') + (d.output || '') + '\n\n→ Restart the lane session to load.' });
    } catch (e) {
      setResult({ ok: false, output: String(e) });
    }
    setBusy(false);
  };

  const devSite = config?.dev_site || 'dev site';
  const trackerHost = config?.tracker_host || 'tracker';

  return (
    <Modal title={`Lane ${lane}${mode === 'agents' ? ' — re-populate agents' : ' — credentials'}`}
      onClose={onClose}
      buttons={[
        { label: tr('Cancel'), fn: onClose },
        { label: mode === 'agents' ? 'Regenerate agents' : 'Save & apply', cls: 'add', fn: submit },
      ]}>
      <div className="m-sec">
        <div className="m-sec-h">{tr('dev-QC')}{' '}<span>{tr('· this lane · {0}', [devSite])}</span></div>
        <label className="m-l">{tr('Email')}<input ref={focusRef} type="text" value={creds.dev.email}
          onChange={e => update('dev', 'email', e.target.value)} autoComplete="off" spellCheck="false" /></label>
        <PwField id="cr-dev-pw" label={tr('Password')} value={creds.dev.password}
          onChange={e => update('dev', 'password', e.target.value)} />
      </div>
      <div className="m-sec">
        <div className="m-sec-h">{tr('qc-local')}{' '}<span>{tr('· shared · seeded lane account')}</span></div>
        <label className="m-l">{tr('Email')}<input type="text" value={creds.local.email}
          onChange={e => update('local', 'email', e.target.value)} autoComplete="off" spellCheck="false" /></label>
        <PwField id="cr-loc-pw" label={tr('Password')} value={creds.local.password}
          onChange={e => update('local', 'password', e.target.value)} />
      </div>
      <div className="m-sec">
        <div className="m-sec-h">{tr('ticketer')}{' '}<span>{tr('· shared · {0}', [trackerHost])}</span></div>
        <label className="m-l">{tr('Email')}<input type="text" value={creds.tracker.email}
          onChange={e => update('tracker', 'email', e.target.value)} autoComplete="off" spellCheck="false" /></label>
        <PwField id="cr-trk-pw" label={tr('Password')} value={creds.tracker.password}
          onChange={e => update('tracker', 'password', e.target.value)} />
      </div>
      <p className="m-hint">
        {mode === 'agents'
          ? "Regenerates this lane's agents + .mcp.json from the current harness templates, embedding these accounts."
          : "Saves these accounts, re-embeds them in this lane's agents, and re-seeds the sessions."}
        {' '}<b>{tr('qc-local')}</b> &amp; <b>{tr('ticketer')}</b>{' '}{tr('are shared across all lanes.')}</p>
    </Modal>
  );
}
