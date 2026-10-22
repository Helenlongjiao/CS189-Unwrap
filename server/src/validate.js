export const TRIGGER_TYPES = ['rage_click', 'dead_click', 'error', 'form_abandon', 'manual', 'lost'];
export const INTERACTION_TYPES = ['page_view', 'click', 'focus', 'submit', 'error'];
export const MAX_EVENTS_PER_BATCH = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ValidationError extends Error {
  status = 400;
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function str(value, max = 2000) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

export function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function timestamp(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return new Date();
  // Clamp wildly wrong client clocks to the server's clock.
  const now = Date.now();
  return new Date(Math.abs(now - ms) > 24 * 3600_000 ? now : ms);
}

/** `sendBeacon` posts `text/plain`, so the body may arrive as a raw string. */
export function parseBody(body) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      throw new ValidationError('body must be JSON');
    }
  }
  return obj(body);
}

export function requireSession(payload) {
  if (typeof payload.siteKey !== 'string' || !payload.siteKey) throw new ValidationError('siteKey is required');
  if (!isUuid(payload.sessionId)) throw new ValidationError('sessionId must be a UUID');
}
