import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import agentuiRoutes from './routes/agentui.js';
import lanesRoutes from './routes/lanes.js';
import proofRoutes from './routes/proof.js';
import credsRoutes from './routes/creds.js';
import authRoutes from './routes/auth.js';
import { platformRouter } from './routes/platform.js';
import { costsRouter } from './routes/costs.js';
import { scaffoldRouter } from './routes/scaffold.js';
import { teamRouter } from './routes/team.js';
import { SKILL_CATALOG } from './services/scaffold/team.js';
import { requireAuth } from './services/auth.js';
import { accessGuard } from './services/access.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(authOpts, accessOpts) {
  const app = express();
  app.use(express.json({ limit: '5mb' })); // reviewers' edited documents can be large
  app.use((req, res, next) => {
    // Same origin only: the lane apps on localhost:300N (AI-written code) are "same-site" for
    // SameSite cookies, so a host-wide allowlist would let them act with the reviewer's session.
    const origin = req.headers.origin;
    if (origin && origin !== `${req.protocol}://${req.headers.host}`) {
      return res.status(403).end('Forbidden');
    }
    next();
  });
  // Login (via Shipyard Platform) gates every data route; /auth/* and the SPA shell stay public.
  app.use(authRoutes);
  app.use(requireAuth(authOpts));
  // Project roles (from the platform) decide every lane-scoped and install-wide action — src/lib/permissions.js.
  app.use(accessGuard({ ...(authOpts && 'enabled' in authOpts ? { authEnabled: authOpts.enabled } : {}), ...accessOpts }));
  app.use(platformRouter());
  app.use(costsRouter());
  app.use(scaffoldRouter());
  app.use(teamRouter({ skillCatalog: SKILL_CATALOG }));
  // agentui first: its POST /api/lane/:n/assign would otherwise hit lanes' /:action.
  app.use(agentuiRoutes);
  app.use(lanesRoutes);
  app.use(proofRoutes);
  app.use(credsRoutes);
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  // A missing build file (an old tab asking for a chunk a rebuild removed) is a 404, never the app page —
  // the page then reloads itself instead of failing on HTML served as JavaScript.
  app.get('/assets/*', (_req, res) => res.status(404).end());
  app.get('*', (_req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
  return app;
}
