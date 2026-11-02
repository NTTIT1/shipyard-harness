import React, { useState, useEffect } from 'react';
import { Plus, Check, Rocket, RotateCcw, ArrowLeft, AlertTriangle, ExternalLink, MessagesSquare } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { JobView } from '../projects/WizardSteps.jsx';
import AddLaneModal from '../AddLaneModal.jsx';
import { fetchLanes } from '../../lib/api.js';
import { lanesOf, studio, projectChat } from '../../lib/studio.js';
import { scaffold } from '../../lib/scaffold.js';
import { importer } from '../../lib/importer.js';
import { laneStatus, stageLabel } from '../../lib/laneview.js';
import { tr } from '../../lib/i18n.js';

/**
 * After "Tạo dự án": the job creating it, the project's lanes, and the roadmap — queued on its own for
 * the project's free lanes. New features are added later in the project chat.
 */
export default function Build({ s, act, onOpenProject, onOpenChat }) {
  const [lanes, setLanes] = useState([]);
  const [queue, setQueue] = useState(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const pid = s.project?.projectId || s.job?.project?.id;
  useEffect(() => {
    if (!pid) return undefined;
    let stop = false, t;
    const tick = () => Promise.all([
      fetchLanes().then(d => { if (!stop) setLanes(d.lanes || d || []); }, () => {}),
      projectChat.queue(pid).then(q => { if (!stop) setQueue(q); }, () => {}),
    ]).finally(() => { if (!stop) t = setTimeout(tick, 5000); });
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [pid]);
  if (!s.project) return <p className="muted-empty">{tr('Chưa tạo dự án.')}</p>;
  const job = s.job;
  const mine = lanesOf(lanes, pid);
  const failed = job && (job.status === 'failed' || job.status === 'cancelled');
  // The job is gone (dashboard restarted) before the project was registered.
  const lost = !job && !pid;
  const retry = act(async () => {
    (s.project.importJobId ? importer : scaffold).retry(job.id).catch(e => setMsg(e.message));
    await new Promise(r => setTimeout(r, 400));
    return studio.get(s.id);
  });
  const back = act(() => {
    if (!window.confirm(tr('Xoá bản dự án đang tạo dở và quay lại bước Tạo dự án? Tài liệu đã duyệt và quy trình vẫn giữ.'))) return null;
    return studio.backToCreate(s.id);
  });
  const placeOf = f => {
    const a = queue?.assigned?.find(x => x.title === f.title);
    if (a) return tr('Lane {0} đang làm', [a.lane]);
    const k = (queue?.items || []).findIndex(x => x.title === f.title);
    return k >= 0 ? tr('Chờ lane · thứ {0}', [k + 1]) : '';
  };

  return (
    <div className="st-build">
      {job ? <JobView job={{ ...job, log: [], name: s.project.name }} stages={job.stageList} showLog={false} />
        : pid ? <p className="faint">{tr('Dự án {0} ({1}) đã được tạo.', [s.project.name, s.project.slug])}</p> : null}
      {lost && (
        <div className="wz-err" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>{tr('Việc tạo dự án')}{' '}<b>{s.project.name}</b>{' '}{tr('bị ngắt (dashboard khởi động lại) trước khi dự án được đăng ký.')}</div>
        </div>
      )}
      {(failed || lost) && (
        <div className="st-fail-actions">
          {failed && job.errorTail && <pre className="wz-log st-fail-log">{job.errorTail}</pre>}
          <p className="faint">
            {job?.retryable ? tr('Lỗi ở bước có thể chạy lại (mạng, phiên đăng nhập, tên repo trùng…) — sửa nguyên nhân rồi bấm Thử lại.')
              : job?.project ? tr('Dự án đã được đăng ký; chỉ bước sau bị lỗi.')
              : tr('Quay lại bước Tạo dự án để sửa tên, slug, kho Git hoặc quy trình rồi tạo lại.')}
          </p>
          <div className="st-approve">
            {job?.retryable && <Button variant="primary" icon={RotateCcw} onClick={retry}>{tr('Thử lại')}</Button>}
            {!job?.project && <Button variant={job?.retryable ? 'secondary' : 'primary'} icon={ArrowLeft} onClick={back}>{tr('Quay lại bước Tạo dự án')}</Button>}
          </div>
        </div>
      )}
      {pid && (
        <div className="st-approve">
          <Button variant="primary" icon={MessagesSquare} onClick={() => onOpenChat?.(pid)}>{tr('Mở chat dự án')}</Button>
          <Button icon={Rocket} onClick={() => onOpenProject?.(pid)}>{tr('Mở dự án')}</Button>
        </div>
      )}
      {failed || lost ? null : <>

      <h2 className="st-h2">{tr('Lane của dự án')}</h2>
      {mine.length ? (
        <ul className="st-lanes">
          {mine.map(l => (
            <li key={l.lane}><b>Lane {l.lane}</b> <span className="faint">· {l.status === 'provisioning' ? tr('đang chuẩn bị ({0})', [stageLabel(l.stage)]) : l.feature_title || laneStatus(l.status)[1]}</span>
              {l.status !== 'provisioning' && (
                <a className="st-app-link" href={`${window.location.protocol}//${window.location.hostname}:${3000 + Number(l.lane)}`} target="_blank" rel="noreferrer">{tr('Mở app')}{' '}<ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="faint">{tr('Chưa có lane nào cho dự án này. Thêm lane để các tính năng trong hàng chờ bắt đầu được làm.')}</p>}
      {(!job || job.status === 'done') && <Button icon={Plus} onClick={() => setAdding(true)}>{tr('Thêm lane cho dự án này')}</Button>}

      <h2 className="st-h2">{tr('Lộ trình tính năng')}</h2>
      <p className="faint st-queue-hint">{tr('Các tính năng chưa có trong code đã tự vào hàng chờ của dự án: lane nào của dự án rảnh trước thì nhận. Sắp xếp, bỏ bớt hoặc thêm tính năng mới trong chat dự án.')}</p>
      {queue?.error && <p className="wz-hint warn" role="alert">{queue.error}</p>}
      {msg && <p className="st-note" role="status">{msg}</p>}
      {s.roadmap?.length ? (
        <ol className="st-roadmap">
          {s.roadmap.map((f, i) => {
            const built = /\(Đã có\)\s*$/.test(f.text);
            const place = built ? '' : placeOf(f);
            return (
              <li key={i}>
                <div><b>{f.title}</b><span className="faint"> — {f.text.replace(f.title, '').replace(/^\s*[—–-]\s*/, '')}</span></div>
                {built ? <span className="st-ok"><Check size={14} aria-hidden="true" /> {tr('Đã có')}</span>
                  : place ? <span className="st-queued">{place}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="muted-empty">{tr('Bản kiến trúc chưa có mục “Lộ trình tính năng”.')}</p>}
      </>}
      {adding && <AddLaneModal initialProject={s.project.slug} onClose={() => setAdding(false)} onDone={() => setMsg(tr('Đang chuẩn bị lane (clone, cài thư viện, database) — vài phút; xong sẽ hiện ở đây.'))} />}
    </div>
  );
}
