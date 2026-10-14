import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
export default function Menu({ items, label = 'Thêm thao tác' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const btns = useRef([]);
  useEffect(() => {
    if (!open) return undefined;
    const out = e => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    setTimeout(() => btns.current[0]?.focus(), 0);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  const nav = (e, i) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      btns.current[n]?.focus();
    }
  };
  return (
    <div className="menu" ref={wrap}>
      <button className="iconbtn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <button key={it.label} role="menuitem" ref={el => { btns.current[i] = el; }}
                className={`menu-item${it.danger ? ' danger' : ''}`} onKeyDown={e => nav(e, i)}
                onClick={() => { setOpen(false); it.onSelect(); }}>
                {Icon && <Icon size={15} strokeWidth={1.75} aria-hidden="true" />}<span>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
