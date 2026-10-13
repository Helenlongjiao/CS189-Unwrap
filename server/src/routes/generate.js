import { Router } from 'express';
import { HttpError, upsertSession } from '../sites.js';
import { TRIGGER_TYPES, ValidationError, isUuid, obj, parseBody, requireSession } from '../validate.js';

const MAX_PER_SESSION = 6;

/** Asks the language model for a survey tailored to one friction moment, and stores what it wrote. */
export function generateRouter({ pool, resolveSite, surveyGenerator }) {
  const router = Router();

  router.post('/surveys/generate', async (req, res, next) => {
    try {
      if (!surveyGenerator) throw new HttpError(503, 'AI surveys are not configured');
      const payload = parseBody(req.body);
      requireSession(payload);
      const trigger = obj(payload.trigger);
      if (!TRIGGER_TYPES.includes(trigger.type)) throw new ValidationError('invalid trigger type');
      if (!isUuid(trigger.id)) throw new ValidationError('trigger id must be a UUID');
      const client = obj(payload.client);
      const site = await resolveSite(payload.siteKey, req.get('origin'));

      await upsertSession(pool, site.id, payload.sessionId, { client });
      const { rows: used } = await pool.query('select count(*)::int as n from generated_surveys where session_id = $1', [payload.sessionId]);
      if (used[0].n >= MAX_PER_SESSION) throw new HttpError(429, 'AI survey limit reached for this session');

      let survey;
      try {
        survey = await surveyGenerator.generate(
          { ...trigger, trail: Array.isArray(trigger.trail) ? trigger.trail.slice(-50) : [] },
          client,
        );
      } catch (err) {
        console.warn('[generate] falling back:', err.message);
        throw new HttpError(502, 'could not generate a survey');
      }

      const { rows } = await pool.query(
        `insert into generated_surveys
           (site_id, session_id, trigger_id, trigger_type, model, headline, message, questions, context, latency_ms)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          site.id,
          payload.sessionId,
          trigger.id,
          trigger.type,
          survey.model,
          survey.headline,
          survey.message,
          JSON.stringify(survey.questions),
          survey.context,
          survey.latencyMs,
        ],
      );
      res.status(201).json({ id: rows[0].id, headline: survey.headline, message: survey.message, questions: survey.questions });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
