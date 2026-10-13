import { Router } from 'express';
import { upsertSession } from '../sites.js';
import { TRIGGER_TYPES, ValidationError, isUuid, obj, parseBody, requireSession, str } from '../validate.js';

const MAX_TEXT = 2000;

/** Checks answers against the template's questions so only known question ids and options are stored. */
export function cleanAnswers(questions, raw) {
  const answers = {};
  for (const q of questions) {
    const value = raw[q.id];
    if (value === undefined || value === null || value === '') continue;
    if (q.type === 'choice') {
      if (!q.options?.some((o) => o.value === value)) throw new ValidationError(`invalid option for "${q.id}"`);
      answers[q.id] = value;
    } else if (q.type === 'text') {
      if (typeof value !== 'string') throw new ValidationError(`"${q.id}" must be text`);
      answers[q.id] = value.slice(0, MAX_TEXT);
    }
  }
  return answers;
}

export function responsesRouter({ pool, resolveSite }) {
  const router = Router();

  router.post('/responses', async (req, res, next) => {
    try {
      const payload = parseBody(req.body);
      requireSession(payload);
      if (!TRIGGER_TYPES.includes(payload.triggerType)) throw new ValidationError('invalid triggerType');
      if (!['submitted', 'dismissed'].includes(payload.status)) throw new ValidationError('status must be submitted or dismissed');
      if (payload.triggerId != null && !isUuid(payload.triggerId)) throw new ValidationError('triggerId must be a UUID');
      const generated = payload.generatedSurveyId != null;
      if (generated ? !isUuid(payload.generatedSurveyId) : !isUuid(payload.templateId)) {
        throw new ValidationError('templateId or generatedSurveyId must be a UUID');
      }
      const site = await resolveSite(payload.siteKey, req.get('origin'));

      const { rows } = generated
        ? await pool.query('select questions from generated_surveys where id = $1 and site_id = $2', [payload.generatedSurveyId, site.id])
        : await pool.query('select questions from survey_templates where id = $1 and (site_id = $2 or site_id is null)', [
            payload.templateId,
            site.id,
          ]);
      if (!rows.length) throw new ValidationError(generated ? 'unknown generated survey' : 'unknown template');
      const answers = payload.status === 'submitted' ? cleanAnswers(rows[0].questions, obj(payload.answers)) : {};

      await upsertSession(pool, site.id, payload.sessionId);
      const result = await pool.query(
        `insert into survey_responses
           (site_id, session_id, trigger_id, template_id, generated_survey_id, trigger_type, status, auto_opened, answers, page_url)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          site.id,
          payload.sessionId,
          payload.triggerId ?? null,
          generated ? null : payload.templateId,
          generated ? payload.generatedSurveyId : null,
          payload.triggerType,
          payload.status,
          payload.autoOpened !== false,
          answers,
          str(payload.url),
        ],
      );
      res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
