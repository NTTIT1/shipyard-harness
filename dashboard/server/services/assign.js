import { STEPS, validateModels, usesGateway, readAllLaneDefaults } from './providers.js';
import { normalizeEfforts } from './usage.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Free = nothing in flight (mirrors lane-assign.sh: idle/down/no state).
const FREE_STATUS = new Set(['idle', 'down', '', undefined]);
const SPEC_RE = /^specs\/[A-Za-z0-9._-]+$/;

export function buildPrompt({ requirement, spec_dir }) {
  return `/ship-feature ${spec_dir || requirement}`;
}

const GATE_STEPS = ['PM', 'BA', 'ARCH', 'DESIGN', 'DEV', 'TEST'];

// Per-feature approval choices ({STEP: REQUIRED|AUTO}); '' = follow the project's gate policy.
export function normalizeGates(gates) {
  const out = {};
  for (const [k, v] of Object.entries(gates || {})) {
    const step = String(k).toUpperCase();
    const mode = String(v || '').toUpperCase();
    if (!GATE_STEPS.includes(step)) throw new HttpError(400, `bước duyệt không hợp lệ: ${k}`);
    if (!mode) continue;
    if (mode !== 'REQUIRED' && mode !== 'AUTO') throw new HttpError(400, `${step}: chế độ duyệt phải là REQUIRED hoặc AUTO`);
    out[step] = mode;
  }
  return out;
}

export async function assignLane(n, body, d) {
  const requirement = String(body.requirement || '').trim();
  const spec_dir = String(body.spec_dir || '').trim();
  if (!requirement && !spec_dir) throw new HttpError(400, 'cần nhập yêu cầu hoặc chọn spec');
  if (spec_dir && !SPEC_RE.test(spec_dir)) throw new HttpError(400, 'spec_dir không hợp lệ');
  const laneDef = readAllLaneDefaults()[String(n)] || {};
  const models = {};
  for (const s of STEPS) models[s.id] = (body.models || {})[s.id] || laneDef[s.id] || 'claude:claude-opus-5-5';
  const errs = validateModels(models);
  if (errs.length) throw new HttpError(400, errs.join('; '));
  const impl = parseInt(body.impl_agents ?? laneDef.impl_agents, 10);
  const implAgents = impl > 0 && impl <= 9 ? impl : 1;

  const gates = normalizeGates(body.gates);
  let effort;
  try {
    const rawEffort = body.effort !== undefined ? body.effort : (laneDef.effort || {});
    effort = normalizeEfforts(rawEffort, STEPS.map(s => s.id));
  } catch (e) { throw new HttpError(400, e.message); }

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
  d.state(['set-json', 'gate_overrides', JSON.stringify(gates)]);
  d.state(['set-json', 'effort', JSON.stringify(effort)]);
  if (!lane.api_up) d.laneUp(n);
  d.startSession(n, { model: models.main.slice('claude:'.length), effort: effort.main, prompt: buildPrompt({ requirement, spec_dir }) });
  return { ok: true };
}
