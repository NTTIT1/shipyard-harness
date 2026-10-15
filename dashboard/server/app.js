import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import agentuiRoutes from './routes/agentui.js';
import lanesRoutes from './routes/lanes.js';
import proofRoutes from './routes/proof.js';
import credsRoutes from './routes/creds.js';
import authRoutes from './routes/auth.js';
import { platformRouter } from './routes/platform.js';
import { requireAuth } from './services/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(authOpts) {
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
  app.use(platformRouter());
  // agentui first: its POST /api/lane/:n/assign would otherwise hit lanes' /:action.
  app.use(agentuiRoutes);
  app.use(lanesRoutes);
  app.use(proofRoutes);
  app.use(credsRoutes);
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  return app;
}
