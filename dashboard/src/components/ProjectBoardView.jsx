import React, { useEffect, useMemo, useState } from 'react';
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
import { laneAttention, projectProgress } from '../lib/laneview.js';
import { projectChat } from '../lib/studio.js';
import { simpleStepIndex } from '../lib/constants.js';
import { useWorkflowLanes } from '../hooks/useRunViews.js';
import { tr } from '../lib/i18n.js';



const SIMPLE_STEPS = [
  { id: 'plan', label: tr('1. Kế hoạch') },
  { id: 'code', label: tr('2. Lập trình') },
  { id: 'check', label: tr('3. Kiểm tra') },
  { id: 'qc', label: tr('4. Review & QC') },
  { id: 'pr', label: tr('5. Pull Request') },
  { id: 'done', label: tr('6. Hoàn tất') },
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

  // Each project's roadmap (features and where they stand): its real progress, not just its lanes'.
  const [roadmaps, setRoadmaps] = useState({});
  const ids = projects.map(p => p.id).join(',');
  useEffect(() => {
    if (!ids) return undefined;
    let stop = false;
    const load = () => Promise.all(ids.split(',').map(id => projectChat.features(id).then(list => [id, list], () => [id, null])))
      .then(rs => { if (!stop) setRoadmaps(Object.fromEntries(rs)); });
    load();
    const t = setInterval(load, 30_000);
    return () => { stop = true; clearInterval(t); };
  }, [ids]);

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
          name: projects.length === 0 ? tr('Không gian làm việc mặc định') : tr('Các Lane dùng chung / Chưa gắn dự án'),
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
          <h1 id="pb-title" className="pb-h1">{tr('Tổng quan')}</h1>
          <p className="pb-subtitle">{tr('Tiến độ, chi phí và trạng thái các lane, gom theo dự án.')}</p>
        </div>
        <div className="pb-header-actions">
          {canScaffold && (
            <Button variant="secondary" icon={Wand2} onClick={onOpenWizard}>{tr('Tạo dự án')}</Button>
          )}
          <Button variant="secondary" icon={Server} onClick={onAddLane}>{tr('Thêm lane')}</Button>
          {/* The sidebar carries this action on wide screens; phones only see it here. */}
          <Button variant="primary" icon={Plus} className="pb-cta-narrow" onClick={() => onAssign(null)}>{tr('Giao việc mới')}</Button>
        </div>
      </header>

      {/* Scope Telemetry Strip */}
      <div className="pb-telemetry-strip" aria-label={tr('Chỉ số tổng hợp')}>
        <div className="pb-telemetry-cell">
          <span className="pb-telemetry-label">
            <FolderKanban size={14} aria-hidden="true" />
            <span>{tr('Đang xem')}</span>
          </span>
          <div className="pb-telemetry-main">
            <span className="pb-telemetry-val">
              {(!activeProjectId || activeProjectId === 'ALL') ? tr('{0} dự án', [projects.length || 1]) : visibleGroups[0]?.project?.name || tr('1 dự án')}
            </span>
            <span className="pb-telemetry-badge">{scopeMetrics.laneCount} lane</span>
          </div>
          <span className="pb-telemetry-sub">
            {tr('{0} đang chạy · {1} cần duyệt', [scopeMetrics.runningCount, scopeMetrics.waitingCount])}</span>
        </div>

        <div className="pb-telemetry-cell">
          <span className="pb-telemetry-label">
            <Gauge size={14} aria-hidden="true" />
            <span>{tr('Tiến độ trung bình')}</span>
          </span>
          <div className="pb-telemetry-main">
            <span className="pb-telemetry-val">{scopeMetrics.avgProg != null ? `${scopeMetrics.avgProg}%` : '—'}</span>
            <div className="pb-telemetry-bar">
              <i style={{ width: `${Math.max(0, Math.min(100, Number(scopeMetrics.avgProg) || 0))}%` }} />
            </div>
          </div>
          <span className="pb-telemetry-sub">
            {scopeMetrics.activeCount > 0
              ? tr('Trung bình cộng từ {0}/{1} lane có việc', [scopeMetrics.activeCount, scopeMetrics.laneCount])
              : tr('Chưa có lane nào đang thực thi')}
          </span>
        </div>

        <div className="pb-telemetry-cell">
          <span className="pb-telemetry-label is-cost">
            <Coins size={14} aria-hidden="true" />
            <span>{tr('Chi phí tháng này')}</span>
          </span>
          <div className="pb-telemetry-main">
            <span className="pb-telemetry-val">{fmtVnd(scopeMetrics.totalVnd)}</span>
            <span className="pb-telemetry-badge">{fmtUsd(scopeMetrics.totalUsd)} API</span>
          </div>
          <span className="pb-telemetry-sub">{tr('Tổng các lane đang xem')}</span>
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
                  <ProjectProgress progress={projectProgress(roadmaps[pj.id], pjLanes)} avgProg={avgProg} activeCount={activeCount} />

                  <div className="pb-pm-divider" />

                  <div className="pb-pm-item">
                    <span className="pb-pm-label">{tr('Chi phí dự án')}</span>
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
                      onClick={() => onOpenProjectSettings(pj.id)}>{tr('Cấu hình & Skill AI')}</Button>
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
                    const stageLabel = tc ? `${tc.label} · ${tc.sub}` : l.track?.releasing ? tr('Bàn giao — {0}', [stageLabel_(l.stage)]) : stageLabel_(l.stage);
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
                          {l.feature_title || tr('Lane đang rảnh — sẵn sàng nhận tính năng mới')}
                        </h3>

                        {/* Mini-stepper: the lane's workflow steps (or the generic 6 stages) */}
                        <div className="pb-lc-stepper" aria-label={tr('Giai đoạn: {0}', [stageLabel])}>
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
                            <span>{tr('Cần bạn: {0}', [l.needs_action])}</span>
                          </div>
                        )}

                        <footer className="pb-lc-foot">
                          <div className="pb-lc-meta mono">
                            <Clock size={12} />
                            <span>{age}</span>
                          </div>
                          <div className="pb-lc-cost mono">
                            {(l.cost_vnd > 0 || l.cost_usd > 0) ? (
                              <span title={tr('Chi phí Lane {0}: {1} ({2})', [l.lane, fmtVnd(l.cost_vnd), fmtUsd(l.cost_usd)])}>
                                {fmtVnd(l.cost_vnd)} · {fmtUsd(l.cost_usd)}
                              </span>
                            ) : (
                              <span className="faint">0 ₫</span>
                            )}
                          </div>
                          <span className="pb-lc-open">
                            <span>{tr('Chi tiết')}</span>
                            <ArrowRight size={13} />
                          </span>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="pb-empty-lanes">
                  <span>{tr('Dự án này chưa có Lane nào đang chạy tính năng.')}</span>
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => onAssign(null)}>{tr('Giao việc vào Lane')}</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Where the project stands by its roadmap: % built (a feature a lane is building counts by its progress), a bar
 * split built / building / waiting / not scheduled, and the counts. A project without a roadmap shows its lanes'.
 */
