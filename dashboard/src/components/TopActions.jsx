import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Languages, LogOut, Moon, Settings2, Sun, ChevronDown } from 'lucide-react';
import { LANGS, lang, setLang, tr } from '../lib/i18n.js';
import { initials, avatarColor } from '../lib/avatar.js';
import { isAdmin } from '../lib/users.js';

const LANG_EN = { vi: 'Vietnamese', en: 'English', ja: 'Japanese' };

/**
 * Popover anchored to its trigger: grows out of the button's corner, closes on Esc / outside press /
 * choosing, arrow keys move between its items. Closing plays the same motion back.
 */
function usePopover() {
  // closed → opening (mounted, at its start) → open (animated in) → closing (animating out) → closed
  const [phase, setPhase] = useState('closed');
  const wrap = useRef(null);
  const trigger = useRef(null);
  const open = phase !== 'closed';
  const close = (focusTrigger = false) => {
    setPhase(p => (p === 'closed' ? p : 'closing'));
    if (focusTrigger) trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (phase === 'opening') {
      const raf = requestAnimationFrame(() => setPhase(p => (p === 'opening' ? 'open' : p)));
      return () => cancelAnimationFrame(raf);
    }
    if (phase === 'closing') {
      const t = setTimeout(() => setPhase(p => (p === 'closing' ? 'closed' : p)), 160);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);
  useEffect(() => {
    if (!open) return undefined;
    const out = e => { if (!wrap.current?.contains(e.target)) close(); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(wrap.current?.querySelectorAll('[role^="menuitem"]') || [])];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key); };
  }, [open]);
  useEffect(() => {
    if (phase === 'opening') requestAnimationFrame(() => (wrap.current?.querySelector('[aria-checked="true"]') || wrap.current?.querySelector('[role^="menuitem"]'))?.focus());
  }, [phase]);
  // Re-pressing while it closes reopens from where it is (the CSS transition reverses mid-flight).
  const toggle = () => setPhase(p => (p === 'open' || p === 'opening' ? 'closing' : 'opening'));
  return { open, shown: phase === 'open', wrap, trigger, toggle, close };
}

export function LanguageMenu() {
  const p = usePopover();
  const cur = LANGS.find(l => l.id === lang) || LANGS[0];
  return (
    <div className="ta-wrap" ref={p.wrap}>
      <button ref={p.trigger} type="button" className="ta-btn ta-lang" aria-haspopup="menu" aria-expanded={p.open}
        aria-label={tr('Ngôn ngữ giao diện: {0}', [cur.label])} title={tr('Ngôn ngữ giao diện')} onClick={p.toggle}>
        <Languages size={15} aria-hidden="true" /><span>{cur.short}</span><ChevronDown size={13} className="ta-chev" aria-hidden="true" />
      </button>
      {p.open && (
        <div className={`ta-pop${p.shown ? ' in' : ''}`} role="menu" aria-label={tr('Ngôn ngữ giao diện')}>
          <div className="ta-pop-h">{tr('Ngôn ngữ')}</div>
          {LANGS.map(l => {
            const on = l.id === lang;
            return (
              <button key={l.id} type="button" role="menuitemradio" aria-checked={on} className={`ta-item${on ? ' on' : ''}`}
                lang={l.id} onClick={() => { if (on) p.close(true); else setLang(l.id); }}>
                <span className="ta-code">{l.short}</span>
                <span className="ta-item-text"><b>{l.label}</b>{l.label !== LANG_EN[l.id] && <small lang="en">{LANG_EN[l.id]}</small>}</span>
                {on && <Check size={15} className="ta-check" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark';
  const label = dark ? tr('Giao diện sáng') : tr('Giao diện tối');
  return (
    <button type="button" className="ta-btn ta-icon ta-theme" onClick={onToggle} aria-label={label} title={label}>
      {/* both icons stay mounted so the swap is a cross-fade + quarter turn, never a jump */}
      <Sun size={16} className={`ta-sun${dark ? ' on' : ''}`} aria-hidden="true" />
      <Moon size={16} className={`ta-moon${dark ? '' : ' on'}`} aria-hidden="true" />
    </button>
  );
}

function AccountMenu({ user, onLogout, onProviders }) {
  const p = usePopover();
  const name = user.fullName || (user.email || '').split('@')[0];
  const admin = isAdmin(user);
  return (
    <div className="ta-wrap" ref={p.wrap}>
      <button ref={p.trigger} type="button" className="ta-avatar-btn" aria-haspopup="menu" aria-expanded={p.open}
        aria-label={tr('Tài khoản: {0}', [name])} title={user.email} onClick={p.toggle}>
        <span className="ta-avatar" style={{ background: avatarColor(user.email || '') }} aria-hidden="true">{initials(user.fullName, user.email)}</span>
      </button>
      {p.open && (
        <div className={`ta-pop ta-account${p.shown ? ' in' : ''}`} role="menu" aria-label={tr('Tài khoản')}>
          <div className="ta-me">
            <span className="ta-avatar lg" style={{ background: avatarColor(user.email || '') }} aria-hidden="true">{initials(user.fullName, user.email)}</span>
            <span className="ta-me-text">
              <b>{name}</b>
              <small>{user.email}</small>
              {admin && <span className="ta-role">{tr('Quản trị viên')}</span>}
            </span>
          </div>
          <div className="ta-sep" role="separator" />
          {!admin && onProviders && (
            <button type="button" role="menuitem" className="ta-item" onClick={() => { p.close(); onProviders(); }}>
              <Settings2 size={15} aria-hidden="true" /><span className="ta-item-text"><b>{tr('Nhà cung cấp AI')}</b></span>
            </button>
          )}
          {onLogout && (
            <button type="button" role="menuitem" className="ta-item danger" onClick={() => { p.close(); onLogout(); }}>
              <LogOut size={15} aria-hidden="true" /><span className="ta-item-text"><b>{tr('Đăng xuất')}</b></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Top-right corner: interface language, light/dark, and the signed-in account. */
export default function TopActions({ user, theme, onToggleTheme, onLogout, onProviders }) {
  return (
    <div className="top-actions">
      <LanguageMenu />
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      {user && <AccountMenu user={user} onLogout={onLogout} onProviders={onProviders} />}
    </div>
  );
}
