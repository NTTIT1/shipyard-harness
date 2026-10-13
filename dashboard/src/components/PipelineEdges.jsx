import React from 'react';
import { NODES, MAINY, BUS, BLKY, TKT } from '../lib/constants.js';
import { phaseIdx } from '../lib/constants.js';

export default function PipelineEdges({ lane }) {
  const cur = phaseIdx(lane.stage);
  const isDone = lane.stage === 'done';
  const els = [];

  // main forward edges
  for (let i = 0; i < NODES.length - 1; i++) {
    const x1 = NODES[i][2] + 16, x2 = NODES[i + 1][2] - 16;
    const done = isDone || i < cur;
    els.push(<line key={`e${i}`} x1={x1} y1={MAINY} x2={x2} y2={MAINY}
      stroke={done ? '#2ea27c' : '#39424e'} strokeWidth="1.6"
      markerEnd={`url(#a${done ? 'g' : 'd'})`} />);
  }

  // edge labels
  els.push(<text key="lgo" className="e-label" x="850" y={MAINY - 8} textAnchor="middle">GO</text>);
  els.push(<text key="lmg" className="e-label" x="1066" y={MAINY - 8} textAnchor="middle">human merges</text>);

  // fix loop bus
  els.push(<path key="bus" d={`M1227,${BUS} H385`} fill="none" stroke="#9aa5b4"
    strokeWidth="1.3" strokeDasharray="5 3" opacity=".6" markerEnd="url(#ac)" />);

  // vertical drops to bus (e2e, review, QC, sr gate, watch PR, dev QC)
  for (const x of [474, 581, 689, 797, 1012, 1227]) {
    els.push(<path key={`vd${x}`} d={`M${x},${MAINY + 14} V${BUS - 4}`} fill="none"
      stroke="#f87171" strokeWidth="1.3" strokeDasharray="4 3" opacity=".6" markerEnd="url(#acr)" />);
  }
  els.push(<text key="lfup" className="e-label" x="1219" y={BUS - 10} textAnchor="end"
    style={{ fill: '#f87171', opacity: .8 }}>{'dev-QC FAIL → follow-up PR'}</text>);

  // gates -> fix drop
  els.push(<path key="gfix" d={`M366,${MAINY + 14} V${BUS - 21}`} fill="none"
    stroke="#f87171" strokeWidth="1.3" strokeDasharray="4 3" opacity=".6" markerEnd="url(#acr)" />);

  // fix return arc
  els.push(<path key="ret" d={`M350,${BUS} H323 V96 H358 V84`} fill="none"
    stroke="#60a5fa" strokeWidth="1.7" strokeDasharray="5 3" opacity=".95" markerEnd="url(#ab)" />);
  els.push(<text key="lret" className="e-label" x="315" y="140" textAnchor="end"
    style={{ fill: '#60a5fa' }}>{'↻ re-enter stage 2'}</text>);

  // blocked stub (gate -> "blocked — needs you"; an escalation, not an automatic cap)
  els.push(<circle key="blkc" cx="797" cy={BLKY} r="2" fill="#f87171" opacity=".7" />);
  els.push(<path key="blkp" d={`M797,${BLKY} H826`} fill="none"
    stroke="#f87171" strokeWidth="1.3" strokeDasharray="4 3" opacity=".7" markerEnd="url(#acr)" />);

  // watch PR -> gates: PR base conflict, synced in place on the branch
  els.push(<path key="cflct" d={`M1012,${MAINY - 14} V24 H366 V${MAINY - 18}`} fill="none"
    stroke="#f87171" strokeWidth="1.3" strokeDasharray="4 3" opacity=".55" markerEnd="url(#acr)" />);
  els.push(<text key="lcflct" className="e-label" x="689" y="18" textAnchor="middle">
    {'base conflict → sync development into the branch'}</text>);

  // ticket fork (right after the PR opens)
  els.push(<path key="tkt" d={`M914,${MAINY - 13} V${TKT[3]} H${TKT[2] - 17}`} fill="none"
    stroke="#9aa5b4" strokeWidth="1.3" strokeDasharray="5 3" opacity=".6" markerEnd="url(#ac)" />);

  return <>{els}</>;
}
