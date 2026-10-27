import React, { useState, useEffect } from 'react';
import { Plus, Send, Check, Rocket, RotateCcw, ArrowLeft, AlertTriangle, ExternalLink, ListOrdered, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { JobView } from '../projects/WizardSteps.jsx';
import AddLaneModal from '../AddLaneModal.jsx';
import { fetchLanes, assignLane, fetchLaneQueue, saveLaneQueue } from '../../lib/api.js';
import { lanesOf, freeLanesOf, featureRequirement, studio, FEATURE_MODES } from '../../lib/studio.js';
import { scaffold } from '../../lib/scaffold.js';
import { laneStatus, stageLabel } from '../../lib/laneview.js';
import { platform } from '../../lib/platform.js';
import { workflowModels } from '../../lib/workflow.js';

export default function Build({ s, act, onOpenProject }) {
  const [lanes, setLanes] = useState([]);
  const [runs, setRuns] = useState([]);
  const [adding, setAdding] = useState(false);
  const [assigned, setAssigned] = useState({}); // feature index → lane
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState('full');          // how a lane takes a feature (FEATURE_MODES)
  const [queueLane, setQueueLane] = useState('');
  const [queues, setQueues] = useState({});         // lane → { items, error }
  const pid = s.project?.projectId || s.job?.project?.id;

  useEffect(() => {
    if (!pid) return undefined;
    let stop = false, t;
    const tick = () => Promise.all([
      fetchLanes().then(async d => {
        const all = d.lanes || d || [];
        if (stop) return;
        setLanes(all);
        const qs = await Promise.all(lanesOf(all, pid).map(l => fetchLaneQueue(l.lane).then(q => [l.lane, q], () => [l.lane, null])));
        if (!stop) setQueues(Object.fromEntries(qs.filter(([, q]) => q)));
      }, () => {}),
      platform.projectRuns(pid).then(r => { if (!stop && Array.isArray(r)) setRuns(r); }, () => {}),
    ]).finally(() => { if (!stop) t = setTimeout(tick, 5000); });
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [pid]);

  if (!s.project) return <p className="muted-empty">Chưa tạo dự án.</p>;
  const job = s.job;
  const mine = lanesOf(lanes, pid);
  const free = freeLanesOf(lanes, pid);

  const give = async (f, i) => {
    setMsg('');
    const lane = free[0];
    try {
      // The project's workflow decides the model of each step (the lane's defaults fill the rest).
      const models = await platform.workflow(pid).then(workflowModels, () => ({}));
      await assignLane(lane.lane, { requirement: featureRequirement(f, s.project, mode), ...(Object.keys(models).length ? { models } : {}) });
      setAssigned(a => ({ ...a, [i]: lane.lane }));
      setMsg(`Đã giao "${f.title}" cho lane ${lane.lane} — lane bắt đầu theo quy trình của dự án (Plan → Code → …).`);
    } catch (e) { setMsg(e.message); }
  };

  // Which lane (if any) took or is queued to take roadmap feature f.
  const norm = str => String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const taken = (f, i) => {
    const fNorm = norm(f.title);
    const run = runs.find(r => r.kind === 'FEATURE' && (norm(r.title) === fNorm || norm(r.title).includes(fNorm) || fNorm.includes(norm(r.title))));
    const lane = assigned[i] || (run?.laneRef && /:lane(\d+)$/.exec(run.laneRef)?.[1]) || mine.find(l => norm(l.feature_title) === fNorm)?.lane;
    return { run, lane };
  };
  const queuedAt = f => {
    for (const [ln, q] of Object.entries(queues)) {
      const k = (q.items || []).findIndex(x => x.title === f.title);
      if (k >= 0) return { lane: ln, pos: k + 1 };
    }
    return null;
  };
  const qLane = queueLane || String(mine[0]?.lane || '');

  // Queue every feature no lane has taken yet; the lane takes the next one each time it finishes.
  const queueRest = async () => {
    setMsg('');
    try {
      const models = await platform.workflow(pid).then(workflowModels, () => ({}));
      const rest = (s.roadmap || []).filter((f, i) => !taken(f, i).lane && !queuedAt(f));
      if (!rest.length) { setMsg('Không còn tính năng nào chưa giao.'); return; }
      const items = [...(queues[qLane]?.items || []), ...rest.map(f => ({ title: f.title, requirement: featureRequirement(f, s.project, mode),
        ...(Object.keys(models).length ? { models } : {}) }))];
      const q = await saveLaneQueue(qLane, items);
      setQueues(x => ({ ...x, [qLane]: q }));
      setMsg(`Đã xếp ${rest.length} tính năng cho lane ${qLane} — lane xong tính năng nào sẽ tự nhận tính năng tiếp theo.`);
    } catch (e) { setMsg(e.message); }
  };
  const unqueue = async (ln, title) => {
    try {
      const q = await saveLaneQueue(ln, (queues[ln]?.items || []).filter(x => x.title !== title));
      setQueues(x => ({ ...x, [ln]: q }));
    } catch (e) { setMsg(e.message); }
  };

  // Creation failed (or the dashboard restarted before the project was registered): retry or go back.
  const failed = job && (job.status === 'failed' || job.status === 'cancelled');
  const lost = !job && !pid;
  // The retry runs on the server; reload the idea so the page follows the running job.
  const retry = act(async () => {
    scaffold.retry(job.id).catch(e => setMsg(e.message));
    await new Promise(r => setTimeout(r, 400));
    return studio.get(s.id);
  });
  const back = act(() => {
    if (!window.confirm('Xoá bản dự án đang tạo dở và quay lại bước Tạo dự án? Tài liệu đã duyệt và quy trình vẫn giữ.')) return null;
    return studio.backToCreate(s.id);
  });

  return (
    <div className="st-build">
      {job ? <JobView job={{ ...job, log: [], name: s.project.name }} stages={job.stageList} showLog={false} />
        : pid ? <p className="faint">Dự án {s.project.name} ({s.project.slug}) đã được tạo.</p> : null}
      {lost && (
        <div className="wz-err" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>Việc tạo dự án <b>{s.project.name}</b> bị ngắt (dashboard khởi động lại) trước khi dự án được đăng ký.</div>
        </div>
      )}
      {(failed || lost) && (
        <div className="st-fail-actions">
          {failed && job.errorTail && <pre className="wz-log st-fail-log">{job.errorTail}</pre>}
          <p className="faint">
            {job?.retryable ? 'Lỗi ở bước có thể chạy lại (mạng, phiên đăng nhập, tên repo trùng…) — sửa nguyên nhân rồi bấm Thử lại.'
              : job?.project ? 'Dự án đã được đăng ký; chỉ bước sau bị lỗi.'
              : 'Quay lại bước Tạo dự án để sửa tên, slug, kho Git hoặc quy trình rồi tạo lại.'}
          </p>
          <div className="st-approve">
            {job?.retryable && <Button variant="primary" icon={RotateCcw} onClick={retry}>Thử lại</Button>}
            {!job?.project && <Button variant={job?.retryable ? 'secondary' : 'primary'} icon={ArrowLeft} onClick={back}>Quay lại bước Tạo dự án</Button>}
          </div>
        </div>
      )}
      {pid && <Button icon={Rocket} onClick={() => onOpenProject?.(pid)}>Mở dự án</Button>}
      {failed || lost ? null : <>

      <h2 className="st-h2">Lane của dự án</h2>
      {mine.length ? (
        <ul className="st-lanes">
          {mine.map(l => (
            <li key={l.lane}><b>Lane {l.lane}</b> <span className="faint">· {l.status === 'provisioning' ? `đang chuẩn bị (${stageLabel(l.stage)})` : l.feature_title || laneStatus(l.status)[1]}</span>
              {l.status !== 'provisioning' && (
                <a className="st-app-link" href={`${window.location.protocol}//${window.location.hostname}:${3000 + Number(l.lane)}`} target="_blank" rel="noreferrer">
                  Mở app <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="faint">Chưa có lane nào cho dự án này.</p>}
      {(!job || job.status === 'done') && <Button icon={Plus} onClick={() => setAdding(true)}>Thêm lane cho dự án này</Button>}

      <h2 className="st-h2">Lộ trình tính năng</h2>
      {mine.length > 0 && s.roadmap?.length > 0 && (
        <div className="st-queue">
          <label>Cách làm
            <select className="msel" value={mode} onChange={e => setMode(e.target.value)}>
              {FEATURE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label>Lane
            <select className="msel" value={qLane} onChange={e => setQueueLane(e.target.value)}>
              {mine.map(l => <option key={l.lane} value={l.lane}>Lane {l.lane}</option>)}
            </select>
          </label>
          <Button icon={ListOrdered} onClick={queueRest}>Xếp các tính năng còn lại cho lane {qLane}</Button>
          <p className="faint st-queue-hint">Lane làm lần lượt: xong tính năng nào, dashboard tự giao tính năng tiếp theo trong hàng đợi.</p>
        </div>
      )}
      {Object.entries(queues).filter(([, q]) => q.error).map(([ln, q]) => <p key={ln} className="wz-hint warn" role="alert">Lane {ln}: {q.error}</p>)}
      {msg && <p className="st-note" role="status">{msg}</p>}
      {s.roadmap?.length ? (
        <ol className="st-roadmap">
          {s.roadmap.map((f, i) => {
            const { run: matchedRun, lane: matchedLane } = taken(f, i);
            const queued = !matchedLane && queuedAt(f);
            const isDone = matchedRun?.status === 'DONE' || matchedRun?.status === 'APPROVED';
            return (
              <li key={i}>
                <div><b>{f.title}</b><span className="faint"> — {f.text.replace(f.title, '').replace(/^\s*[—–-]\s*/, '')}</span></div>
                {matchedLane ? <span className="st-ok"><Check size={14} aria-hidden="true" /> {isDone ? `Hoàn tất · Lane ${matchedLane}` : `Lane ${matchedLane}`}</span>
                  : queued ? (
                    <span className="st-queued">Chờ lane {queued.lane} · thứ {queued.pos}
                      <button type="button" className="st-queued-x" aria-label={`Bỏ "${f.title}" khỏi hàng đợi`} title="Bỏ khỏi hàng đợi"
                        onClick={() => unqueue(queued.lane, f.title)}><X size={12} aria-hidden="true" /></button>
                    </span>)
                  : <Button size="sm" icon={Send} disabled={!free.length} title={free.length ? '' : 'Chưa có lane rảnh của dự án này'}
                      onClick={() => give(f, i)}>{free.length ? `Giao cho lane ${free[0].lane}` : 'Chờ lane rảnh'}</Button>}
              </li>
            );
          })}
        </ol>
      ) : <p className="muted-empty">Bản kiến trúc chưa có mục “Lộ trình tính năng”.</p>}
      </>}
      {adding && <AddLaneModal initialProject={s.project.slug} onClose={() => setAdding(false)} onDone={() => setMsg('Đang chuẩn bị lane (clone, cài thư viện, database) — vài phút; xong sẽ hiện ở đây.')} />}
    </div>
  );
}
