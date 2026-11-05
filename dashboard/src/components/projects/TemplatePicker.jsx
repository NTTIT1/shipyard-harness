import React from 'react';
import { Choice } from './WizardSteps.jsx';
import FrameworkManager from './FrameworkManager.jsx';
import { TEMPLATE_KINDS, languagesFor, frontendStacks, findStack, defaultOptions } from '../../lib/scaffold.js';
import { tr } from '../../lib/i18n.js';

/**
 * "Từ khung": the person picks what the project is made of — one app or backend + frontend, the
 * framework of each, its database and options — before the chat starts. value/onChange:
 * { kind: 'single'|'fullstack', stack, options, frontend: { stack, options } }.
 */
export default function TemplatePicker({ catalog, value, onChange, onFrameworksChanged }) {
  const [managing, setManaging] = React.useState(false);
  const t = value;
  const set = patch => onChange({ ...t, ...patch });
  const stack = findStack(catalog, t.stack);
  const two = t.kind === 'fullstack' || t.kind === 'mobile';
  const fstack = two ? findStack(catalog, t.frontend?.stack) : null;
  const backends = languagesFor(catalog, t.kind).flatMap(l => l.stacks.map(s => ({ ...s, languageLabel: l.label })));
  const db = stack?.options.find(o => o.id === 'db');

  return (
    <div className="wz-fields tp">
      <fieldset className="wz-grid">
        <legend className="form-label">{tr('Dự án gồm những gì?')}</legend>
        {TEMPLATE_KINDS.map(k => (
          <Choice key={k.id} name="tp-kind" value={k.id} current={t.kind} title={k.label} desc={k.desc}
            onPick={v => {
              if (v === t.kind) return;
              const fe = v === 'fullstack' || v === 'mobile' ? frontendStacks(catalog, v)[0] : null;
              onChange({ kind: v, stack: '', options: {}, frontend: { stack: fe?.id || '', options: fe ? defaultOptions(fe) : {} } });
            }} />
        ))}
      </fieldset>

      <div className="form-field">
        <label className="form-label" htmlFor="tp-stack">{two ? tr('Backend') : tr('Ngôn ngữ & framework')}</label>
        <select id="tp-stack" className="msel" value={t.stack} onChange={e => set({ stack: e.target.value, options: defaultOptions(findStack(catalog, e.target.value)) })}>
          <option value="">{tr('— chọn —')}</option>
          {backends.map(s => (
            <option key={s.id} value={s.id} disabled={!s.available}>{s.languageLabel} · {s.label}{s.available ? '' : ` (${tr('máy chưa cài đủ công cụ')})`}</option>
          ))}
        </select>
        {stack?.description && <span className="faint">{stack.company ? stack.description : tr(stack.description)}</span>}
        {!two && (
          <button type="button" className="linklike fw-manage-link" onClick={() => setManaging(m => !m)} aria-expanded={managing}>
            {managing ? tr('Đóng quản lý framework công ty') : tr('Framework của công ty…')}
          </button>
        )}
      </div>
      {managing && <FrameworkManager onSaved={() => onFrameworksChanged?.()} />}

      {db && (
        <div className="form-field">
          <label className="form-label" htmlFor="tp-db">Database</label>
          <select id="tp-db" className="msel" value={t.options.db ?? ''} onChange={e => set({ options: { ...t.options, db: e.target.value } })}>
            {db.choices.map(c => <option key={c.id} value={c.id}>{c.id === 'none' ? tr('Không dùng database') : c.label}</option>)}
          </select>
        </div>
      )}

      {stack && <Options options={stack.options.filter(o => o.id !== 'db')} values={t.options} idPrefix="tp-o"
        onChange={(k, v) => set({ options: { ...t.options, [k]: v } })} />}

      {two && (
        <>
          <div className="form-field">
            <label className="form-label" htmlFor="tp-fe">{t.kind === 'mobile' ? tr('App điện thoại') : tr('Frontend')}</label>
            <select id="tp-fe" className="msel" value={t.frontend?.stack || ''}
              onChange={e => set({ frontend: { stack: e.target.value, options: defaultOptions(findStack(catalog, e.target.value)) } })}>
              <option value="">{tr('— chọn —')}</option>
              {frontendStacks(catalog, t.kind).map(s => (
                <option key={s.id} value={s.id} disabled={!s.available}>{s.languageLabel} · {s.label}{s.available ? '' : ` (${tr('máy chưa cài đủ công cụ')})`}</option>
              ))}
            </select>
          </div>
          {fstack && <Options options={fstack.options.filter(o => o.id !== 'db')} values={t.frontend.options} idPrefix="tp-fo"
            onChange={(k, v) => set({ frontend: { ...t.frontend, options: { ...t.frontend.options, [k]: v } } })} />}
        </>
      )}
    </div>
  );
}

function Options({ options, values, onChange, idPrefix }) {
  return options.map(o => (o.type === 'bool' ? (
    <label key={o.id} className="wz-check">
      <input type="checkbox" checked={!!values[o.id]} onChange={e => onChange(o.id, e.target.checked)} />
      <span>{tr(o.label)}</span>
    </label>
  ) : (
    <div key={o.id} className="form-field">
      <label className="form-label" htmlFor={`${idPrefix}-${o.id}`}>{tr(o.label)}</label>
      {o.type === 'choice' ? (
        <select id={`${idPrefix}-${o.id}`} className="msel" value={values[o.id] ?? ''} onChange={e => onChange(o.id, e.target.value)}>
          {o.choices.map(c => <option key={c.id} value={c.id}>{tr(c.label)}</option>)}
        </select>
      ) : (
        <input id={`${idPrefix}-${o.id}`} value={values[o.id] ?? ''} onChange={e => onChange(o.id, e.target.value.trim())} />
      )}
      {o.help && <span className="faint">{tr(o.help)}</span>}
    </div>
  )));
}
