import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import Button from './ui/Button.jsx';
import IconButton from './ui/IconButton.jsx';

const VARIANT = { add: 'primary', warn: 'danger' };

export default function Modal({ title, children, buttons, onClose, wide }) {
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  }, [onClose]);

  const btns = buttons || [{ label: 'Close', fn: onClose }];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-panel${wide ? ' wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          <span>{title}</span>
          <IconButton icon={X} label="Đóng" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {btns.length > 0 && (
          <div className="modal-foot">
            {btns.map((b, i) => (
              <Button key={i} variant={VARIANT[b.cls] || 'secondary'} icon={b.icon} onClick={b.fn} disabled={b.disabled}>{b.label}</Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
