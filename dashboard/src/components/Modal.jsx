import React, { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Button from './ui/Button.jsx';
import IconButton from './ui/IconButton.jsx';
import { createSpring, SPRING, project, rubberband, velocityFrom, prefersReducedMotion } from '../lib/spring.js';

const VARIANT = { add: 'primary', warn: 'danger' };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SHEET_QUERY = '(max-width: 640px)';
const DRAG_SLOP = 6; // px before a press on the grabber becomes a drag

/**
 * Dialog with fluid motion. Desktop: the panel materialises in place (fade + rise + scale) and
 * leaves along the same path. Phones: a bottom sheet that follows the finger from its grabber,
 * rubber-bands upward, and is dismissed by a downward flick (momentum projected). Every
 * transition is a spring on one progress value, so closing mid-opening simply reverses.
 * `onClose` runs after the exit motion; a parent that unmounts the modal itself skips it.
 */
export default function Modal({ title, children, buttons, onClose, wide }) {
  const backdrop = useRef(null);
  const panel = useRef(null);
  const spring = useRef(null);
  const closing = useRef(false);
  const sheet = useRef(false);
  const height = useRef(1);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // progress p: 0 = gone, 1 = at rest, > 1 = sheet pulled up (rubber-banded)
  const paint = useCallback(p => {
    const b = backdrop.current, el = panel.current;
    if (!b || !el) return;
    b.style.opacity = String(Math.max(0, Math.min(1, p)));
    if (sheet.current) {
      el.style.transform = `translate3d(0, ${((1 - p) * height.current).toFixed(2)}px, 0)`;
      el.style.opacity = '1';
    } else {
      const q = Math.max(0, Math.min(1, p));
      el.style.opacity = String(Math.min(1, q * 1.5));
      el.style.transform = `translate3d(0, ${((1 - q) * 14).toFixed(2)}px, 0) scale(${(0.96 + 0.04 * q).toFixed(4)})`;
    }
  }, []);

  const done = useRef(false);
  const finish = useCallback(() => { if (done.current) return; done.current = true; onCloseRef.current?.(); }, []);

  const requestClose = useCallback((velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    backdrop.current?.setAttribute('data-closing', '');
    if (prefersReducedMotion()) { paint(0); setTimeout(finish, 180); return; }
    spring.current?.to(0, { velocity, config: velocity ? SPRING.sheet : SPRING.ui });
  }, [finish, paint]);

  // Enter: paint the hidden state before the first frame, then spring to rest.
  useLayoutEffect(() => {
    sheet.current = window.matchMedia(SHEET_QUERY).matches;
    height.current = panel.current?.getBoundingClientRect().height || 1;
    spring.current = createSpring({
      value: 0, precision: 0.001,
      // Leaving: unmount once it is visually gone instead of waiting out the spring's long tail.
      onUpdate: p => { paint(p); if (closing.current && p < 0.02 && spring.current?.target === 0) { spring.current.stop(); finish(); } },
      onRest: p => { if (p === 0 && closing.current) finish(); },
    });
    paint(0);
    if (prefersReducedMotion()) { requestAnimationFrame(() => paint(1)); spring.current.set(1); }
    else spring.current.to(1);
    return () => spring.current?.stop();
  }, [paint, finish]);

  // Keyboard: Esc closes, Tab stays inside, focus returns to whatever opened the dialog.
  useEffect(() => {
    const opener = document.activeElement;
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) (el.querySelector('.modal-body ' + FOCUSABLE) || el.querySelector(FOCUSABLE))?.focus();
    const onKey = e => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); requestClose(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    };
  }, [requestClose]);

  // Sheet drag from the grabber/title bar: 1:1 with the finger, grab offset kept.
  const drag = useRef(null);
  const onPointerDown = e => {
    if (!sheet.current || e.button > 0 || e.target.closest('button, a, input, select, textarea')) return;
    // Measure now: the content (and so the sheet) may have grown since it opened.
    const before = (1 - spring.current.value) * height.current;
    height.current = panel.current.getBoundingClientRect().height || height.current;
    drag.current = { id: e.pointerId, y0: e.clientY, p0: 1 - before / height.current, active: false, samples: [{ t: e.timeStamp, y: e.clientY }] };
  };
  const onPointerMove = e => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (!d.active) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      d.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      closing.current = false;
      backdrop.current?.removeAttribute('data-closing');
    }
    d.samples.push({ t: e.timeStamp, y: e.clientY });
    if (d.samples.length > 8) d.samples.shift();
    const h = height.current;
    const offset = (1 - d.p0) * h + dy;                      // px below rest
    const y = offset >= 0 ? offset : rubberband(offset, h);  // resist pulling up
    spring.current.set(1 - y / h);
  };
  const onPointerUp = e => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active) return;
    const h = height.current;
    const vy = velocityFrom(d.samples, 'y');                 // px/s, + = downward
    const y = (1 - spring.current.value) * h;
    const landing = y + project(vy, 0.99);
    if (landing > h * 0.45 || vy > 900) requestClose(-vy / h);
    else spring.current.to(1, { velocity: -vy / h, config: SPRING.sheet });
  };

  const btns = buttons || [{ label: 'Đóng', fn: onClose }];
  const run = fn => (fn === onClose ? () => requestClose() : fn);
  const downOnBackdrop = useRef(false);
  return (
    <div className="modal-backdrop" ref={backdrop}
      onPointerDown={e => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => { if (e.target === e.currentTarget && downOnBackdrop.current) requestClose(); }}>
      <div className={`modal-panel${wide ? ' wide' : ''}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-title" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className="modal-grabber" aria-hidden="true" />
          <h2 id={titleId}>{title}</h2>
          <IconButton icon={X} label="Đóng" onClick={() => requestClose()} />
        </div>
        <div className="modal-body">{children}</div>
        {btns.length > 0 && (
          <div className="modal-foot">
            {btns.map((b, i) => (
              <Button key={i} variant={VARIANT[b.cls] || 'secondary'} icon={b.icon} onClick={run(b.fn)} disabled={b.disabled}>{b.label}</Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
