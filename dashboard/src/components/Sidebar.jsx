import React from 'react';
import { Plus, Server, Settings2, Sun, Moon, X, Ship } from 'lucide-react';
import Button from './ui/Button.jsx';
import IconButton from './ui/IconButton.jsx';
import Badge from './ui/Badge.jsx';
import StatusDot from './ui/StatusDot.jsx';
import { sortLanes, laneAttention } from '../lib/laneview.js';
import { fmtAge } from '../lib/format.js';

const ATTN = {
  question: ['warn', 'đang hỏi'], approve: ['warn', 'chờ duyệt'], blocked: ['danger', 'bị chặn'],
  dead: ['danger', 'dead'], needs: ['accent', 'cần bạn'],
};
function dotTone(l) {
  if (l.liveness === 'dead' || l.status === 'blocked' || l.status === 'failed') return 'danger';
  if (l.status === 'running' || l.status === 'provisioning') return 'accent';
  if (l.status === 'waiting') return 'warn';
  if (l.status === 'passed' || l.stage === 'done') return 'ok';
  return 'neutral';
}

export default function Sidebar({ lanes, selected, onSelect, onAssign, onAddLane, onProviders, theme, onToggleTheme, open, onClose }) {
  const sorted = sortLanes(lanes);
  const running = lanes.filter(l => l.status === 'running').length;
  const need = lanes.filter(l => laneAttention(l)).length;
  return (
    <>
      {open && <div className="sb-scrim" onClick={onClose} />}
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Lanes">
        <div className="sb-brand">
          <Ship size={18} strokeWidth={1.75} aria-hidden="true" /> <b>Shipyard</b>
          <IconButton className="sb-close" icon={X} label="Đóng" onClick={onClose} />
        </div>
        <Button variant="primary" icon={Plus} className="sb-assign" onClick={() => onAssign(null)}>Giao việc</Button>
        <div className="sb-head">
          <span>Lanes</span>
          <span className="sb-counts">{lanes.length} · {running} chạy{need ? ` · ${need} cần bạn` : ''}</span>
        </div>
        <nav className="sb-list">
          {sorted.map(l => {
            const attn = laneAttention(l);
            const [age] = fmtAge(l.heartbeat_age_sec);
            return (
              <button key={l.lane} className={`lane-item${l.lane === selected ? ' on' : ''}`}
                onClick={() => { onSelect(l.lane); onClose(); }} aria-current={l.lane === selected ? 'true' : undefined}>
                <span className="li-row">
                  <StatusDot tone={dotTone(l)} pulse={l.status === 'running'} />
                  <span className="li-name">Lane {l.lane}</span>
                  {attn && <Badge tone={ATTN[attn][0]}>{ATTN[attn][1]}</Badge>}
                </span>
                <span className="li-title">{l.feature_title || 'rảnh'}</span>
                <span className="li-meta">{l.stage} · {age}</span>
              </button>
            );
          })}
        </nav>
        <Button variant="ghost" icon={Server} className="sb-add" onClick={onAddLane}>Thêm lane</Button>
        <div className="sb-foot">
          <Button variant="ghost" icon={Settings2} onClick={onProviders}>Nhà cung cấp</Button>
          <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'} onClick={onToggleTheme} />
        </div>
      </aside>
    </>
  );
}
