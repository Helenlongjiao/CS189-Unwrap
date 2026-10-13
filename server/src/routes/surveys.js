import { Router } from 'express';
import { HttpError } from '../sites.js';

/**
 * Returns every active template for a site: its own templates plus the shared defaults, with a
 * site template overriding a default that has the same slug. The SDK fetches these once at
 * startup, so a survey can open the instant friction is detected without a network round trip.
 */
export function surveysRouter({ pool, resolveSite }) {
  const router = Router();

  router.get('/surveys', async (req, res, next) => {
    try {
      const siteKey = req.query.siteKey;
      if (typeof siteKey !== 'string' || !siteKey) throw new HttpError(400, 'siteKey is required');
      const site = await resolveSite(siteKey, req.get('origin'));
      const { rows } = await pool.query(
        `select distinct on (slug) id, slug, trigger_type, title, questions
         from survey_templates
         where active and (site_id = $1 or site_id is null)
         order by slug, site_id nulls last`,
        [site.id],
      );
      res.set('Cache-Control', 'public, max-age=60');
      res.json({
        templates: rows.map((r) => ({ id: r.id, slug: r.slug, triggerType: r.trigger_type, title: r.title, questions: r.questions })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
