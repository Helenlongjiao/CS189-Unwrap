import { Router } from 'express';
import { bestMatches } from '../guideMatch.js';
import { ValidationError, parseBody, requireSession, str } from '../validate.js';

/**
 * The question's embedding for meaning search, or null to use keyword search only: no API key, the site's pages
 * have no embeddings (so the question isn't sent to OpenAI for nothing), or OpenAI failed or took too long.
 */
async function embedQuestion(embedder, query, rows) {
  if (!embedder || !rows.some((row) => Array.isArray(row.embedding) && row.embedding.length)) return null;
  try {
    const [embedding] = await embedder.embed([query]);
    return embedding ?? null;
  } catch (err) {
    console.warn(`guide: meaning search skipped, using keywords only: ${err.message}`);
    return null;
  }
}

/** Matches a visitor's own words to pages crawled from that site's origin. */
export function guideRouter({ pool, resolveSite, embedder = null }) {
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
        `select url, title, headings, links, controls, excerpt, embedding from page_index where origin = $1`,
        [origin],
      );
      const queryEmbedding = await embedQuestion(embedder, query, rows);
      res.json({ matches: bestMatches(query, rows, url, 3, { queryEmbedding }) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
