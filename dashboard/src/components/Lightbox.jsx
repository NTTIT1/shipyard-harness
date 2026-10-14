import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

function handleImgError(e) {
  e.target.onerror = null;
  e.target.style.opacity = '.3';
  e.target.style.filter = 'grayscale(1)';
}

export default function Lightbox({ shot, onClose, onNav }) {
  if (!shot) return null;
  const { slug, g, imgs, i, lane } = shot;
  const src = `/proof/${lane}/${encodeURIComponent(slug)}/${encodeURIComponent(g)}/${encodeURIComponent(imgs[i])}`;

  const handleKey = useCallback(e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowLeft') onNav(-1);
    else if (e.key === 'ArrowRight') onNav(1);
  }, [onClose, onNav]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div className="shotbox" onClick={onClose}>
      <button className="sh-x" onClick={e => { e.stopPropagation(); onClose(); }} title="close (Esc)"><X size={18} strokeWidth={1.75} aria-hidden="true" /></button>
      <button className="sh-nav" style={{ visibility: i > 0 ? 'visible' : 'hidden' }}
        onClick={e => { e.stopPropagation(); onNav(-1); }} title="previous (←)"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden="true" /></button>
      <figure onClick={e => e.stopPropagation()}>
        <img src={src} alt="" onError={handleImgError} />
        <figcaption>{slug} · {g} · {imgs[i]}  ({i + 1}/{imgs.length})</figcaption>
      </figure>
      <button className="sh-nav" style={{ visibility: i < imgs.length - 1 ? 'visible' : 'hidden' }}
        onClick={e => { e.stopPropagation(); onNav(1); }} title="next (→)"><ChevronRight size={26} strokeWidth={1.75} aria-hidden="true" /></button>
    </div>
  );
}
