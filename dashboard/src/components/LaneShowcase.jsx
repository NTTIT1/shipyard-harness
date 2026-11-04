import React, { useEffect, useRef } from 'react';
import { Check, GitPullRequest } from 'lucide-react';
import { tr } from '../lib/i18n.js';

/*
 * The product in one look: three features, each on its own lane, moving through the workflow at the
 * same time. A lane pauses at its human gate ("Đã duyệt ✓") and ends as a pull request. Driven by one
 * requestAnimationFrame clock writing CSS variables (no React re-render per frame); stills under
 * reduced motion, each lane parked at a different stage. Example content, not live data.
 */
const STAGES = [tr('Yêu cầu'), 'Plan', tr('Thiết kế'), 'Code', tr('Kiểm thử'), 'PR'];
const GATE = 1;                          // the lane waits for a person after Plan
const LANES = [
  { name: tr('Đăng nhập bằng Google'), offset: 0.08, pr: 128 },
  { name: tr('Xuất bảng lương'), offset: 0.42, pr: 131 },
  { name: tr('Báo cáo doanh thu'), offset: 0.74, pr: 134 },
];
const CYCLE = 11000;                     // ms per lane run
const STILL = [0.62, 0.31, 0.93];        // reduced motion: where each lane is parked

/** Lane progress t ∈ [0,1) → position on the track (node index, fractional) with a pause at each node. */
function place(t) {
  const n = STAGES.length - 1;           // segments
  const seg = Math.min(n - 1e-6, t * n);
  const i = Math.floor(seg), f = seg - i;
  const move = 0.55;                     // share of a segment spent moving; the rest waits at the node
  return i + (f < move ? easeInOut(f / move) : 1);
}
const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

export default function LaneShowcase() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const rows = [...el.querySelectorAll('.ls-lane')];
    const paint = ts => rows.forEach((row, k) => {
      const t = ts == null ? STILL[k] : ((ts / CYCLE) + LANES[k].offset) % 1;
      const pos = place(t);
      const n = STAGES.length - 1;
      row.style.setProperty('--pos', String(pos / n));
      row.querySelectorAll('.ls-node').forEach((node, i) => node.classList.toggle('lit', pos >= i - 0.02));
      row.classList.toggle('approved', pos >= GATE - 0.001);   // a person approved Plan: the badge stays
      row.classList.toggle('done', pos >= n - 0.001);
      // fade the last stretch out, then the lane starts again from the left
      row.style.setProperty('--fade', ts == null ? '1' : String(t > 0.96 ? Math.max(0, (1 - t) / 0.04) : t < 0.03 ? t / 0.03 : 1));
    });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { paint(null); return undefined; }
    let raf = 0;
    const loop = ts => { paint(ts); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <figure className="ls" ref={root} aria-label={tr('Minh hoạ: ba tính năng chạy song song trên ba lane, qua các bước tới pull request')}>
      <div className="ls-head" aria-hidden="true">
        <span />
        <div className="ls-stages">{STAGES.map(s => <span key={s}>{s}</span>)}</div>
      </div>
      {LANES.map((l, k) => (
        <div key={l.name} className="ls-lane" aria-hidden="true">
          <span className="ls-name"><b>Lane {k + 1}</b>{l.name}</span>
          <div className="ls-track">
            <span className="ls-rail" /><span className="ls-fill" />
            {STAGES.map((s, i) => <span key={s} className={`ls-node${i === GATE ? ' is-gate' : ''}`} style={{ '--i': i }} />)}
            <span className="ls-runner" />
            <span className="ls-badge ls-approve"><Check size={11} strokeWidth={2.5} />{tr('Đã duyệt')}</span>
            <span className="ls-badge ls-pr"><GitPullRequest size={11} strokeWidth={2.25} />PR #{l.pr}</span>
          </div>
        </div>
      ))}
      <figcaption className="ls-cap">{tr('Mỗi lane là một tính năng. Người duyệt ở các cổng bạn chọn; AI chỉ mở pull request.')}</figcaption>
    </figure>
  );
}