function ProjectProgress({ progress: p, avgProg, activeCount }) {
  if (!p) {
    return (
      <div className="pb-pm-item">
        <span className="pb-pm-label">{tr('Tiến độ lane ({0} lane)', [activeCount])}</span>
        <div className="pb-pm-val-row">
          <span className="pb-pm-val">{avgProg != null ? `${avgProg}%` : '—'}</span>
          <span className="pb-pm-mini-bar"><i style={{ width: `${Math.max(0, Math.min(100, Number(avgProg) || 0))}%` }} /></span>
        </div>
      </div>
    );
  }
  const seg = [['done', p.done], ['building', p.building], ['waiting', p.waiting], ['planned', p.planned]];
  const detail = [p.building && tr('{0} đang làm', [p.building]), p.waiting && tr('{0} chờ lane', [p.waiting]), p.planned && tr('{0} chưa xếp lịch', [p.planned])].filter(Boolean).join(' · ');
  return (
    <div className="pb-pm-item pb-prog">
      <span className="pb-pm-label">{tr('Tiến độ dự án')}</span>
      <div className="pb-pm-val-row">
        <span className="pb-pm-val">{p.percent}%</span>
        <span className="pb-prog-bar" role="img" aria-label={tr('{0} trên {1} tính năng đã có', [p.done, p.total])}>
          {seg.filter(([, n]) => n > 0).map(([k, n]) => <i key={k} className={`pb-prog-${k}`} style={{ flexGrow: n }} />)}
        </span>
      </div>
      <span className="pb-prog-sub">{tr('{0}/{1} tính năng đã có', [p.done, p.total])}{detail ? ` · ${detail}` : ''}</span>
    </div>
  );
}
