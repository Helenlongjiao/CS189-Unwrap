import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/pulse_test';

/** Fresh schema + running app on a random port. */
export async function startTestServer() {
  const pool = createPool(TEST_DATABASE_URL);
  await pool.query('drop schema public cascade; create schema public;');
  await migrate(pool, { log: () => {} });
  const server = createApp({ pool }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${server.address().port}`;
  return {
    pool,
    base,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}

export function postEvents(base, body, { beacon = false, origin } = {}) {
  return fetch(`${base}/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': beacon ? 'text/plain' : 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  });
}

export function batch(overrides = {}) {
  const now = Date.now();
  return {
    siteKey: 'pk_dev_local',
    sessionId: randomUUID(),
    meta: { userAgent: 'test-agent', language: 'en-US', viewport: { width: 1280, height: 800 } },
    events: [
      { kind: 'interaction', type: 'page_view', at: now - 3000, url: 'http://site.test/checkout', data: { title: 'Checkout' } },
      { kind: 'interaction', type: 'click', at: now - 2000, url: 'http://site.test/checkout', data: { selector: '#pay', label: 'Pay now' } },
      {
        kind: 'friction',
        id: randomUUID(),
        type: 'rage_click',
        at: now - 1000,
        url: 'http://site.test/checkout',
        title: 'Checkout',
        element: { selector: '#pay', tag: 'button', label: 'Pay now' },
        context: { clickCount: 4 },
        trail: [{ type: 'click', at: now - 2000, url: 'http://site.test/checkout', data: { label: 'Pay now' } }],
        eligible: true,
        recordOnly: false,
      },
    ],
    ...overrides,
  };
}
