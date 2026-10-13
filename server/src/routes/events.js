import { Router } from 'express';
import { upsertSession } from '../sites.js';
import {
  INTERACTION_TYPES,
  MAX_EVENTS_PER_BATCH,
  TRIGGER_TYPES,
  ValidationError,
  isUuid,
  obj,
  parseBody,
  requireSession,
  str,
  timestamp,
} from '../validate.js';

/** Ingests SDK batches: the user's interaction trail plus detected friction events. */
export function eventsRouter({ pool, resolveSite }) {
  const router = Router();

  router.post('/events', async (req, res, next) => {
    try {
      const payload = parseBody(req.body);
      requireSession(payload);
      const events = Array.isArray(payload.events) ? payload.events : [];
      if (events.length > MAX_EVENTS_PER_BATCH) throw new ValidationError(`at most ${MAX_EVENTS_PER_BATCH} events per batch`);
      const site = await resolveSite(payload.siteKey, req.get('origin'));

      const interactions = [];
      const frictions = [];
      for (const e of events) {
        const ev = obj(e);
        if (ev.kind === 'interaction' && INTERACTION_TYPES.includes(ev.type)) interactions.push(ev);
        else if (ev.kind === 'friction' && TRIGGER_TYPES.includes(ev.type) && isUuid(ev.id)) frictions.push(ev);
      }

      const client = await pool.connect();
      try {
        await client.query('begin');
        const landing = interactions.find((i) => i.type === 'page_view');
        await upsertSession(client, site.id, payload.sessionId, obj(payload.meta), landing ? str(landing.url) : null);

        if (interactions.length) {
          await client.query(
            `insert into interaction_events (session_id, site_id, type, url, occurred_at, data)
             select $1, $2, x.type, x.url, x.occurred_at, x.data
             from jsonb_to_recordset($3::jsonb) as x(type text, url text, occurred_at timestamptz, data jsonb)`,
            [
              payload.sessionId,
              site.id,
              JSON.stringify(
                interactions.map((i) => ({ type: i.type, url: str(i.url) ?? '', occurred_at: timestamp(i.at), data: obj(i.data) })),
              ),
            ],
          );
        }

        for (const f of frictions) {
          await client.query(
            `insert into friction_events
               (id, session_id, site_id, type, url, page_title, element, context, trail, eligible, record_only, occurred_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             on conflict (id) do nothing`,
            [
              f.id,
              payload.sessionId,
              site.id,
              f.type,
              str(f.url) ?? '',
              str(f.title, 300),
              f.element ? obj(f.element) : null,
              obj(f.context),
              JSON.stringify(Array.isArray(f.trail) ? f.trail.slice(-100) : []),
              f.eligible === true,
              f.recordOnly === true,
              timestamp(f.at),
            ],
          );
        }
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }

      res.status(202).json({ accepted: { interactions: interactions.length, frictions: frictions.length } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
