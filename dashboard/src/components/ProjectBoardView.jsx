import React, { useMemo } from 'react';
import {
  FolderKanban, Plus, Wand2, Gauge, Coins, Play, CheckCircle2,
  Clock, AlertTriangle, ArrowRight, Server, SlidersHorizontal, GitBranch
} from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import StatusDot from './ui/StatusDot.jsx';
import { fmtVnd, fmtUsd, fmtTokens, sumTokens } from '../lib/costs.js';
import { fmtAge } from '../lib/format.js';
import { LANE_STATUS, stageLabel as stageLabel_ } from '../lib/laneview.js';
import { laneAttention } from '../lib/laneview.js';
import { simpleStepIndex } from '../lib/constants.js';
import { useWorkflowLanes } from '../hooks/useRunViews.js';



const SIMPLE_STEPS = [
  { id: 'plan', label: '1. Kế hoạch' },
  { id: 'code', label: '2. Lập trình' },
  { id: 'check', label: '3. Kiểm tra' },
  { id: 'qc', label: '4. Review & QC' },
  { id: 'pr', label: '5. Pull Request' },
  { id: 'done', label: '6. Hoàn tất' },
];

export const getSimpleStepIndex = simpleStepIndex;

function dotTone(l) {
  if (l.liveness === 'dead' || l.status === 'blocked' || l.status === 'failed') return 'danger';
  if (l.status === 'running' || l.status === 'provisioning') return 'accent';
  if (l.status === 'waiting') return 'warn';
  if (l.status === 'passed' || l.stage === 'done') return 'ok';
  return 'neutral';
}

