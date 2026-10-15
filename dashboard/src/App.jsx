import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanes } from './hooks/useLanes.js';
import { useProof } from './hooks/useProof.js';
import { useReviews } from './hooks/useReviews.js';
import { postAction, deleteProof } from './lib/api.js';
import { useTheme } from './hooks/useTheme.js';
import { laneAttention } from './lib/laneview.js';
import { Menu as MenuIcon, Plus } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import LaneHeader from './components/LaneHeader.jsx';
import LaneOverview from './components/LaneOverview.jsx';
import SpecLinks from './components/SpecLinks.jsx';
import Tabs from './components/ui/Tabs.jsx';
import Button from './components/ui/Button.jsx';
import IconButton from './components/ui/IconButton.jsx';
import ProofGallery from './components/ProofGallery.jsx';
import ReviewTable from './components/ReviewTable.jsx';
import Lightbox from './components/Lightbox.jsx';
import GalleryModal from './components/GalleryModal.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import CredentialsModal from './components/CredentialsModal.jsx';
import AddLaneModal from './components/AddLaneModal.jsx';
import ProvidersModal from './components/ProvidersModal.jsx';
import AssignModal from './components/AssignModal.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import { useInbox } from './hooks/useInbox.js';
import InboxView from './components/InboxView.jsx';
import ReviewView from './components/ReviewView.jsx';
import ProjectsView from './components/ProjectsView.jsx';

