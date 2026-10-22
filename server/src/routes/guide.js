import { Router } from 'express';
import { bestMatches } from '../guideMatch.js';
import { ValidationError, parseBody, requireSession, str } from '../validate.js';

/** Matches a visitor's own words to pages crawled from that site's origin. */
export function guideRouter({ pool, resolveSite }) {
  const router = Router();

  router.post('/guide', async (req, res, next) => {
    try {
      const payload = parseBody(req.body);
      requireSession(payload);
      const query = str(payload.query, 200);
      const url = str(payload.url, 2000);
      if (!query) throw new ValidationError('query is required');
      if (!url) throw new ValidationError('url is required');
      let origin;
      try {
        origin = new URL(url).origin;
      } catch {
        throw new ValidationError('url must be absolute');
      }
      await resolveSite(payload.siteKey, req.get('origin'));
      const { rows } = await pool.query(
        `select url, title, headings, links, controls, excerpt from page_index where origin = $1`,
        [origin],
      );
      res.json({ matches: bestMatches(query, rows, url, 3) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
