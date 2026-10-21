import React, { useCallback, useEffect, useState, useMemo, lazy, Suspense } from 'react';
import {
  Plus, Copy, Check, FolderKanban,
  GitBranch, ExternalLink, Search, AlertCircle,
  Wand2
} from 'lucide-react';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';
import Tabs from './ui/Tabs.jsx';
import MemoryPanel from './MemoryPanel.jsx';
import TeamPanel from './TeamPanel.jsx';
import DeleteProjectButton from './DeleteProjectButton.jsx';
import ProjectMembersTab from './projects/ProjectMembersTab.jsx';
import ProjectGatesTab from './projects/ProjectGatesTab.jsx';
import ProjectRunsTab from './projects/ProjectRunsTab.jsx';
import LinkRepoModal from './projects/LinkRepoModal.jsx';
import { platform } from '../lib/platform.js';
import { ROLE_LABEL } from '../lib/review.js';
import { fmtVnd, fmtUsd, fmtTokens, sumTokens } from '../lib/costs.js';

const NewProjectWizard = lazy(() => import('./NewProjectWizard.jsx'));

export default function ProjectsView({
  user,
  lanesData,
  activeProjectId,
  onSelectProject,
  onOpenRun,
  subTab,
  onTabChange,
}) {
  const [projects, setProjects] = useState([]);
  const [localSel, setLocalSel] = useState(null);
  const [localTab, setLocalTab] = useState('members');
  const tab = subTab || localTab;
  const setTab = onTabChange || setLocalTab;
  const [err, setErr] = useState('');
  const [copiedType, setCopiedType] = useState('');
  const [searchPj, setSearchPj] = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [wizard, setWizard] = useState(false);

  const sel = activeProjectId && projects.some(p => p.id === activeProjectId)
    ? activeProjectId
    : localSel;

  const selectProject = useCallback(id => {
    setLocalSel(id);
    if (onSelectProject) onSelectProject(id);
  }, [onSelectProject]);

  const load = useCallback(async () => {
    try {
      const ps = await platform.projects();
      setProjects(ps);
      setLocalSel(s => s || ps[0]?.id || null);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const project = projects.find(p => p.id === sel) || projects[0] || null;
  const roles = project?.currentUserRoles || [];
  const canManage = roles.includes('OWNER') || roles.includes('MAINTAINER');
  const canScaffold = !user || user.role === 'SYS_ADMIN';

  const allLanes = lanesData?.lanes || [];
  const projectCosts = lanesData?.project_costs || {};
  const byProjectList = projectCosts.byProject || [];

  const getProjectMetrics = useCallback(pid => {
    if (!pid) return { avgProg: null, activeCount: 0, matchedLanes: [], costVnd: 0, costUsd: 0, tokens: 0, quotaPct: 0 };
    const matched = allLanes.filter(l => l.run_project_id === pid);
    const targetLanes = matched.length > 0 ? matched : (projects.length === 1 ? allLanes : []);
    const activeLanes = targetLanes.filter(l => l.progress != null && l.stage && l.stage !== 'no-state');
    const avgProg = activeLanes.length > 0
      ? Math.round(activeLanes.reduce((sum, l) => sum + (Number(l.progress) || 0), 0) / activeLanes.length)
      : null;

    const pjCost = byProjectList.find(x => x.projectId === pid);
    if (pjCost) {
      return {
        avgProg,
        activeCount: activeLanes.length,
        matchedLanes: targetLanes,
        costVnd: pjCost.vnd || 0,
        costUsd: pjCost.usd || 0,
        tokens: sumTokens(pjCost.tokens),
        quotaPct: pjCost.quotaPct || 0,
      };
    }

    const fallbackVnd = targetLanes.reduce((sum, l) => sum + (Number(l.cost_vnd) || 0), 0);
    const fallbackUsd = targetLanes.reduce((sum, l) => sum + (Number(l.cost_usd) || 0), 0);
    const useTotal = matched.length === 0 && projects.length === 1 && projectCosts.totals;
    return {
      avgProg,
      activeCount: activeLanes.length,
      matchedLanes: targetLanes,
      costVnd: useTotal ? (projectCosts.totals.vnd || 0) : fallbackVnd,
      costUsd: useTotal ? (projectCosts.totals.usd || 0) : fallbackUsd,
      tokens: useTotal ? sumTokens(projectCosts.totals.tokens) : 0,
      quotaPct: useTotal ? (projectCosts.quotas?.month?.quotaPct || 0) : 0,
    };
  }, [allLanes, byProjectList, projectCosts, projects.length]);

  const currentMetrics = useMemo(() => getProjectMetrics(project?.id), [getProjectMetrics, project?.id]);

  const filteredProjects = useMemo(() => {
    if (!searchPj.trim()) return projects;
    const q = searchPj.toLowerCase();
    return projects.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.slug || '').toLowerCase().includes(q)
    );
  }, [projects, searchPj]);

  const copyEnvVar = () => {
    if (!project) return;
    navigator.clipboard?.writeText(`PLATFORM_PROJECT_ID="${project.id}"`);
    setCopiedType('env');
    setTimeout(() => setCopiedType(''), 2000);
  };

  return (
    <section className="pj-workspace" aria-labelledby="pj-title">
      {/* Only show horizontal project switcher when there are multiple projects */}
      {projects.length > 1 && (
        <div className="pj-switcher-bar">
          <div className="pj-switcher-pills" role="tablist" aria-label="Danh sách dự án">
            {filteredProjects.map(p => {
              const pm = getProjectMetrics(p.id);
              const active = p.id === project?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`pj-switch-pill${active ? ' active' : ''}`}
                  onClick={() => selectProject(p.id)}>
                  <FolderKanban size={14} className="pj-switch-icon" />
                  <span className="pj-switch-name">{p.name}</span>
                  {pm.avgProg != null && (
                    <span className="pj-switch-prog">{pm.avgProg}%</span>
                  )}
                </button>
              );
            })}
          </div>

          {projects.length > 4 && (
            <div className="pj-switcher-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Lọc dự án…"
                value={searchPj}
                onChange={e => setSearchPj(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {err && (
        <div className="alert-banner err" role="alert">
          <AlertCircle size={18} />
          <div className="alert-banner-content m-err" style={{ margin: 0 }}>{err}</div>
          <button className="linklike" onClick={() => setErr('')} style={{ color: 'inherit', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      {project ? (
        <div className="pj-detail-stack">
          {/* Unified Apple-Style Project Header (Identity + Actions + Compact Telemetry Strip) */}
          <div className="pj-apple-header">
            <div className="pj-apple-head-main">
              <div className="pj-hero-identity">
                <div className="pj-avatar-badge">
                  <FolderKanban size={19} />
                </div>
                <div className="pj-hero-names">
                  <div className="pj-hero-title">
                    <h1 id="pj-title">{project.name}</h1>
                    <span className="pj-hero-slug">{project.slug}</span>
                    {roles.map(r => (
                      <Badge key={r} tone={r === 'OWNER' ? 'accent' : 'neutral'}>
                        {ROLE_LABEL[r] || r}
                      </Badge>
                    ))}
                  </div>
                  <div className="pj-hero-meta-row">
                    {project.repoUrl ? (
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="pj-repo-link">
                        <GitBranch size={12} />
                        <span>{project.repoUrl}</span>
                        <ExternalLink size={11} style={{ opacity: 0.65 }} />
                      </a>
                    ) : (
                      <span className="pj-meta-muted">Cấu hình quyền hạn, cổng duyệt và kỹ năng AI của dự án</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pj-hero-actions">
                <Button variant="ghost" size="sm" icon={Plus} onClick={() => setShowLinkModal(true)}>
                  Liên kết kho
                </Button>
                {canScaffold && (
                  <Button variant="secondary" size="sm" icon={Wand2} onClick={() => setWizard(true)}>
                    Tạo dự án mới
                  </Button>
                )}
                {roles.includes('OWNER') && (
                  <DeleteProjectButton
                    project={project}
                    onDeleted={() => { selectProject(null); load(); }}
                  />
                )}
              </div>
            </div>

            {/* Restrained Apple Hairline Telemetry Strip */}
            <div className="pj-apple-metrics-bar">
              <div className="pj-apple-metric">
                <span className="pj-apple-metric-label">Tiến độ</span>
                <div className="pj-apple-metric-val-row">
                  <strong className="pj-apple-metric-val">
                    {currentMetrics.avgProg != null ? `${currentMetrics.avgProg}%` : '—'}
                  </strong>
                  <div className="pj-apple-mini-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(0, Math.min(100, Number(currentMetrics.avgProg) || 0))}%` }} />
                  </div>
                  <span className="pj-apple-metric-sub">
                    {currentMetrics.activeCount > 0
                      ? `${currentMetrics.activeCount} lane đang chạy`
                      : 'Chưa có lane chạy'}
                  </span>
                </div>
              </div>

              <div className="pj-apple-metric">
                <span className="pj-apple-metric-label">Chi phí</span>
                <div className="pj-apple-metric-val-row">
                  <strong className="pj-apple-metric-val">{fmtVnd(currentMetrics.costVnd)}</strong>
                  <span className="pj-apple-metric-sub">
                    {fmtUsd(currentMetrics.costUsd)}
                    {currentMetrics.tokens > 0 ? ` · ${fmtTokens(currentMetrics.tokens)} tok` : ''}
                  </span>
                </div>
              </div>

              <div className="pj-apple-metric pj-apple-metric-env">
                <span className="pj-apple-metric-label">Mã kết nối Lane</span>
                <div className="pj-apple-metric-val-row">
                  <code className="pj-apple-code mono" title={`PLATFORM_PROJECT_ID="${project.id}"`}>
                    {project.id}
                  </code>
                  <button
                    type="button"
                    className="pj-copy-pill"
                    onClick={copyEnvVar}>
                    {copiedType === 'env' ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedType === 'env' ? 'Đã chép biến' : 'Chép biến'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-navigation Tabs */}
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'members', label: 'Thành viên & Vai trò' },
              { id: 'gates', label: 'Quy trình & duyệt' },
              { id: 'team', label: 'Kỹ năng AI & Khung dự án' },
              { id: 'runs', label: 'Tính năng & Model AI' },
              { id: 'memory', label: 'Bộ nhớ dự án' }
            ]}
          />

          {tab === 'members' && <ProjectMembersTab key={project.id} pid={project.id} canManage={canManage} />}
          {tab === 'gates' && <ProjectGatesTab key={project.id} pid={project.id} canManage={canManage} />}
          {tab === 'team' && <TeamPanel key={project.id} pid={project.id} onOpenRun={onOpenRun} />}
          {tab === 'runs' && <ProjectRunsTab key={project.id} pid={project.id} onOpenRun={onOpenRun} />}
          {tab === 'memory' && <MemoryPanel key={project.id} projectId={project.id} canManage={canManage} />}
        </div>
      ) : (
        <div className="modern-empty-state" style={{ minHeight: 280 }}>
          <div className="modern-empty-icon">
            <FolderKanban size={24} />
          </div>
          <div id="pj-title" className="modern-empty-title">Chưa có dự án nào được chọn</div>
          <div className="modern-empty-desc">
            Hãy tạo dự án mới từ khung hoặc liên kết kho mã nguồn đã có để bắt đầu điều phối các lane.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" icon={Plus} onClick={() => setShowLinkModal(true)}>
              Liên kết kho đã có
            </Button>
            {canScaffold && (
              <Button variant="primary" icon={Wand2} onClick={() => setWizard(true)}>
                Tạo dự án từ khung
              </Button>
            )}
          </div>
        </div>
      )}

      {showLinkModal && (
        <LinkRepoModal
          canScaffold={canScaffold}
          onClose={() => setShowLinkModal(false)}
          onOpenWizard={() => setWizard(true)}
          onCreated={async id => { await load(); if (id) selectProject(id); }}
        />
      )}

      {wizard && (
        <Suspense fallback={null}>
          <NewProjectWizard
            onClose={() => setWizard(false)}
            onCreated={async id => { await load(); if (id) selectProject(id); }}
          />
        </Suspense>
      )}
    </section>
  );
}
