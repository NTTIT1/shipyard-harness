import { Router } from 'express';
import { AUTH_ENABLED } from '../services/auth.js';
import { aggregate, readAllUsage, readSettings, writeSettings, setFeatureHours, readPlan } from '../services/usage.js';
import { readModelDefaults, readAllLaneDefaults, readFeatureModels } from '../services/providers.js';
import { harnessConfig } from '../services/config.js';
import { lanesPayload } from '../services/state.js';

// Costs screen (admins only — it shows salaries). Data: run/lane*/usage.jsonl + config/costs.json.
export function costsRouter({ authEnabled = AUTH_ENABLED } = {}) {
  const router = Router();
  const admin = (req, res, next) => {
    if (authEnabled === false && !req.user) return next();
    if (req.user?.role !== 'SYS_ADMIN') return res.status(403).json({ ok: false, error: 'Chỉ quản trị viên xem được chi phí' });
    next();
  };
  const fail = (res, e) => res.status(e.status || 500).json({ ok: false, error: e.message });

  router.get('/api/costs', admin, async (req, res) => {
    const month = req.query.month ? String(req.query.month) : undefined;
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ ok: false, error: 'tháng phải dạng YYYY-MM' });
    try {
      const settings = readSettings();
      const cfg = harnessConfig();
      const lp = await lanesPayload();
      res.json({
        ...aggregate(readAllUsage(), settings, { month, defaultProjectId: cfg.platform_project_id || '' }),
        project_progress: lp.project_progress,
        active_lanes_count: lp.active_lanes_count,
        lanes_state: lp.lanes,
        settings,
        plan: readPlan(),
        global_defaults: readModelDefaults(),
        lane_defaults: readAllLaneDefaults(),
        feature_models: readFeatureModels(),
      });
    } catch (e) { fail(res, e); }
  });
  router.put('/api/costs/settings', admin, (req, res) => {
    try { res.json(writeSettings(req.body || {})); } catch (e) { fail(res, e); }
  });
  router.put('/api/costs/feature-hours', admin, (req, res) => {
    try { res.json(setFeatureHours((req.body || {}).key, (req.body || {}).hours)); } catch (e) { fail(res, e); }
  });
  return router;
}
