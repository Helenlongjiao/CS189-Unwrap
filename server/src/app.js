import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventsRouter } from './routes/events.js';
import { responsesRouter } from './routes/responses.js';
import { surveysRouter } from './routes/surveys.js';
import { createSiteResolver } from './sites.js';

const SDK_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sdk/dist');

export function createApp({ pool, rateLimitPerMinute = 600 }) {
  const app = express();
  const resolveSite = createSiteResolver(pool);
  const deps = { pool, resolveSite };

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: 'database unavailable' });
    }
  });

  // The one-line embed: <script src="http://localhost:4000/sdk.js" data-site-key="pk_dev_local" async></script>
  app.get('/sdk.js', (_req, res) => {
    const file = path.join(SDK_DIST, 'pulse.min.js');
    if (!existsSync(file)) return res.status(503).type('text/plain').send('SDK not built yet: run `npm run build`');
    res.set({ 'Cache-Control': 'public, max-age=300', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    res.type('application/javascript').sendFile(file);
  });

  const v1 = express.Router();
  v1.use(cors({ origin: true, methods: ['GET', 'POST'], maxAge: 600 }));
  v1.use(rateLimit({ windowMs: 60_000, limit: rateLimitPerMinute, standardHeaders: 'draft-7', legacyHeaders: false }));
  v1.use(express.text({ type: 'text/plain', limit: '256kb' }));
  v1.use(express.json({ limit: '256kb' }));
  v1.use(eventsRouter(deps));
  v1.use(surveysRouter(deps));
  v1.use(responsesRouter(deps));
  app.use('/v1', v1);

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
  });

  return app;
}
