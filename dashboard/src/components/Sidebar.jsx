import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import {
  Plus, Server, Settings2, Sun, Moon, X, Ship, LogOut, Inbox,
  FolderKanban, LayoutGrid, Users, Coins, FileText, Gauge
} from 'lucide-react';
import Button from './ui/Button.jsx';
import IconButton from './ui/IconButton.jsx';
import Badge from './ui/Badge.jsx';
import StatusDot from './ui/StatusDot.jsx';
import { sortLanes, laneAttention } from '../lib/laneview.js';
import { fmtAge } from '../lib/format.js';
import { isAdmin } from '../lib/users.js';
import { fmtVnd, fmtUsd } from '../lib/costs.js';
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
  projectProgress, activeLanesCount, projectCosts,
  selected, onSelect, onAssign, onAddLane, onProviders, theme, onToggleTheme,
  user, onLogout, view, onView, inboxCount, open, onClose, onOpen, returnFocusRef
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

  // Filter lanes by active project when a specific project is selected
  const scopedLanes = useMemo(() => {
    if (!activeProjectId || activeProjectId === 'ALL' || projects.length === 0) return lanes;
    const matched = lanes.filter(l => l.run_project_id === activeProjectId);
    if (matched.length > 0) return matched;
    return projects.length === 1 ? lanes : [];
  }, [lanes, projects.length, activeProjectId]);

  const sorted = useMemo(() => sortLanes(scopedLanes), [scopedLanes]);
  const running = scopedLanes.filter(l => l.status === 'running').length;
  const need = scopedLanes.filter(l => laneAttention(l)).length;

  // Group lanes by project for sidebar display when viewing ALL projects
  const laneGroups = useMemo(() => {
    if (projects.length <= 1 || (activeProjectId && activeProjectId !== 'ALL')) {
      return [{ id: 'default', name: null, lanes: sorted }];
    }
    const groups = [];
    const assigned = new Set();
    for (const p of projects) {
      const pLanes = sorted.filter(l => l.run_project_id === p.id);
      if (pLanes.length > 0) {
        pLanes.forEach(l => assigned.add(l.lane));
        groups.push({ id: p.id, name: p.name, lanes: pLanes });
      }
    }
    const rest = sorted.filter(l => !assigned.has(l.lane));
    if (rest.length > 0) {
      groups.push({ id: '__unassigned__', name: groups.length > 0 ? 'Chưa gắn dự án' : null, lanes: rest });
    }
    return groups;
  }, [projects, activeProjectId, sorted]);

  // Project-scoped or global progress & cost
  const activeWithProg = scopedLanes.filter(l => l.progress != null && l.stage && l.stage !== 'no-state');
  const isGlobalScope = !activeProjectId || activeProjectId === 'ALL';
  const avgProg = (isGlobalScope && projectProgress != null)
    ? projectProgress
    : (activeWithProg.length
      ? Math.round(activeWithProg.reduce((a, l) => a + (Number(l.progress) || 0), 0) / activeWithProg.length)
      : null);
  const activeCount = (isGlobalScope && activeLanesCount != null) ? activeLanesCount : activeWithProg.length;

  const byProjectList = projectCosts?.byProject || [];
  const pjCostEntry = !isGlobalScope ? byProjectList.find(x => x.projectId === activeProjectId) : null;
  const totalVnd = pjCostEntry
    ? (pjCostEntry.vnd || 0)
    : (isGlobalScope && projectCosts?.totals?.vnd != null)
      ? projectCosts.totals.vnd
      : scopedLanes.reduce((a, l) => a + (Number(l.cost_vnd) || 0), 0);
  const totalUsd = pjCostEntry
    ? (pjCostEntry.usd || 0)
    : (isGlobalScope && projectCosts?.totals?.usd != null)
      ? projectCosts.totals.usd
      : scopedLanes.reduce((a, l) => a + (Number(l.cost_usd) || 0), 0);
  const monthQuotaPct = projectCosts?.quotas?.month?.quotaPct ?? 0;

  return (
    <>
      {narrow && <div className="sb-scrim" ref={scrimRef} onClick={onClose} aria-hidden="true" />}
      {narrow && !open && <div className="sb-edge" onPointerDown={onEdgePointerDown} aria-hidden="true" />}
      <aside ref={asideRef} className={`sidebar${open ? ' open' : ''}`} aria-label="Lanes" inert={drawerClosed ? '' : undefined}
        onPointerDown={onDrawerPointerDown} onClickCapture={onDrawerClickCapture}
        {...(drawerOpen ? { role: 'dialog', 'aria-modal': 'true' } : {})}>
        <div className="sb-brand">
          <Ship size={18} strokeWidth={1.75} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
          <b>Shipyard</b>
          <IconButton ref={closeRef} className="sb-close" icon={X} label="Đóng" onClick={onClose} />
        </div>

        {/* Project Switcher */}
        {projects.length > 0 && onSelectProject && (
          <div className="sb-project-picker">
            <label htmlFor="sb-pj-select" className="sb-picker-label">
              <FolderKanban size={12} />
              <span>Không gian dự án</span>
            </label>
            <select
              id="sb-pj-select"
              className="sb-picker-select"
              value={activeProjectId || 'ALL'}
              onChange={e => onSelectProject(e.target.value)}>
              <option value="ALL">Tất cả dự án ({projects.length})</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <Button variant="primary" icon={Plus} className="sb-assign" onClick={() => onAssign(null)}>Giao việc</Button>

        <nav className="sb-nav" aria-label="Màn hình">
          <Button variant="ghost" className={`sb-nav-btn${view === 'board' ? ' active' : ''}`} aria-current={view === 'board' ? 'page' : undefined}
            icon={LayoutGrid}
            onClick={() => { onView('board'); onClose(); }}>
            Bảng điều khiển
          </Button>
          <Button variant="ghost" className={`sb-nav-btn${view === 'inbox' || view === 'review' ? ' active' : ''}`} aria-current={view === 'inbox' || view === 'review' ? 'page' : undefined} icon={Inbox} onClick={() => { onView('inbox'); onClose(); }}>
            Chờ tôi duyệt{inboxCount ? <><span className="sb-count" aria-hidden="true">{inboxCount}</span><span className="sr-only"> ({inboxCount} bước chờ duyệt)</span></> : null}
          </Button>
          <Button variant="ghost" className={`sb-nav-btn${view === 'projects' ? ' active' : ''}`} aria-current={view === 'projects' ? 'page' : undefined} icon={FolderKanban} onClick={() => { onView('projects'); onClose(); }}>Dự án</Button>
          <Button variant="ghost" className={`sb-nav-btn${view === 'docs' ? ' active' : ''}`} aria-current={view === 'docs' ? 'page' : undefined} icon={FileText} onClick={() => { onView('docs'); onClose(); }}>Tài liệu</Button>
          {isAdmin(user) && <Button variant="ghost" className={`sb-nav-btn${view === 'costs' ? ' active' : ''}`} aria-current={view === 'costs' ? 'page' : undefined} icon={Coins} onClick={() => { onView('costs'); onClose(); }}>Chi phí</Button>}
          {user && <Button variant="ghost" className={`sb-nav-btn${view === 'users' ? ' active' : ''}`} aria-current={view === 'users' ? 'page' : undefined} icon={Users} onClick={() => { onView('users'); onClose(); }}>{isAdmin(user) ? 'Người dùng' : 'Tài khoản'}</Button>}
        </nav>

        {/* Contextual Lane Switcher — only shown when viewing a specific Lane detail (view === 'lanes'), keeping the Sidebar clean and non-redundant on Board/Projects/Docs/Costs */}
        {view === 'lanes' && (
          <>
            <div className="sb-project-summary" aria-label="Tổng quan tiến độ & chi phí dự án">
              <div className="sb-ps-block">
                <div className="sb-ps-row">
                  <span className="sb-ps-label"><Gauge size={13} /> Tiến độ dự án</span>
                  <span className="sb-ps-val mono">{avgProg != null ? `${avgProg}%` : '—'}</span>
                </div>
                <div className="sb-ps-bar" title={avgProg != null ? `Trung bình cộng ${activeCount} lane đang có việc: ${avgProg}%` : 'Chưa có lane nào có việc'}>
                  <i style={{ width: `${Math.max(0, Math.min(100, Number(avgProg) || 0))}%` }} />
                </div>
                <div className="sb-ps-sub">
                  {activeCount > 0 ? `TB cộng ${activeCount}/${scopedLanes.length} lane có việc` : 'Chưa có lane nào nhận việc'}
                </div>
              </div>

              <div className="sb-ps-divider" />

              <div className="sb-ps-block">
                <div className="sb-ps-row">
                  <span className="sb-ps-label"><Coins size={13} /> Chi phí cả dự án</span>
                  <span className="sb-ps-val mono">{fmtVnd(totalVnd)}</span>
                </div>
                <div className="sb-ps-sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                  <span>{fmtUsd(totalUsd)} API</span>
                  {monthQuotaPct > 0 && <span>{monthQuotaPct}% hạn mức tháng</span>}
                </div>
              </div>
            </div>

            <div className="sb-head">
              <span>Chuyển nhanh Lane</span>
              <span className="sb-counts">{scopedLanes.length} · {running} chạy{need ? ` · ${need} cần bạn` : ''}</span>
            </div>

            <nav className="sb-list">
              {laneGroups.map(grp => (
                <div key={grp.id} className="sb-lane-group">
                  {grp.name && (
                    <div className="sb-group-title">
                      <FolderKanban size={11} />
                      <span>{grp.name}</span>
                    </div>
                  )}
                  {grp.lanes.map(l => {
                    const attn = laneAttention(l);
                    const [age] = fmtAge(l.heartbeat_age_sec);
                    const isSelected = view === 'lanes' && l.lane === selected;
                    return (
                      <button key={l.lane} className={`lane-item${isSelected ? ' on' : ''}`}
                        onClick={() => { onSelect(l.lane); onView('lanes'); onClose(); }} aria-current={isSelected ? 'true' : undefined}>
                        <span className="li-row">
                          <StatusDot tone={dotTone(l)} pulse={l.status === 'running'} />
                          <span className="li-name">Lane {l.lane}</span>
                          {l.progress != null && <span className="li-prog mono">{l.progress}%</span>}
                          {attn && <Badge tone={ATTN[attn][0]}>{ATTN[attn][1]}</Badge>}
                        </span>
                        <span className="li-title">{l.feature_title || 'rảnh'}</span>
                        {l.progress != null && (
                          <span className="li-bar-wrap" aria-hidden="true">
                            <span className="li-bar"><i style={{ width: `${Math.max(0, Math.min(100, Number(l.progress) || 0))}%` }} /></span>
                          </span>
                        )}
                        <span className="li-meta">
                          <span>{l.stage} · {age}</span>
                          {(l.cost_vnd > 0 || l.cost_usd > 0) && (
                            <span className="li-cost" title={`Chi phí Lane ${l.lane}: ${fmtVnd(l.cost_vnd)} (${fmtUsd(l.cost_usd)})`}>
                              {fmtVnd(l.cost_vnd)}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <Button variant="ghost" icon={Server} className="sb-add" onClick={onAddLane}>Thêm lane</Button>
          </>
        )}
        <div className="sb-foot">
          <Button variant="ghost" icon={Settings2} onClick={onProviders}>Nhà cung cấp</Button>
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

const SLOP = 10;   // px of travel before a press becomes a horizontal drag

/**
 * Phone drawer motion (Apple fluid interfaces): one spring on progress p (0 closed → 1 open)
 * drives the drawer and its scrim, so a tap on the menu button during a close simply reverses
 * from where it is. Edge-swipe opens, dragging the drawer left closes; both track the finger 1:1,
 * hand their release velocity to the spring and decide open/closed from the projected landing.
 */
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
      // Never lock input during a transition: once closing starts, taps reach the page (e.g. the menu button) again.
      scrim.toggleAttribute('data-on', p > 0.001 && (spring.current?.target ?? p) > 0);
    }
  }, [asideRef, scrimRef]);

  useLayoutEffect(() => {
    spring.current = createSpring({ value: open ? 1 : 0, precision: 0.001, onUpdate: paint });
    paint(open ? 1 : 0);
    return () => spring.current?.stop();
  }, [paint, narrow]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!narrow || drag.current?.active) return;
    spring.current?.to(open ? 1 : 0, { immediate: prefersReducedMotion() });
  }, [open, narrow]);

  const release = useCallback(d => {
    const w = width();
    const vx = velocityFrom(d.samples, 'x');
    const p = spring.current.value;
    const landing = (p - 1) * w + project(vx, 0.99);       // px from the open position
    const wantOpen = vx > 500 ? true : vx < -500 ? false : landing > -w / 2;
    const v = vx / w;
    if (wantOpen) { if (!d.wasOpen) onOpen?.(); spring.current.to(1, { velocity: v, config: SPRING.sheet }); }
    else { if (d.wasOpen) onClose?.(); spring.current.to(0, { velocity: v, config: SPRING.sheet }); }
  }, [onOpen, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shared tracking: horizontal intent after SLOP, then p follows the finger (grab offset kept).
  useEffect(() => {
    if (!narrow) return undefined;
    const move = e => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (!d.active) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        if (Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; } // a scroll, not ours
        d.active = true;
        spring.current.stop();
      }
      e.preventDefault();
      d.samples.push({ t: e.timeStamp, x: e.clientX });
      if (d.samples.length > 8) d.samples.shift();
      const w = width();
      const x = (d.p0 - 1) * w + dx;                       // px from the open position
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

  // Edge strip (touch-action: pan-y) so the browser leaves horizontal swipes to us.
  const onEdgePointerDown = e => {
    if (open || drag.current || e.button > 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: spring.current.value, wasOpen: false, active: false, samples: [{ t: e.timeStamp, x: e.clientX }] };
  };
  const onDrawerPointerDown = e => {
    if (!narrow || !open || e.button > 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: spring.current.value, wasOpen: true, active: false, samples: [{ t: e.timeStamp, x: e.clientX }] };
  };
  // A drag that started on a lane or nav button must not also click it.
  const onDrawerClickCapture = e => { if (justDragged.current) { e.preventDefault(); e.stopPropagation(); } };
  return { onDrawerPointerDown, onDrawerClickCapture, onEdgePointerDown };
}