export default function App({ user, onLogout }) {
  const { data, refreshNow } = useLanes();
  const [selectedLane, setSelectedLane] = useState(null);
  const [shot, setShot] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [credsModal, setCredsModal] = useState(null);
  const [addLane, setAddLane] = useState(false);
  const [providers, setProviders] = useState(false);
  const [view, setView] = useState('lanes');
  const [review, setReview] = useState(null);
  const inbox = useInbox();
  const openReview = useCallback(r => { setReview(r); setView('review'); }, []);
  const [assign, setAssign] = useState(undefined); // undefined = closed, null = open w/o preselected lane, number = preselected

  const lanes = data?.lanes || [];
  const config = data?.config || {};

  // auto-select first running lane
  useEffect(() => {
    if (!lanes.length) return;
    if (selectedLane != null && lanes.some(l => l.lane === selectedLane)) return;
    const run = lanes.find(l => l.status === 'running');
    setSelectedLane((run || lanes[0]).lane);
  }, [lanes, selectedLane]);

  const selectedLaneData = lanes.find(l => l.lane === selectedLane);

  const { proof, loadProof, selectFeature, selectedSlug } = useProof(selectedLane, lanes);
  const { reviews, loadReviews } = useReviews(selectedLane, lanes);

  // Is the picker on a PAST feature (not the lane's current one)?
  const viewingPast = !!(proof && selectedSlug && proof._cur && selectedSlug !== proof._cur);
  const selectedFeature = viewingPast ? (proof.features || []).find(f => f.slug === selectedSlug) : null;
  const selectedFeatureState = selectedFeature?.state || null;

  // A read-only "proof only" snapshot for older features whose pipeline state was
  // never persisted (proof dirs exist, but no state/laneN/<slug>.json).
  const proofOnly = {
    lane: selectedLaneData?.lane, mode: selectedLaneData?.mode,
    feature_title: selectedSlug, stage: 'proof only', status: 'archived',
    gate_decision: '', pr_url: '', ticket_url: '', liveness: 'idle', stage_age_sec: null,
    notes: 'Proof only — no pipeline state was recorded for this past feature.',
  };

  // Map + card follow the picker: live lane for the current feature; the archived
  // snapshot if we have one; otherwise the proof-only view. Always switches.
  const mapLane = !viewingPast
    ? selectedLaneData
    : selectedFeatureState
      ? { ...selectedLaneData, ...selectedFeatureState,
          feature_title: selectedFeatureState.feature_title || selectedSlug,
          stage_age_sec: null, liveness: 'idle' }
      : proofOnly;

  // soft refresh proof/reviews on each data tick
  useEffect(() => {
    if (selectedLane == null || !selectedLaneData) return;
    if (selectedLaneData.mode === 'pr-review') {
      loadReviews(selectedLane, false);
    } else {
      loadProof(selectedLane, false);
    }
  }, [data, selectedLane]);

  // keyboard handling for gallery modal (Esc)
  useEffect(() => {
    const h = e => {
      if (shot && e.key === 'Escape') { /* Lightbox handles its own */ return; }
      if (gallery && e.key === 'Escape') setGallery(null);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [shot, gallery]);

  const handleAction = useCallback((n, action) => {
    setConfirm({ lane: n, action, onConfirm: async () => {
      try { await postAction(n, action); } catch {}
      refreshNow();
    }});
  }, [refreshNow]);

  const handleCreds = useCallback((n, mode) => {
    setCredsModal({ lane: n, mode });
  }, []);

  const handleCleanup = useCallback((n, payload, label, after) => {
    setConfirm({
      lane: n,
      title: 'Delete screenshots?',
      message: `Permanently delete ${label}? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmCls: 'warn',
      onConfirm: async () => {
        try {
          if (payload._multi) {
            for (const [group, images] of Object.entries(payload._multi))
              await deleteProof(n, { slug: payload.slug, group, images });
          } else {
            await deleteProof(n, payload);
          }
        } catch { /* gallery refresh below reflects truth */ }
        if (after) after();
        loadProof(n, true);
      },
    });
  }, [loadProof]);

  const openShot = useCallback((slug, g, ix) => {
    if (!proof) return;
    const f = proof.features.find(x => x.slug === slug);
    if (!f) return;
    setShot({ slug, g, imgs: f.groups[g] || [], i: ix, lane: proof.lane });
  }, [proof]);

  const shotNav = useCallback((d) => {
    setShot(prev => {
      if (!prev) return prev;
      const ni = prev.i + d;
      if (ni < 0 || ni >= prev.imgs.length) return prev;
      return { ...prev, i: ni };
    });
  }, []);

  const openGallery = useCallback((slug, g) => {
    if (!proof) return;
    const f = proof.features.find(x => x.slug === slug);
    if (!f) return;
    setGallery({ slug, g, imgs: f.groups[g] || [], lane: proof.lane });
  }, [proof]);

  const { theme, toggle } = useTheme();
  const [drawer, setDrawer] = useState(false);
  const menuBtn = useRef(null);
  const [tab, setTab] = useState('overview');
  const attn = selectedLaneData ? laneAttention(selectedLaneData) : null;
  const needsChat = !viewingPast && (attn === 'question' || attn === 'approve');
  // Switching lanes resets to Overview (or Chat if it needs an answer); afterwards jump to Chat only
  // when attention NEWLY becomes question/approve, so polling never yanks the user around.
  const prevNeeds = useRef(false);
  useEffect(() => { setTab(needsChat ? 'chat' : 'overview'); prevNeeds.current = needsChat; }, [selectedLane]);
  useEffect(() => {
    if (needsChat && !prevNeeds.current) setTab('chat');
    prevNeeds.current = needsChat;
  }, [needsChat]);
  useEffect(() => { if (viewingPast && tab === 'chat') setTab('overview'); }, [viewingPast, tab]);
  const proofCount = (() => {
    const f = (proof?.features || []).find(x => x.slug === (selectedSlug || proof?._cur));
    return f ? Object.values(f.groups || {}).reduce((a, g) => a + g.length, 0) : 0;
  })();
  const headLane = viewingPast ? mapLane : selectedLaneData;

  return (
    <div className="app">
      <Sidebar lanes={lanes} selected={selectedLane} onSelect={setSelectedLane}
        onAssign={n => setAssign(n)} onAddLane={() => setAddLane(true)} onProviders={() => setProviders(true)}
        theme={theme} onToggleTheme={toggle} user={user} onLogout={onLogout}
        view={view} onView={setView} inboxCount={inbox.items.length} open={drawer} onClose={() => setDrawer(false)} returnFocusRef={menuBtn} />
      <main className="main">
        <div className="topbar">
          <IconButton ref={menuBtn} icon={MenuIcon} label="Mở danh sách lane" onClick={() => setDrawer(true)} />
          <b>Shipyard</b>
        </div>
        {view === 'inbox' && <InboxView items={inbox.items} error={inbox.error} onOpen={i => openReview({ runId: i.runId, approvalId: i.approvalId })} />}
        {view === 'review' && review && <ReviewView key={review.runId + (review.approvalId || '')} runId={review.runId} approvalId={review.approvalId}
          inboxItems={inbox.items} onBack={() => setView('inbox')} onDecided={inbox.refresh} />}
        {view === 'projects' && <ProjectsView user={user} onOpenRun={runId => openReview({ runId })} />}
        {view === 'lanes' && (<>
        {!selectedLaneData ? (
          <div className="empty-state">
            <h1>Chưa có lane nào</h1>
            <p>Thêm lane để bắt đầu, rồi giao việc cho nó.</p>
            <Button variant="primary" icon={Plus} onClick={() => setAddLane(true)}>Thêm lane</Button>
          </div>
        ) : (
          <>
            <LaneHeader lane={headLane} archived={viewingPast} onAction={handleAction} onCreds={handleCreds}
              onReview={() => openReview({ runId: selectedLaneData.run_id })}
              onAssign={n => setAssign(n)} onTab={setTab} />
            {selectedLaneData.mode === 'pr-review' ? (
              <div className="tabpanel"><ReviewTable reviews={reviews} needsAction={selectedLaneData.needs_action} config={config} /></div>
            ) : (
              <>
                <Tabs value={tab} onChange={setTab} items={[
                  { id: 'overview', label: 'Tổng quan' },
                  ...(viewingPast ? [] : [{ id: 'chat', label: 'Chat', dot: needsChat }]),
                  { id: 'proof', label: 'Ảnh QC', badge: proofCount || null },
                  ...(headLane.spec_dir ? [{ id: 'spec', label: 'Spec' }] : []),
                ]} />
                <div className="tabpanel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                  {tab === 'overview' && <LaneOverview lane={mapLane} config={config} archived={viewingPast} />}
                  {tab === 'chat' && !viewingPast && <ChatPanel key={selectedLane} lane={selectedLaneData} />}
                  {tab === 'proof' && <ProofGallery proof={proof} selectedLane={selectedLane} selectedSlug={selectedSlug}
                    onSelectFeature={selectFeature} onShot={openShot} onGallery={openGallery} onCleanup={handleCleanup} />}
                  {tab === 'spec' && <SpecLinks lane={headLane} />}
                </div>
              </>
            )}
          </>
        )}
        </>)}
      </main>

      {confirm && (
        <ConfirmModal lane={confirm.lane} action={confirm.action}
          title={confirm.title} message={confirm.message}
          confirmLabel={confirm.confirmLabel} confirmCls={confirm.confirmCls}
          onConfirm={confirm.onConfirm} onClose={() => setConfirm(null)} />
      )}
      {credsModal && (
        <CredentialsModal lane={credsModal.lane} mode={credsModal.mode} config={config}
          onClose={() => setCredsModal(null)} onDone={refreshNow} />
      )}
      {providers && <ProvidersModal onClose={() => setProviders(false)} />}
      {assign !== undefined && (
        <AssignModal lanes={lanes} initialLane={assign} onClose={() => setAssign(undefined)}
          onDone={n => { setSelectedLane(n); refreshNow(); }} />
      )}
      {addLane && (
        <AddLaneModal onClose={() => setAddLane(false)} onDone={refreshNow} />
      )}
      <GalleryModal gallery={gallery} onClose={() => setGallery(null)} onShot={openShot} />
      <Lightbox shot={shot} onClose={() => setShot(null)} onNav={shotNav} />
    </div>
  );
}
