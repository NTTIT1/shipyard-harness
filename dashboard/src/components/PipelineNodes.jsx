import React from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { NODES, MAINY, FIXN, BLKN, TKT, BLKY } from '../lib/constants.js';
import { phaseIdx } from '../lib/constants.js';
import { tr } from '../lib/i18n.js';

function evidence(l) {
  const gd = (l.gate_decision || '').toUpperCase();
  return {
    8: l.pr_url ? '' : tr('Đã qua nhưng chưa ghi nhận link PR — kiểm tra PR có tồn tại'),
    7: gd === 'GO' ? '' : tr('Đã qua nhưng chưa ghi nhận GO — kiểm tra bước duyệt cuối đã chạy'),
  };
}

function Node({ name, icon: Icon, x, y, cls, tip }) {
  const isCur = cls.includes('cur');
  const haloMood = cls.includes('bad') ? 'bad' : cls.includes('warn') ? 'warn' : '';
  return (
    <g>
      {tip && <title>{tip}</title>}
      {isCur && <circle className={`halo ${haloMood}`} cx={x} cy={y} r="16" />}
      <circle className={`node ${cls}`} cx={x} cy={y} r="15" />
      <Icon className={`n-ic ${cls}`} x={x - 8} y={y - 8} width={16} height={16} strokeWidth={1.75} aria-hidden="true" />
      {cls.includes('done') && !cls.includes('evwarn') &&
        <Check className="n-tick ok" x={x + 6} y={y - 16} width={10} height={10} strokeWidth={3} aria-hidden="true" />}
      {cls.includes('evwarn') &&
        <TriangleAlert className="n-tick warn" x={x + 6} y={y - 17} width={11} height={11} strokeWidth={2.25} aria-hidden="true" />}
      <text className={`n-label ${isCur ? 'cur' : ''}`} x={x} y={y + 31} textAnchor="middle">{name}</text>
    </g>
  );
}

export default function PipelineNodes({ lane, config }) {
  const cur = phaseIdx(lane.stage);
  const isDone = lane.stage === 'done';
  const mood = lane.status === 'blocked' ? 'warn' : (lane.status === 'failed' || lane.liveness === 'dead') ? 'bad' : '';
  const EV = evidence(lane);
  const integrations = config?.integrations || {};

  const nodes = NODES.map(([name, icon, x], i) => {
    let cls = '', tip = '';
    if (isDone || i < cur) {
      cls = 'done';
      if (EV[i] !== undefined && EV[i]) { cls = 'done evwarn'; tip = EV[i]; }
    } else if (i === cur) {
      cls = 'cur ' + mood;
    }

    // dev-QC node (11, post-merge) — independent coloring
    if (i === 11 && !integrations.dev_qc) {
      cls = 'na'; tip = tr('Dự án này chưa bật QC trên dev');
    } else if (i === 11 && (isDone || cur >= 10)) {
      const q = lane.qc_dev || '';
      if (q === 'passed') { cls = 'done'; tip = ''; }
      else if (q === 'failed') { cls = 'cur bad'; tip = tr('QC trên dev KHÔNG ĐẠT'); }
      else if (q === 'running') { cls = 'cur'; tip = tr('Đang QC trên dev (chạy nền)'); }
      else if (cls === 'done') { cls = 'done evwarn'; tip = tr('Đã qua nhưng chưa có bằng chứng QC trên dev'); }
    }

    return <Node key={`n${i}`} name={name} icon={icon} x={x} y={MAINY} cls={cls} tip={tip} />;
  });

  // self-resolve badges
  const badges = (
    <g>
      <title>{tr('Xung đột khi kiểm tra trước / khi đồng bộ nhánh gốc → tự giải quyết ngay trên nhánh')}</title>
      <text x="382" y={MAINY - 14} textAnchor="middle" fontSize="12" style={{ fill: 'var(--warn)' }}>{'↻'}</text>
    </g>
  );

  // fix node
  const fixNode = <Node name={FIXN[0]} icon={FIXN[1]} x={FIXN[2]} y={FIXN[3]} cls="" tip="" />;

  // blocked node
  const gateBlk = lane.status === 'blocked' && cur === phaseIdx('gate');
  const blkNode = (
    <>
      <Node name={BLKN[0]} icon={BLKN[1]} x={BLKN[2]} y={BLKN[3]}
        cls={gateBlk ? 'cur warn' : ''} tip={tr('Bị chặn ở bước duyệt cuối — chuyển lên chờ bạn quyết (NO-GO chỉ quay lại vòng sửa, không có giới hạn tự động)')} />
      <text className={`n-label ${gateBlk ? 'cur' : ''}`} x="867" y={BLKY + 4} textAnchor="start">
        {tr('bị chặn — cần bạn')}
      </text>
    </>
  );

  // ticket node
  let tcls = '', ttip = '';
  if (!integrations.tracker) { tcls = 'na'; ttip = tr('Dự án này chưa bật tracker'); }
  else if (isDone || cur >= 9) {
    if (lane.ticket_url) { tcls = 'done'; }
    else { tcls = 'done evwarn'; ttip = tr('Chưa ghi nhận link ticket'); }
  }
  const tktNode = <Node name={TKT[0]} icon={TKT[1]} x={TKT[2]} y={TKT[3]} cls={tcls} tip={ttip} />;

  return <>{nodes}{badges}{fixNode}{blkNode}{tktNode}</>;
}
