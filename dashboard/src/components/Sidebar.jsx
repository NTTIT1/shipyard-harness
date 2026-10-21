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

        <Button variant="primary" icon={Plus} className="sb-assign" onClick={() => onAssign(null)}>
          Giao việc mới
        </Button>

        <div className="sb-scroll">
          {/* Daily work: what needs me, what runs, new ideas. */}
          <nav className="sb-section-group" aria-labelledby="sb-h-work">
            <div className="sb-section-heading" id="sb-h-work">Điều hành</div>
            <div className="sb-nav">
              <NavItem icon={LayoutGrid} label="Tổng quan" active={view === 'board'} onClick={() => handleNav('board')} />
              <NavItem icon={Inbox} label="Chờ tôi duyệt" active={view === 'inbox' || view === 'review'} onClick={() => handleNav('inbox')}
                badge={inboxCount ? <span className="sb-nav-pill-badge" aria-label={`${inboxCount} bước chờ duyệt`}>{inboxCount}</span> : null} />
              <NavItem icon={ListTodo} label="Lanes" active={view === 'lanes'} onClick={() => handleNav('lanes')}
                badge={scopedLanes.length > 0 ? <span className="sb-nav-count-badge">{scopedLanes.length}</span> : null} />
              {isAdmin(user) && (
                <NavItem icon={Sparkles} label="Ý tưởng sản phẩm" active={view === 'studio'} onClick={() => handleNav('studio')} />
              )}
            </div>
          </nav>

          {/* The project picked in the header: every item below is about it. */}
          <nav className="sb-section-group" aria-labelledby="sb-h-project">
            <div className="sb-section-heading" id="sb-h-project">
              <span>Dự án</span>
              <span className="sb-heading-project" title={activeProject?.name || 'Chọn dự án ở thanh trên'}>
                {activeProject ? activeProject.name : projects.length ? 'chưa chọn' : ''}
              </span>
            </div>
            <div className="sb-nav">
              <NavItem icon={FolderKanban} label="Tổng quan & thành viên" active={view === 'projects' && (!projectSubTab || projectSubTab === 'members')} onClick={() => handleNav('projects', 'members')} />
              <NavItem icon={SlidersHorizontal} label="Quy trình & duyệt" active={view === 'projects' && projectSubTab === 'gates'} onClick={() => handleNav('projects', 'gates')} />
              <NavItem icon={Layers} label="Tính năng & model AI" active={view === 'projects' && projectSubTab === 'runs'} onClick={() => handleNav('projects', 'runs')} />
              <NavItem icon={FileText} label="Tài liệu đã duyệt" active={view === 'docs'} onClick={() => handleNav('docs')} />
              <NavItem icon={Database} label="Bộ nhớ dự án" active={view === 'projects' && projectSubTab === 'memory'} onClick={() => handleNav('projects', 'memory')} />
              <NavItem icon={Palette} label="Kỹ năng AI & khung" active={view === 'projects' && projectSubTab === 'team'} onClick={() => handleNav('projects', 'team')} />
            </div>
          </nav>

          {isAdmin(user) && (
            <nav className="sb-section-group" aria-labelledby="sb-h-admin">
              <div className="sb-section-heading" id="sb-h-admin">Quản trị</div>
              <div className="sb-nav">
                <NavItem icon={Coins} label="Chi phí & hạn mức" active={view === 'costs'} onClick={() => handleNav('costs')} />
                <NavItem icon={Users} label="Người dùng" active={view === 'users'} onClick={() => handleNav('users')} />
                <NavItem icon={Settings2} label="Nhà cung cấp AI" onClick={() => { onProviders(); onClose(); }} />
              </div>
            </nav>
          )}

        {/* If viewing Lanes view, display quick switcher list directly under Lanes menu */}
        {view === 'lanes' && scopedLanes.length > 0 && (
          <div className="sb-sub-lane-list" aria-label="Danh sách lane">
            <div className="sb-section-heading">Chọn lane</div>
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

        </div>

        <div className="sb-foot sb-user">
          <span className="sb-user-email" title={user?.email}>{user?.email || ''}</span>
          {!isAdmin(user) && <IconButton icon={Settings2} label="Nhà cung cấp AI" onClick={onProviders} />}
          <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'} onClick={onToggleTheme} />
          {user && onLogout && <IconButton icon={LogOut} label="Đăng xuất" onClick={onLogout} />}
        </div>
      </aside>
    </>
  );
}

/** One navigation row; `aria-current` marks the page the user is on. */
function NavItem({ icon: Icon, label, active = false, onClick, badge = null }) {
  return (
    <button type="button" className={`sb-nav-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Icon size={16} className="sb-nav-icon" aria-hidden="true" />
      <span className="sb-nav-label">{label}</span>
      {badge}
    </button>
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
