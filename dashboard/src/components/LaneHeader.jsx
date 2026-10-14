import React, { useState } from 'react';
import { Plus, Square, Play, Check, Power, PowerOff, Eraser, RefreshCcw, KeyRound, RotateCcw, Trash2, GitBranch, ExternalLink } from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Menu from './ui/Menu.jsx';
import { primaryActions } from '../lib/laneview.js';
import { prNum } from '../lib/format.js';
import { stopSession, resumeSession } from '../lib/api.js';

const STATUS_TONE = { running: 'accent', waiting: 'warn', blocked: 'danger', failed: 'danger', passed: 'ok', provisioning: 'info' };

export default function LaneHeader({ lane, archived, onAction, onCreds, onAssign, onTab }) {
  const [err, setErr] = useState('');
  const run = fn => async () => { setErr(''); try { await fn(); } catch (e) { setErr(e.message); } };
  const acts = primaryActions(lane, { archived });
  const n = lane.lane;
  const BTN = {
    approve: <Button key="approve" variant="primary" icon={Check} onClick={() => onTab('chat')}>Duyệt spec</Button>,
    stop: <Button key="stop" icon={Square} onClick={run(() => stopSession(n))}>Dừng</Button>,
    resume: <Button key="resume" variant="primary" icon={Play} onClick={run(() => resumeSession(n))}>Tiếp tục</Button>,
    assign: <Button key="assign" variant="primary" icon={Plus} onClick={() => onAssign(n)}>Giao việc</Button>,
  };
  const menu = [
    { label: 'Bật stack (up)', icon: Power, onSelect: () => onAction(n, 'up') },
    { label: 'Tắt stack (down)', icon: PowerOff, onSelect: () => onAction(n, 'down') },
    { label: 'Xoá trạng thái (clear)', icon: Eraser, onSelect: () => onAction(n, 'clear') },
    { label: 'Cài lại agents', icon: RefreshCcw, onSelect: () => onCreds(n, 'agents') },
    { label: 'Tài khoản (creds)', icon: KeyRound, onSelect: () => onCreds(n, 'creds') },
    { label: 'Reset lane', icon: RotateCcw, danger: true, onSelect: () => onAction(n, 'reset') },
    { label: 'Xoá lane', icon: Trash2, danger: true, onSelect: () => onAction(n, 'remove') },
  ];
  const branch = lane.git_branch || lane.branch || '';
  return (
    <header className="lh">
      <div className="lh-main">
        <div className="lh-title">
          <span className="lh-lane">Lane {n}</span>
          <h1>{lane.feature_title || 'Chưa có việc'}</h1>
          {archived && <Badge tone="info">đang xem bản cũ</Badge>}
          <Badge tone={STATUS_TONE[lane.status] || 'neutral'} dot>{lane.status || 'idle'}</Badge>
        </div>
        <div className="lh-meta">
          {branch && <span className="mono"><GitBranch size={13} aria-hidden="true" /> {branch}</span>}
          {lane.pr_url && <a href={lane.pr_url} target="_blank" rel="noreferrer">PR {prNum(lane.pr_url)} <ExternalLink size={12} aria-hidden="true" /></a>}
          {lane.ticket_url && <a href={lane.ticket_url} target="_blank" rel="noreferrer">ticket <ExternalLink size={12} aria-hidden="true" /></a>}
          {lane.manual_test_url && <a href={lane.manual_test_url} target="_blank" rel="noreferrer">{lane.manual_test_url.replace('http://localhost', 'localhost')} <ExternalLink size={12} aria-hidden="true" /></a>}
        </div>
        {err && <p className="m-err">{err}</p>}
      </div>
      <div className="lh-actions">
        {acts.map(a => BTN[a])}
        {!archived && <Menu items={menu} label={`Thao tác lane ${n}`} />}
      </div>
    </header>
  );
}
