const CACHE_MS = 60_000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Looks up sites by public key (cached briefly) and enforces each site's allowed origins. */
export function createSiteResolver(pool) {
  const cache = new Map();

  return async function resolveSite(siteKey, origin) {
    let entry = cache.get(siteKey);
    if (!entry || Date.now() - entry.at > CACHE_MS) {
      const { rows } = await pool.query('select id, allowed_origins from sites where public_key = $1', [siteKey]);
      entry = { at: Date.now(), site: rows[0] ?? null };
      cache.set(siteKey, entry);
    }
    const { site } = entry;
    if (!site) throw new HttpError(401, 'unknown site key');
    if (origin && site.allowed_origins.length && !site.allowed_origins.includes(origin)) {
      throw new HttpError(403, 'origin not allowed for this site');
    }
    return site;
  };
}

export async function upsertSession(db, siteId, sessionId, meta = {}, landingUrl = null) {
  const { rowCount } = await db.query(
    `insert into sessions (id, site_id, user_agent, language, viewport, referrer, landing_url, client)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do update set last_seen_at = now(), client = coalesce(excluded.client, sessions.client)
     where sessions.site_id = excluded.site_id
     returning id`,
    [
      sessionId,
      siteId,
      typeof meta.userAgent === 'string' ? meta.userAgent.slice(0, 500) : null,
      typeof meta.language === 'string' ? meta.language.slice(0, 35) : null,
      meta.viewport && typeof meta.viewport === 'object' ? meta.viewport : null,
      typeof meta.referrer === 'string' ? meta.referrer.slice(0, 2000) : null,
      landingUrl,
      meta.client && typeof meta.client === 'object' && !Array.isArray(meta.client) ? meta.client : null,
    ],
  );
  if (!rowCount) throw new HttpError(409, 'session belongs to a different site');
}