export default function ProjectBoardView({
  projects = [],
  lanes: rawLanes = [],
  projectCosts = {},
  activeProjectId,
  onSelectProject,
  onSelectLane,
  onOpenProjectSettings,
  onAssign,
  onAddLane,
  onOpenWizard,
  canScaffold,
}) {
  const byProjectCosts = projectCosts?.byProject || [];

  // A role-pipeline lane is measured by its own workflow steps (same as the lane's overview tab).
  const lanes = useWorkflowLanes(rawLanes);

  // Group lanes by project; if only 1 project exists and lanes have no run_project_id, attach them to that project
  const projectGroups = useMemo(() => {
    const groups = projects.map(p => {
      const matched = lanes.filter(l => l.run_project_id === p.id);
      const pLanes = matched.length > 0 ? matched : (projects.length === 1 ? lanes : []);
      const activeLanes = pLanes.filter(l => l.progress != null && l.stage && l.stage !== 'no-state');
      const avgProg = activeLanes.length > 0
        ? Math.round(activeLanes.reduce((sum, l) => sum + (Number(l.progress) || 0), 0) / activeLanes.length)
        : null;
      const pjCost = byProjectCosts.find(x => x.projectId === p.id);
      const fallbackVnd = pLanes.reduce((sum, l) => sum + (Number(l.cost_vnd) || 0), 0);
      const fallbackUsd = pLanes.reduce((sum, l) => sum + (Number(l.cost_usd) || 0), 0);
      const useTotal = matched.length === 0 && projects.length === 1 && projectCosts?.totals;
      return {
        project: p,
        lanes: pLanes,
        activeCount: activeLanes.length,
        avgProg,
        costVnd: pjCost ? (pjCost.vnd || 0) : (useTotal ? (projectCosts.totals.vnd || 0) : fallbackVnd),
        costUsd: pjCost ? (pjCost.usd || 0) : (useTotal ? (projectCosts.totals.usd || 0) : fallbackUsd),
        tokens: pjCost ? sumTokens(pjCost.tokens) : (useTotal ? sumTokens(projectCosts.totals.tokens) : 0),
      };
    });

    // Unassigned lanes when there are multiple projects or 0 projects
    const assignedLaneNums = new Set(groups.flatMap(g => g.lanes.map(l => l.lane)));
    const unassigned = lanes.filter(l => !assignedLaneNums.has(l.lane));
    if (unassigned.length > 0) {
      const activeLanes = unassigned.filter(l => l.progress != null && l.stage && l.stage !== 'no-state');
      const avgProg = activeLanes.length > 0
        ? Math.round(activeLanes.reduce((sum, l) => sum + (Number(l.progress) || 0), 0) / activeLanes.length)
        : null;
      const costVnd = unassigned.reduce((sum, l) => sum + (Number(l.cost_vnd) || 0), 0) || (projects.length === 0 ? (projectCosts?.totals?.vnd || 0) : 0);
      const costUsd = unassigned.reduce((sum, l) => sum + (Number(l.cost_usd) || 0), 0) || (projects.length === 0 ? (projectCosts?.totals?.usd || 0) : 0);
      groups.push({
        project: {
          id: '__unassigned__',
          name: projects.length === 0 ? 'Không gian làm việc mặc định' : 'Các Lane dùng chung / Chưa gắn dự án',
          slug: 'workspace-lanes',
          isDefault: true,
        },
        lanes: unassigned,
        activeCount: activeLanes.length,
        avgProg,
        costVnd,
        costUsd,
        tokens: 0,
      });
    }
    return groups;
  }, [projects, lanes, byProjectCosts, projectCosts]);

  const visibleGroups = useMemo(() => {
    if (!activeProjectId || activeProjectId === 'ALL') return projectGroups;
    return projectGroups.filter(g => g.project.id === activeProjectId);
  }, [projectGroups, activeProjectId]);

  // Overall metrics for currently visible scope
  const scopeMetrics = useMemo(() => {
    const scopeLanes = visibleGroups.flatMap(g => g.lanes);
    const uniqLanes = Array.from(new Map(scopeLanes.map(l => [l.lane, l])).values());
    const active = uniqLanes.filter(l => l.progress != null && l.stage && l.stage !== 'no-state');
    const avgProg = active.length > 0
      ? Math.round(active.reduce((s, l) => s + (Number(l.progress) || 0), 0) / active.length)
      : null;
    const runningCount = uniqLanes.filter(l => l.status === 'running').length;
    const waitingCount = uniqLanes.filter(l => laneAttention(l)).length;
    const totalVnd = (!activeProjectId || activeProjectId === 'ALL')
      ? (projectCosts?.totals?.vnd ?? uniqLanes.reduce((s, l) => s + (Number(l.cost_vnd) || 0), 0))
      : visibleGroups.reduce((s, g) => s + g.costVnd, 0);
    const totalUsd = (!activeProjectId || activeProjectId === 'ALL')
      ? (projectCosts?.totals?.usd ?? uniqLanes.reduce((s, l) => s + (Number(l.cost_usd) || 0), 0))
      : visibleGroups.reduce((s, g) => s + g.costUsd, 0);
    return {
      laneCount: uniqLanes.length,
      activeCount: active.length,
      runningCount,
      waitingCount,
      avgProg,
      totalVnd,
      totalUsd,
    };
  }, [visibleGroups, activeProjectId, projectCosts]);

  return (
    <section className="pb-page" aria-labelledby="pb-title">
      {/* Top Header */}
      <header className="pb-header">
        <div className="pb-header-titles">
          <h1 id="pb-title" className="pb-h1">Tổng quan</h1>
          <p className="pb-subtitle">Tiến độ, chi phí và trạng thái các lane, gom theo dự án.</p>
        </div>
        <div className="pb-header-actions">
          {canScaffold && (
            <Button variant="secondary" icon={Wand2} onClick={onOpenWizard}>
              Khởi tạo dự án từ khung
            </Button>
          )}
          <Button variant="secondary" icon={Server} onClick={onAddLane}>
            Thêm lane
          </Button>
          {/* The sidebar carries this action on wide screens; phones only see it here. */}
          <Button variant="primary" icon={Plus} className="pb-cta-narrow" onClick={() => onAssign(null)}>
            Giao việc mới
          </Button>
        </div>
      </header>

      {/* Scope Telemetry Strip */}
      <div className="pb-telemetry-strip" aria-label="Chỉ số tổng hợp">
        <div className="pb-telemetry-cell">
          <span className="pb-telemetry-label">
            <FolderKanban size={14} aria-hidden="true" />
            <span>Đang xem</span>
          </span>
          <div className="pb-telemetry-main">
            <span className="pb-telemetry-val">
              {(!activeProjectId || activeProjectId === 'ALL') ? `${projects.length || 1} dự án` : visibleGroups[0]?.project?.name || '1 dự án'}
            </span>
            <span className="pb-telemetry-badge">{scopeMetrics.laneCount} lane</span>
          </div>
          <span className="pb-telemetry-sub">
            {scopeMetrics.runningCount} đang chạy · {scopeMetrics.waitingCount} cần duyệt
          </span>
        </div>

        <div className="pb-telemetry-cell">
          <span className="pb-telemetry-label">
            <Gauge size={14} aria-hidden="true" />
            <span>Tiến độ trung bình</span>
          </span>
          <div className="pb-telemetry-main">
            <span className="pb-telemetry-val">{scopeMetrics.avgProg != null ? `${scopeMetrics.avgProg}%` : '—'}</span>
            <div className="pb-telemetry-bar">
              <i style={{ width: `${Math.max(0, Math.min(100, Number(scopeMetrics.avgProg) || 0))}%` }} />
            </div>
          </div>
          <span className="pb-telemetry-sub">
            {scopeMetrics.activeCount > 0
              ? `Trung bình cộng từ ${scopeMetrics.activeCount}/${scopeMetrics.laneCount} lane có việc`
              : 'Chưa có lane nào đang thực thi'}
          </span>
        </div>

        <div className="pb-telemetry-cell">
          <span className="pb-telemetry-label is-cost">
            <Coins size={14} aria-hidden="true" />
            <span>Chi phí tháng này</span>
          </span>
          <div className="pb-telemetry-main">
            <span className="pb-telemetry-val">{fmtVnd(scopeMetrics.totalVnd)}</span>
            <span className="pb-telemetry-badge">{fmtUsd(scopeMetrics.totalUsd)} API</span>
          </div>
          <span className="pb-telemetry-sub">
            Tổng các lane đang xem
          </span>
        </div>
      </div>

      {/* Project Sections & Multi-Lane Cards */}
      <div className="pb-project-list">
        {visibleGroups.map(group => {
          const { project: pj, lanes: pjLanes, avgProg, costVnd, costUsd, activeCount } = group;
          return (
            <div key={pj.id} className="pb-project-section">
              <div className="pb-project-head">
                <div className="pb-project-identity">
                  <div className="pb-project-icon">
                    <FolderKanban size={18} />
                  </div>
                  <div>
                    <div className="pb-project-title-row">
                      <h2 className="pb-project-name">{pj.name}</h2>
                      {!pj.isDefault && <span className="pb-project-slug">{pj.slug}</span>}
                      <Badge tone="neutral">{pjLanes.length} lane</Badge>
                    </div>
                    {pj.repoUrl && (
                      <div className="pb-project-repo mono">
                        <GitBranch size={11} />
                        <span>{pj.repoUrl}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pb-project-metrics">
                  <div className="pb-pm-item">
                    <span className="pb-pm-label">Tiến độ dự án ({activeCount} lane)</span>
                    <div className="pb-pm-val-row">
                      <span className="pb-pm-val">{avgProg != null ? `${avgProg}%` : '—'}</span>
                      <span className="pb-pm-mini-bar">
                        <i style={{ width: `${Math.max(0, Math.min(100, Number(avgProg) || 0))}%` }} />
                      </span>
                    </div>
                  </div>

                  <div className="pb-pm-divider" />

                  <div className="pb-pm-item">
                    <span className="pb-pm-label">Chi phí dự án</span>
                    <div className="pb-pm-val-row">
                      <span className="pb-pm-val">{fmtVnd(costVnd)}</span>
                      <span className="pb-pm-sub">({fmtUsd(costUsd)})</span>
                    </div>
                  </div>

                  {!pj.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={SlidersHorizontal}
                      onClick={() => onOpenProjectSettings(pj.id)}>
                      Cấu hình & Skill AI
                    </Button>
                  )}
                </div>
              </div>

              {/* Lanes Grid inside this Project */}
              {pjLanes.length > 0 ? (
                <div className="pb-lanes-grid">
                  {pjLanes.map(l => {
                    const attn = laneAttention(l);
                    const [age] = fmtAge(l.heartbeat_age_sec);
                    const stInfo = LANE_STATUS[l.status] || LANE_STATUS.idle;
                    const stepIdx = getSimpleStepIndex(l.stage, l.status);
                    const tc = l.track?.current;
                    const stageLabel = tc ? `${tc.label} · ${tc.sub}` : l.track?.releasing ? `Bàn giao — ${stageLabel_(l.stage)}` : stageLabel_(l.stage);
                    const isFinished = l.status === 'passed' || l.stage === 'done';
                    const segs = l.track ? l.track.steps.map((st, idx) => ({ id: st.id, label: `${idx + 1}. ${st.label} — ${st.sub}`, state: st.state }))
                      : SIMPLE_STEPS.map((st, idx) => ({ id: st.id, label: st.label,
                        state: (isFinished || idx < stepIdx) ? 'done' : idx === stepIdx ? 'current' : 'pending' }));
                    const prog = l.progress != null ? Number(l.progress) : (l.status === 'passed' ? 100 : 0);

                    return (
                      <article
                        key={l.lane}
                        className={`pb-lane-card${attn ? ' needs-attn' : ''}`}
                        onClick={() => onSelectLane(l.lane)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectLane(l.lane); } }}>
                        <div className="pb-lc-top">
                          <div className="pb-lc-id">
                            <StatusDot tone={dotTone(l)} pulse={l.status === 'running'} />
                            <span className="pb-lc-name">Lane {l.lane}</span>
                            <Badge tone={stInfo[0]}>{stInfo[1]}</Badge>
                          </div>
                          <span className="pb-lc-prog mono">{l.progress != null ? `${l.progress}%` : '—'}</span>
                        </div>

                        <h3 className="pb-lc-title">
                          {l.feature_title || 'Lane đang rảnh — sẵn sàng nhận tính năng mới'}
                        </h3>

                        {/* Mini-stepper: the lane's workflow steps (or the generic 6 stages) */}
                        <div className="pb-lc-stepper" aria-label={`Giai đoạn: ${stageLabel}`}>
                          <div className="pb-lc-segments" style={{ '--stage-count': segs.length }}>
                            {segs.map(st => (
                              <span
                                key={st.id}
                                className={`pb-lc-seg${st.state === 'done' ? ' done' : st.state === 'skipped' ? ' done skipped' : st.state === 'current' ? ' cur' : ''}`}
                                title={st.label}
                              />
                            ))}
                          </div>
                          <div className="pb-lc-stage-row">
                            <span className="pb-lc-stage-name">{stageLabel}</span>
                            {l.git_branch && <span className="pb-lc-branch mono">{l.git_branch}</span>}
                          </div>
                        </div>

                        {l.needs_action && (
                          <div className="pb-lc-alert">
                            <AlertTriangle size={13} />
                            <span>Cần bạn: {l.needs_action}</span>
                          </div>
                        )}

                        <footer className="pb-lc-foot">
                          <div className="pb-lc-meta mono">
                            <Clock size={12} />
                            <span>{age}</span>
                          </div>
                          <div className="pb-lc-cost mono">
                            {(l.cost_vnd > 0 || l.cost_usd > 0) ? (
                              <span title={`Chi phí Lane ${l.lane}: ${fmtVnd(l.cost_vnd)} (${fmtUsd(l.cost_usd)})`}>
                                {fmtVnd(l.cost_vnd)} · {fmtUsd(l.cost_usd)}
                              </span>
                            ) : (
                              <span className="faint">0 ₫</span>
                            )}
                          </div>
                          <span className="pb-lc-open">
                            <span>Chi tiết</span>
                            <ArrowRight size={13} />
                          </span>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="pb-empty-lanes">
                  <span>Dự án này chưa có Lane nào đang chạy tính năng.</span>
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => onAssign(null)}>
                    Giao việc vào Lane
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
