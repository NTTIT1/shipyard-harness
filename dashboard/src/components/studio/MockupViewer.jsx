import React, { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Monitor, Smartphone } from 'lucide-react';
import Markdown from '../Markdown.jsx';
import { WORKFLOW_PRESETS } from '../../lib/review.js';

export function AdviceCard({ advice }) {
  const preset = WORKFLOW_PRESETS.find(p => p.id === advice.workflow);
  return (
    <div className="wz-advice st-advice">
      <p className="wz-advice-summary">{advice.summary}</p>
      <div className="wz-review-pills">
        <span className="wz-pill">{advice.kind === 'fullstack' ? `backend/ ${advice.stack}` : advice.stack}</span>
        {advice.frontend && <span className="wz-pill">frontend/ {advice.frontend.stack}</span>}
        {advice.options?.db && advice.options.db !== 'none' && <span className="wz-pill">{advice.options.db}</span>}
        {preset && <span className="wz-pill">Quy trình: {preset.label}</span>}
        <span className="wz-pill">{advice.hasUi ? 'Có thiết kế giao diện' : 'Không cần thiết kế giao diện'}</span>
      </div>
      {[['Vì sao', advice.reasons], ['Với quy mô này', advice.scale], ['Cần làm rõ', advice.risks]].filter(([, l]) => l?.length).map(([t, l]) => (
        <div key={t} className="wz-advice-sec"><b>{t}</b><ul>{l.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      ))}
    </div>
  );
}

export function findMockupIndex(mockups, href) {
  if (!href || !Array.isArray(mockups) || mockups.length === 0) return -1;
  const rawTarget = href.trim().split('#')[0].split('?')[0];
  if (!rawTarget) return -1;

  const cleanTarget = rawTarget.replace(/^\.?\//, '').replace(/\.html$/, '').toLowerCase();

  // 1. Exact file match (e.g. '04-thanh-toan.html' or '04-thanh-toan')
  let idx = mockups.findIndex(x => {
    const fn = (x.name || '').toLowerCase();
    return fn === rawTarget.toLowerCase() || fn === `${cleanTarget}.html` || fn === cleanTarget;
  });
  if (idx !== -1) return idx;

  // 2. Slug match ignoring numeric prefixes (e.g. 'thanh-toan' matches '04-thanh-toan.html')
  const slugTarget = cleanTarget.replace(/^\d+-/, '');
  if (slugTarget) {
    idx = mockups.findIndex(x => {
      const cleanName = (x.name || '').replace(/^\.?\//, '').replace(/\.html$/, '').toLowerCase();
      const slugName = cleanName.replace(/^\d+-/, '');
      return slugName === slugTarget || (cleanName && cleanName.includes(slugTarget));
    });
  }
  return idx;
}

const SCRIPT_INJECTION = `
<script>
(function() {
  document.addEventListener('submit', function(e) {
    e.preventDefault();
  }, true);

  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript:')) {
      e.preventDefault();
      return;
    }

    // In-page anchor navigation (e.g. #huy-order, #order)
    if (href.startsWith('#')) {
      e.preventDefault();
      try {
        var el = document.querySelector(href);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.transition = 'outline 0.25s ease, box-shadow 0.25s ease';
          el.style.outline = '2px solid #0071e3';
          el.style.boxShadow = '0 0 0 4px rgba(0, 113, 227, 0.15)';
          setTimeout(function() {
            el.style.outline = '';
            el.style.boxShadow = '';
          }, 1600);
        }
      } catch (err) {}
      return;
    }

    // External links open in new tab
    if (/^https?:\\/\\//i.test(href)) {
      e.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }

    // Prototype screen navigation (e.g. 04-thanh-toan.html)
    e.preventDefault();
    window.parent.postMessage({
      type: 'SHIPYARD_NAVIGATE_MOCKUP',
      href: href
    }, '*');
  }, true);
})();
<` + `/script>
`;

function injectPrototypeNavigation(html) {
  if (!html) return '';
  if (html.includes('</body>')) {
    return html.replace('</body>', `${SCRIPT_INJECTION}</body>`);
  }
  return html + SCRIPT_INJECTION;
}

export function Mockups({ mockups }) {
  const [i, setI] = useState(0);
  const m = mockups[Math.min(i, mockups.length - 1)];
  const [screenMode, setScreenMode] = useState('desktop'); // desktop | mobile

  // Intercept navigation events sent from inside the preview iframe
  useEffect(() => {
    function handleMessage(event) {
      if (event.data?.type === 'SHIPYARD_NAVIGATE_MOCKUP' && event.data.href) {
        const targetIdx = findMockupIndex(mockups, event.data.href);
        if (targetIdx !== -1 && targetIdx !== i) {
          setI(targetIdx);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mockups, i]);

  const injectedHtml = useMemo(() => {
    return injectPrototypeNavigation(m?.html);
  }, [m?.html]);

  if (!m) return null;

  return (
    <div className="st-mockups-wrap">
      {/* Streamlined Mockup Toolbar */}
      <div className="st-mock-bar">
        <div className="st-mock-tabs" role="tablist" aria-label="Danh sách màn hình mẫu">
          {mockups.map((x, k) => {
            const rawName = x.name.replace(/^\d+-/, '').replace(/\.html$/, '');
            const active = k === i;
            return (
              <button
                key={x.name}
                type="button"
                role="tab"
                aria-selected={active}
                className={`st-mock-tab-btn${active ? ' active' : ''}`}
                onClick={() => setI(k)}>
                <span>{rawName}</span>
              </button>
            );
          })}
        </div>

        <div className="st-mock-controls">
          <div className="st-mock-viewport-toggle">
            <button
              type="button"
              className={`st-vp-btn${screenMode === 'desktop' ? ' on' : ''}`}
              onClick={() => setScreenMode('desktop')}
              title="Chế độ Desktop">
              <Monitor size={12} />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              className={`st-vp-btn${screenMode === 'mobile' ? ' on' : ''}`}
              onClick={() => setScreenMode('mobile')}
              title="Chế độ Mobile (375px)">
              <Smartphone size={12} />
              <span>Mobile</span>
            </button>
          </div>

          <button
            type="button"
            className="st-mock-popout"
            title="Mở toàn màn hình xem thử ở tab mới"
            onClick={() => {
              const win = window.open('', '_blank');
              if (win) { win.document.write(m.html); win.document.close(); }
            }}>
            <ExternalLink size={12} />
            <span>Mở tab mới</span>
          </button>
        </div>
      </div>

      {/* Frame Preview Container */}
      <div className={`st-mock-canvas mode-${screenMode}`}>
        <div className="st-browser-chrome">
          <div className="st-chrome-dots">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
          <div className="st-chrome-url">
            <span className="st-chrome-slug">localhost:3000/{m.name.replace(/^\d+-/, '').replace(/\.html$/, '')}</span>
          </div>
          <span className="st-chrome-badge">{screenMode === 'mobile' ? 'Mobile (375px)' : 'Responsive Desktop'}</span>
        </div>
        <iframe
          key={m.name}
          className="st-mock-iframe"
          title={`Giao diện mẫu ${m.name}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          srcDoc={injectedHtml}
        />
      </div>
    </div>
  );
}
