import { Router } from 'express';
import { lanesPayload } from '../services/state.js';
import { runAction, laneProjects } from '../services/actions.js';
import { brief } from '../services/sessions.js';
import { aggregate, readAllUsage, readSettings } from '../services/usage.js';

const router = Router();

router.get('/api/lanes', async (_req, res) => {
  try {
    const payload = await lanesPayload();
    const settings = readSettings();
    const defaultProjectId = payload.config?.platform_project_id || '';
    const costAgg = aggregate(readAllUsage(), settings, { defaultProjectId });
    const laneCostMap = Object.fromEntries((costAgg.byLane || []).map(l => [l.lane, l]));

    for (const l of payload.lanes) {
      Object.assign(l, brief(l.lane));
      // No state heartbeat for a while, but its session is mid-turn or waiting on a background step:
      // working, not lost (state heartbeats are only written between stages).
      if (l.liveness === 'dead' && l.session_active) l.liveness = 'active';
      const lc = laneCostMap[l.lane];
      l.cost_usd = lc ? lc.usd : 0;
      l.cost_vnd = lc ? lc.vnd : 0;
      l.cost_quota_pct = lc ? lc.quotaPct : 0;
    }

    payload.project_costs = {
      month: costAgg.month,
      totals: costAgg.totals,
      quotas: costAgg.quotas,
      byLane: costAgg.byLane,
      byProject: costAgg.byProject,
    };

    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/api/lane/:n(\\d)/:action', (req, res) => {
  const n = parseInt(req.params.n, 10);
  const { action } = req.params;
  try {
    const result = runAction(n, action, req.body || {});
    res.json(result !== null && typeof result === 'object' ? result : { ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Shipyard-generated projects a lane can be added for (multi-project lanes).
router.get('/api/lanes/projects', (_req, res) => {
  try { res.json(laneProjects()); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/lanes/add', (req, res) => {
  try {
    const result = runAction(null, 'add', req.body || {});
    res.json(result !== null && typeof result === 'object' ? result : { ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
