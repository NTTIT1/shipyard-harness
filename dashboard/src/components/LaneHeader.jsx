import React, { useState } from 'react';
import {
  Plus, Square, Play, Check, Power, PowerOff, Eraser, RefreshCcw,
  KeyRound, RotateCcw, Trash2, GitBranch, ExternalLink, ClipboardCheck,
  FileText, ArrowLeft, FolderKanban, GitMerge
} from 'lucide-react';
import LanePipelineModal from './LanePipelineModal.jsx';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Menu from './ui/Menu.jsx';
import { primaryActions, laneStatus } from '../lib/laneview.js';
import { prNum } from '../lib/format.js';
import { stopSession, resumeSession } from '../lib/api.js';


export default function LaneHeader({ lane, projectName, archived, onBackToBoard, onAction, onCreds, onAssign, onTab, onReview, onDocs }) {
  const [err, setErr] = useState('');
  const [pipeline, setPipeline] = useState(false);
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
    { label: 'Quy trình của lane', icon: GitMerge, onSelect: () => setPipeline(true) },
    { label: 'Bật stack (up)', icon: Power, onSelect: () => onAction(n, 'up') },
    { label: 'Tắt stack (down)', icon: PowerOff, onSelect: () => onAction(n, 'down') },
    { label: 'Xoá trạng thái (clear)', icon: Eraser, onSelect: () => onAction(n, 'clear') },
    { label: 'Cài lại agents', icon: RefreshCcw, onSelect: () => onCreds(n, 'agents') },
    { label: 'Tài khoản (creds)', icon: KeyRound, onSelect: () => onCreds(n, 'creds') },
    { label: 'Reset lane', icon: RotateCcw, danger: true, onSelect: () => onAction(n, 'reset') },
    { label: 'Xoá lane', icon: Trash2, danger: true, onSelect: () => onAction(n, 'remove') },
  ];
  const waitingReview = !archived && !!lane.run_id && lane.status === 'waiting';
  const branch = lane.git_branch || lane.branch || '';
  return (
    <header className="lh">
      {pipeline && <LanePipelineModal n={n} onClose={() => setPipeline(false)} />}
      <div className="lh-main">
        {onBackToBoard && (
          <div className="lh-Subnav">
            <button type="button" className="lh-back-btn" onClick={onBackToBoard}>
              <ArrowLeft size={13} />
              <span>Tổng quan</span>
            </button>
            {projectName && (
              <>
                <span className="faint">/</span>
                <span className="lh-project-tag">
                  <FolderKanban size={12} />
                  <span>{projectName}</span>
                </span>
              </>
            )}
            <span className="faint">/</span>
            <span className="mono faint" style={{ fontSize: 12 }}>Lane {n}</span>
          </div>
        )}
        <div className="lh-title">
          <span className="lh-lane">Lane {n}</span>
          <h1>{lane.feature_title || 'Chưa có việc'}</h1>
          {archived && <Badge tone="info">đang xem bản cũ</Badge>}
          <Badge tone={laneStatus(lane.status)[0]} dot>{laneStatus(lane.status)[1]}</Badge>
        </div>
        <div className="lh-meta">
          {branch && <span className="mono"><GitBranch size={13} aria-hidden="true" /> {branch}</span>}
          {lane.pr_url && <a href={lane.pr_url} target="_blank" rel="noreferrer">PR {prNum(lane.pr_url)} <ExternalLink size={12} aria-hidden="true" /></a>}
          {lane.ticket_url && <a href={lane.ticket_url} target="_blank" rel="noreferrer">ticket <ExternalLink size={12} aria-hidden="true" /></a>}
          {lane.manual_test_url && <a href={lane.manual_test_url} target="_blank" rel="noreferrer">{lane.manual_test_url.replace('http://localhost', 'localhost')} <ExternalLink size={12} aria-hidden="true" /></a>}
        </div>
        {waitingReview && lane.needs_action && <p className="rv-sub">Đang chờ: {lane.needs_action}</p>}
        {err && <p className="m-err">{err}</p>}
      </div>
      <div className="lh-actions">
        {waitingReview && onReview && <Button variant="primary" icon={ClipboardCheck} onClick={onReview}>Mở màn hình duyệt</Button>}
        {!archived && lane.run_id && onDocs && <Button variant="ghost" icon={FileText} onClick={onDocs}>Tài liệu</Button>}
        {acts.map(a => BTN[a])}
        {!archived && <Menu items={menu} label={`Thao tác lane ${n}`} />}
      </div>
    </header>
  );
}
