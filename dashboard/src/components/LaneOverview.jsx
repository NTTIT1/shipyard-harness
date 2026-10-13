import React from 'react';
import Badge from './ui/Badge.jsx';
import PipelineMap from './PipelineMap.jsx';
import StepsTable from './StepsTable.jsx';
import { fmtAge, fmtDur } from '../lib/format.js';

export default function LaneOverview({ lane, config, archived }) {
  const gd = (lane.gate_decision || '').toUpperCase();
  const [age] = fmtAge(lane.heartbeat_age_sec);
  return (
    <div className="ov">
      <div className="ov-chips">
        <Badge tone={lane.api_up ? 'ok' : 'neutral'} dot>api</Badge>
        <Badge tone={lane.fe_up ? 'ok' : 'neutral'} dot>fe</Badge>
        <Badge tone={gd === 'GO' ? 'ok' : gd === 'NO-GO' ? 'danger' : 'neutral'}>gate {gd || '—'}</Badge>
        <Badge>CI {lane.ci_status || '—'}</Badge>
        {!archived && <Badge tone={lane.liveness === 'dead' ? 'danger' : 'neutral'}>♥ {age}</Badge>}
        {!archived && lane.stage_age_sec != null && <Badge>{lane.stage} · {fmtDur(lane.stage_age_sec)}</Badge>}
      </div>
      {!archived && lane.needs_action && <div className="ov-callout warn">Cần bạn: {lane.needs_action}</div>}
      {lane.notes && <div className="ov-callout">{lane.notes}</div>}
      <section className="ov-section"><h2>Pipeline</h2><PipelineMap lane={lane} config={config} archived={archived} /></section>
      <section className="ov-section"><h2>Bước con</h2><StepsTable steps={lane.steps} /></section>
    </div>
  );
}
