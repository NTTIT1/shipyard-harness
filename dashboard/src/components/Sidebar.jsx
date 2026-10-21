import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import {
  Plus, Server, Settings2, Sun, Moon, X, Ship, LogOut, Inbox,
  FolderKanban, LayoutGrid, Users, Coins, FileText, Gauge,
  ListTodo, Layers, SlidersHorizontal, Sparkles, Database, Palette
} from 'lucide-react';
import Button from './ui/Button.jsx';
import IconButton from './ui/IconButton.jsx';
import Badge from './ui/Badge.jsx';
import StatusDot from './ui/StatusDot.jsx';
import { sortLanes, laneAttention } from '../lib/laneview.js';
import { fmtAge } from '../lib/format.js';
import { isAdmin } from '../lib/users.js';
import { createSpring, SPRING, project, rubberband, velocityFrom, prefersReducedMotion } from '../lib/spring.js';

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

export default function Sidebar({
  lanes, projects = [], activeProjectId = 'ALL', onSelectProject,
  selected, onSelect, onAssign, onAddLane, onProviders, theme, onToggleTheme,
  user, onLogout, view, onView, projectSubTab, onProjectSubTab,
  inboxCount, open, onClose, onOpen, returnFocusRef
}) {
  const asideRef = useRef(null);
  const closeRef = useRef(null);
  const wasOpen = useRef(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const h = e => setNarrow(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  useEffect(() => {
    if (open) { closeRef.current?.focus(); wasOpen.current = true; }
    else if (wasOpen.current) { wasOpen.current = false; returnFocusRef?.current?.focus(); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  const drawerClosed = narrow && !open;
  const drawerOpen = narrow && open;
  const scrimRef = useRef(null);
  const { onDrawerPointerDown, onDrawerClickCapture, onEdgePointerDown } = useDrawerMotion({ asideRef, scrimRef, narrow, open, onOpen, onClose });

  const activeProject = projects.find(p => p.id === activeProjectId)
    || (projects.length === 1 ? projects[0] : null);

  // Filter lanes by active project when a specific project is selected
  const scopedLanes = useMemo(() => {
    if (!activeProjectId || activeProjectId === 'ALL' || projects.length === 0) return lanes;
    const matched = lanes.filter(l => l.run_project_id === activeProjectId);
    if (matched.length > 0) return matched;
    return projects.length === 1 ? lanes : [];
  }, [lanes, projects.length, activeProjectId]);

  const sortedLanes = useMemo(() => sortLanes(scopedLanes), [scopedLanes]);

  const handleNav = (targetView, subTab = null) => {
    onView(targetView);
    if (subTab && onProjectSubTab) onProjectSubTab(subTab);
    onClose();
  };

  return (
    <>
      {narrow && <div className="sb-scrim" ref={scrimRef} onClick={onClose} aria-hidden="true" />}
      {narrow && !open && <div className="sb-edge" onPointerDown={onEdgePointerDown} aria-hidden="true" />}
      <aside ref={asideRef} className={`sidebar${open ? ' open' : ''}`} aria-label="Điều hướng chính" inert={drawerClosed ? '' : undefined}
        onPointerDown={onDrawerPointerDown} onClickCapture={onDrawerClickCapture}
        {...(drawerOpen ? { role: 'dialog', 'aria-modal': 'true' } : {})}>
        
        {/* Brand Header */}
        <div className="sb-brand">
          <div className="sb-brand-logo">
            <Ship size={18} strokeWidth={2} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
          </div>
          <div className="sb-brand-info">
            <strong className="sb-brand-name">AI Factory</strong>
            <span className="sb-brand-sub">SHIPYARD SYSTEM</span>
          </div>
          <IconButton ref={closeRef} className="sb-close" icon={X} label="Đóng" onClick={onClose} />
        </div>

        {/* Action Button: Giao việc */}
        <Button variant="primary" icon={Plus} className="sb-assign" onClick={() => onAssign(null)}>
          Giao việc mới
        </Button>

        {/* Group 1: CÁ NHÂN & ĐIỀU HÀNH */}
        <div className="sb-section-group">
          <div className="sb-section-heading">CÁ NHÂN & ĐIỀU HÀNH</div>
          <nav className="sb-nav" aria-label="Cá nhân và điều hành">
            <button
              type="button"
              className={`sb-nav-item${view === 'board' ? ' active' : ''}`}
              onClick={() => handleNav('board')}>
              <LayoutGrid size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Tổng quan điều hành</span>
            </button>

            {isAdmin(user) && (
              <button
                type="button"
                className={`sb-nav-item${view === 'studio' ? ' active' : ''}`}
                onClick={() => handleNav('studio')}>
                <Sparkles size={16} className="sb-nav-icon" />
                <span className="sb-nav-label">Ý tưởng sản phẩm (chat)</span>
              </button>
            )}

            <button
              type="button"
              className={`sb-nav-item${view === 'inbox' || view === 'review' ? ' active' : ''}`}
              onClick={() => handleNav('inbox')}>
              <Inbox size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Việc của tôi</span>
              {inboxCount ? <span className="sb-nav-pill-badge">{inboxCount}</span> : null}
            </button>

            <button
              type="button"
              className={`sb-nav-item${view === 'projects' && (!projectSubTab || projectSubTab === 'members') ? ' active' : ''}`}
              onClick={() => handleNav('projects', 'members')}>
              <FolderKanban size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Danh sách dự án</span>
              <span className="sb-nav-count-badge">{projects.length}</span>
            </button>

            {isAdmin(user) && (
              <button
                type="button"
                className={`sb-nav-item${view === 'costs' ? ' active' : ''}`}
                onClick={() => handleNav('costs')}>
                <Coins size={16} className="sb-nav-icon" />
                <span className="sb-nav-label">Báo cáo tổng hợp</span>
              </button>
            )}
          </nav>
        </div>

        {/* Group 2: DỰ ÁN ĐANG LÀM VIỆC */}
        <div className="sb-section-group">
          <div className="sb-section-heading">
            <span>DỰ ÁN ĐANG LÀM VIỆC</span>
            {activeProject && <span className="sb-heading-tag">{activeProject.slug}</span>}
          </div>

          <nav className="sb-nav" aria-label="Menu chức năng dự án">
            <button
              type="button"
              className={`sb-nav-item${view === 'projects' && projectSubTab === 'members' ? ' active' : ''}`}
              onClick={() => handleNav('projects', 'members')}>
              <FolderKanban size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Tổng quan & Thành viên</span>
            </button>

            <button
              type="button"
              className={`sb-nav-item${view === 'projects' && projectSubTab === 'runs' ? ' active' : ''}`}
              onClick={() => handleNav('projects', 'runs')}>
              <Sparkles size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Hành trình & Model AI</span>
            </button>

            <button
              type="button"
              className={`sb-nav-item${view === 'projects' && projectSubTab === 'gates' ? ' active' : ''}`}
              onClick={() => handleNav('projects', 'gates')}>
              <SlidersHorizontal size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Quy trình &amp; duyệt</span>
            </button>

            <button
              type="button"
              className={`sb-nav-item${view === 'lanes' ? ' active' : ''}`}
              onClick={() => handleNav('lanes')}>
              <ListTodo size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Công việc (Lanes)</span>
              {scopedLanes.length > 0 && (
                <span className="sb-nav-count-badge">{scopedLanes.length}</span>
              )}
            </button>

            <button
              type="button"
              className={`sb-nav-item${view === 'projects' && projectSubTab === 'memory' ? ' active' : ''}`}
              onClick={() => handleNav('projects', 'memory')}>
              <Database size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Yêu cầu & Bộ nhớ</span>
            </button>

            <button
              type="button"
              className={`sb-nav-item${view === 'docs' ? ' active' : ''}`}
              onClick={() => handleNav('docs')}>
              <FileText size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Tài liệu đã duyệt</span>
            </button>

            <button
              type="button"
              className={`sb-nav-item${view === 'projects' && projectSubTab === 'team' ? ' active' : ''}`}
              onClick={() => handleNav('projects', 'team')}>
              <Palette size={16} className="sb-nav-icon" />
              <span className="sb-nav-label">Kỹ năng AI & Khung</span>
            </button>
          </nav>
        </div>

        {/* If viewing Lanes view, display quick switcher list directly under Lanes menu */}
        {view === 'lanes' && scopedLanes.length > 0 && (
          <div className="sb-sub-lane-list" aria-label="Danh sách lane của dự án">
            <div className="sb-sub-lane-title">Lane thực thi:</div>
            {sortedLanes.map(l => {
              const attn = laneAttention(l);
              const isSelected = l.lane === selected;
              return (
                <button
                  key={l.lane}
                  type="button"
                  className={`sb-sub-lane-item${isSelected ? ' on' : ''}`}
                  onClick={() => { onSelect(l.lane); handleNav('lanes'); }}>
                  <StatusDot tone={dotTone(l)} pulse={l.status === 'running'} />
                  <span className="sb-sub-lane-name">Lane {l.lane}</span>
                  {l.progress != null && <span className="sb-sub-lane-prog mono">{l.progress}%</span>}
                  {attn && <Badge tone={ATTN[attn][0]}>{ATTN[attn][1]}</Badge>}
                </button>
              );
            })}
            <Button variant="ghost" size="sm" icon={Plus} onClick={onAddLane} style={{ marginTop: 4 }}>
              Thêm lane
            </Button>
          </div>
        )}

        {/* Sidebar Footer */}
        <div className="sb-foot">
          <Button variant="ghost" size="sm" icon={Settings2} onClick={onProviders}>Nhà cung cấp</Button>
          <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'} onClick={onToggleTheme} />
        </div>

        {user && (
          <div className="sb-user">
            <span className="sb-user-email" title={user.email}>{user.email}</span>
            {onLogout && <IconButton icon={LogOut} label="Đăng xuất" onClick={onLogout} />}
          </div>
        )}
      </aside>
    </>
  );
}

const SLOP = 10;

function useDrawerMotion({ asideRef, scrimRef, narrow, open, onOpen, onClose }) {
  const spring = useRef(null);
  const drag = useRef(null);
  const justDragged = useRef(false);
  const width = () => asideRef.current?.getBoundingClientRect().width || 300;

  const paint = useCallback(p => {
    const el = asideRef.current, scrim = scrimRef.current;
    if (!el) return;
    if (!window.matchMedia('(max-width: 900px)').matches) { el.style.transform = ''; el.style.visibility = ''; return; }
    const x = p <= 1 ? (p - 1) * 100 : 0;
    el.style.transform = p <= 1 ? `translate3d(${x.toFixed(3)}%, 0, 0)` : `translate3d(${((p - 1) * width()).toFixed(2)}px, 0, 0)`;
    el.style.visibility = p > 0.001 ? 'visible' : 'hidden';
    if (scrim) {
      scrim.style.opacity = String(Math.max(0, Math.min(1, p)));
      scrim.toggleAttribute('data-on', p > 0.001 && (spring.current?.target ?? p) > 0);
    }
  }, [asideRef, scrimRef]);

  useLayoutEffect(() => {
    spring.current = createSpring({ value: open ? 1 : 0, precision: 0.001, onUpdate: paint });
    paint(open ? 1 : 0);
    return () => spring.current?.stop();
  }, [paint, narrow]);

  useEffect(() => {
    if (!narrow || drag.current?.active) return;
    spring.current?.to(open ? 1 : 0, { immediate: prefersReducedMotion() });
  }, [open, narrow]);

  const release = useCallback(d => {
    const w = width();
    const vx = velocityFrom(d.samples, 'x');
    const p = spring.current.value;
    const landing = (p - 1) * w + project(vx, 0.99);
    const wantOpen = vx > 500 ? true : vx < -500 ? false : landing > -w / 2;
    const v = vx / w;
    if (wantOpen) { if (!d.wasOpen) onOpen?.(); spring.current.to(1, { velocity: v, config: SPRING.sheet }); }
    else { if (d.wasOpen) onClose?.(); spring.current.to(0, { velocity: v, config: SPRING.sheet }); }
  }, [onOpen, onClose]);

  useEffect(() => {
    if (!narrow) return undefined;
    const move = e => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (!d.active) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        if (Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
        d.active = true;
        spring.current.stop();
      }
      e.preventDefault();
      d.samples.push({ t: e.timeStamp, x: e.clientX });
      if (d.samples.length > 8) d.samples.shift();
      const w = width();
      const x = (d.p0 - 1) * w + dx;
      spring.current.set(x > 0 ? 1 + rubberband(x, w) / w : Math.max(0, 1 + x / w));
    };
    const up = e => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (d.active) { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 0); release(d); }
    };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
  }, [narrow, release]);

  const onEdgePointerDown = e => {
    if (open || drag.current || e.button > 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: spring.current.value, wasOpen: false, active: false, samples: [{ t: e.timeStamp, x: e.clientX }] };
  };
  const onDrawerPointerDown = e => {
    if (!narrow || !open || e.button > 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: spring.current.value, wasOpen: true, active: false, samples: [{ t: e.timeStamp, x: e.clientX }] };
  };
  const onDrawerClickCapture = e => { if (justDragged.current) { e.preventDefault(); e.stopPropagation(); } };
  return { onDrawerPointerDown, onDrawerClickCapture, onEdgePointerDown };
}
