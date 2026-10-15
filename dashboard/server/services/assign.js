import { STEPS, validateModels, usesGateway } from './providers.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Free = nothing in flight (mirrors lane-assign.sh: idle/down/no state).
const FREE_STATUS = new Set(['idle', 'down', '', undefined]);
const SPEC_RE = /^specs\/[A-Za-z0-9._-]+$/;

export function buildPrompt({ requirement, spec_dir }) {
  return `/ship-feature ${spec_dir || requirement}`;
}

export async function assignLane(n, body, d) {
  const requirement = String(body.requirement || '').trim();
  const spec_dir = String(body.spec_dir || '').trim();
  if (!requirement && !spec_dir) throw new HttpError(400, 'cần nhập yêu cầu hoặc chọn spec');
  if (spec_dir && !SPEC_RE.test(spec_dir)) throw new HttpError(400, 'spec_dir không hợp lệ');
  const models = {};
  for (const s of STEPS) models[s.id] = (body.models || {})[s.id] || 'claude:claude-opus-5-5';
  const errs = validateModels(models);
  if (errs.length) throw new HttpError(400, errs.join('; '));
  const impl = parseInt(body.impl_agents, 10);
  const implAgents = impl > 0 && impl <= 9 ? impl : 1;

  const lane = await d.lane(n);
  if (!lane) throw new HttpError(404, `lane ${n} không tồn tại`);
  if (d.isRunning(n) || !FREE_STATUS.has(lane.status))
    throw new HttpError(409, `lane ${n} đang bận (${lane.status} · ${lane.stage})`);

  if (usesGateway(models)) {
    const gw = await d.ensureGateway();
    if (!gw.ok) throw new HttpError(503, `không bật được gateway: ${gw.output}`);
  }

  const title = (requirement || spec_dir).split('\n')[0].slice(0, 80);
  d.state(['init']);
  d.state(['set', 'status=assigned', 'stage=assigned', `impl_agents=${implAgents}`, `feature_title=${title}`]);
  d.state(['set-json', 'models', JSON.stringify(models)]);
  if (d.assignedBy) d.state(['set', `assigned_by=${d.assignedBy}`]);
  if (!lane.api_up) d.laneUp(n);
  d.startSession(n, { model: models.main.slice('claude:'.length), prompt: buildPrompt({ requirement, spec_dir }) });
  return { ok: true };
}
