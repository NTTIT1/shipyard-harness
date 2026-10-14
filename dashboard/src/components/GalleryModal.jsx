import React from 'react';
import { X } from 'lucide-react';
import Button from './ui/Button.jsx';

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
          <b>{slug} · {g} · {imgs.length} screenshots</b>
          <Button size="sm" icon={X} onClick={onClose} title="close (Esc)">close</Button>
        </div>
        <div className="gal-grid">
          {imgs.map((img, ix) => (
            <a key={img} onClick={() => onShot(slug, g, ix)} title={img}>
              <img loading="lazy"
                src={`/proof/${lane}/${encodeURIComponent(slug)}/${encodeURIComponent(g)}/${encodeURIComponent(img)}`}
                onError={handleImgError} />
              <span>{img}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
