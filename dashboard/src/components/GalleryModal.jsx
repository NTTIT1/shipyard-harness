import React from 'react';
import { X } from 'lucide-react';
import Button from './ui/Button.jsx';
import { tr } from '../lib/i18n.js';

function handleImgError(e) {
  e.target.onerror = null;
  e.target.style.opacity = '.12';
  e.target.style.background = 'var(--panel-hover)';
}

export default function GalleryModal({ gallery, onClose, onShot }) {
  if (!gallery) return null;
  const { slug, g, imgs, lane } = gallery;

  return (
    <div className="galbox" onClick={onClose}>
      <div className="gal-panel" onClick={e => e.stopPropagation()}>
        <div className="gal-head">
          <b>{tr('{0} · {1} · {2} screenshots', [slug, g, imgs.length])}</b>
          <Button size="sm" icon={X} onClick={onClose} title={tr('close (Esc)')}>{tr('close')}</Button>
        </div>
        <div className="gal-grid">
          {imgs.map((img, ix) => (
            <button type="button" key={img} className="gal-item" onClick={() => onShot(slug, g, ix)} title={img}>
              <img loading="lazy" alt=""
                src={`/proof/${lane}/${encodeURIComponent(slug)}/${encodeURIComponent(g)}/${encodeURIComponent(img)}`}
                onError={handleImgError} />
              <span>{img}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
