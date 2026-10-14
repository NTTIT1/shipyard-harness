import React from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { NODES, MAINY, FIXN, BLKN, TKT, BLKY } from '../lib/constants.js';
import { phaseIdx } from '../lib/constants.js';

function evidence(l) {
  const gd = (l.gate_decision || '').toUpperCase();
  return {
    8: l.pr_url ? '' : 'passed but no pr_url recorded — verify the PR exists',
    7: gd === 'GO' ? '' : 'passed but no GO recorded — verify the senior gate ran',
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
      cls = 'na'; tip = 'dev-QC integration off for this profile';
    } else if (i === 11 && (isDone || cur >= 10)) {
      const q = lane.qc_dev || '';
      if (q === 'passed') { cls = 'done'; tip = ''; }
      else if (q === 'failed') { cls = 'cur bad'; tip = 'dev-QC FAILED'; }
      else if (q === 'running') { cls = 'cur'; tip = 'dev-QC running in background'; }
      else if (cls === 'done') { cls = 'done evwarn'; tip = 'passed without dev-QC evidence'; }
    }

    return <Node key={`n${i}`} name={name} icon={icon} x={x} y={MAINY} cls={cls} tip={tip} />;
  });

  // self-resolve badges
  const badges = (
    <g>
      <title>preflight collision / base-sync conflict → resolved in place on the branch</title>
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
        cls={gateBlk ? 'cur warn' : ''} tip="blocked at the senior gate — escalated for your decision (a NO-GO just re-enters the loop; there's no automatic cap)" />
      <text className={`n-label ${gateBlk ? 'cur' : ''}`} x="867" y={BLKY + 4} textAnchor="start">
        {'blocked — needs you'}
      </text>
    </>
  );

  // ticket node
  let tcls = '', ttip = '';
  if (!integrations.tracker) { tcls = 'na'; ttip = 'tracker integration off'; }
  else if (isDone || cur >= 9) {
    if (lane.ticket_url) { tcls = 'done'; }
    else { tcls = 'done evwarn'; ttip = 'no ticket_url recorded yet'; }
  }
  const tktNode = <Node name={TKT[0]} icon={TKT[1]} x={TKT[2]} y={TKT[3]} cls={tcls} tip={ttip} />;

  return <>{nodes}{badges}{fixNode}{blkNode}{tktNode}</>;
}
