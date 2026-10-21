import React, { useState, useEffect } from 'react';
import { Plus, Send, Check, Rocket } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { JobView } from '../projects/WizardSteps.jsx';
import AddLaneModal from '../AddLaneModal.jsx';
import { fetchLanes, assignLane } from '../../lib/api.js';
import { lanesOf, freeLanesOf, featureRequirement } from '../../lib/studio.js';

export default function Build({ s, onOpenProject }) {
  const [lanes, setLanes] = useState([]);
  const [adding, setAdding] = useState(false);
  const [assigned, setAssigned] = useState({}); // feature index → lane
  const [msg, setMsg] = useState('');
  const pid = s.project?.projectId || s.job?.project?.id;

  useEffect(() => {
    if (!pid) return undefined;
    let stop = false, t;
    const tick = () => fetchLanes().then(d => { if (!stop) setLanes(d.lanes || d || []); }, () => {}).finally(() => { if (!stop) t = setTimeout(tick, 5000); });
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
      await assignLane(lane.lane, { requirement: featureRequirement(f, s.project) });
      setAssigned(a => ({ ...a, [i]: lane.lane }));
      setMsg(`Đã giao "${f.title}" cho lane ${lane.lane} — lane bắt đầu theo quy trình của dự án (Plan → Code → …).`);
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="st-build">
      {job ? <JobView job={{ ...job, log: [], name: s.project.name }} stages={job.stageList} showLog={false} />
        : <p className="faint">Dự án {s.project.name} ({s.project.slug}) đã được tạo.</p>}
      {pid && <Button icon={Rocket} onClick={() => onOpenProject?.(pid)}>Mở dự án</Button>}

      <h2 className="st-h2">Lane của dự án</h2>
      {mine.length ? (
        <ul className="st-lanes">
          {mine.map(l => (
            <li key={l.lane}><b>Lane {l.lane}</b> <span className="faint">· {l.status === 'provisioning' ? `đang chuẩn bị (${l.stage})` : l.feature_title || l.status || 'rảnh'}</span></li>
          ))}
        </ul>
      ) : <p className="faint">Chưa có lane nào cho dự án này.</p>}
      {(!job || job.status === 'done') && <Button icon={Plus} onClick={() => setAdding(true)}>Thêm lane cho dự án này</Button>}

      <h2 className="st-h2">Lộ trình tính năng</h2>
      {msg && <p className="st-note" role="status">{msg}</p>}
      {s.roadmap?.length ? (
        <ol className="st-roadmap">
          {s.roadmap.map((f, i) => (
            <li key={i}>
              <div><b>{f.title}</b><span className="faint"> — {f.text.replace(f.title, '').replace(/^\s*[—–-]\s*/, '')}</span></div>
              {assigned[i] ? <span className="st-ok"><Check size={14} aria-hidden="true" /> Lane {assigned[i]}</span>
                : <Button size="sm" icon={Send} disabled={!free.length} title={free.length ? '' : 'Chưa có lane rảnh của dự án này'}
                    onClick={() => give(f, i)}>{free.length ? `Giao cho lane ${free[0].lane}` : 'Chờ lane rảnh'}</Button>}
            </li>
          ))}
        </ol>
      ) : <p className="muted-empty">Bản kiến trúc chưa có mục “Lộ trình tính năng”.</p>}
      {adding && <AddLaneModal initialProject={s.project.slug} onClose={() => setAdding(false)} onDone={() => setMsg('Đang chuẩn bị lane (clone, cài thư viện, database) — vài phút; xong sẽ hiện ở đây.')} />}
    </div>
  );
}
