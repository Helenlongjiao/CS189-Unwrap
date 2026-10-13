import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { batch, postEvents, startTestServer } from './helpers.js';

describe('ingestion and survey templates', () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  it('stores the session, the interaction trail and friction events', async () => {
    const body = batch();
    const res = await postEvents(t.base, body);
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: { interactions: 2, frictions: 1 } });

    const session = await t.pool.query('select * from sessions where id = $1', [body.sessionId]);
    assert.equal(session.rows[0].user_agent, 'test-agent');
    assert.equal(session.rows[0].landing_url, 'http://site.test/checkout');

    const trail = await t.pool.query('select type, data from interaction_events where session_id = $1 order by occurred_at', [body.sessionId]);
    assert.deepEqual(trail.rows.map((r) => r.type), ['page_view', 'click']);

    const friction = await t.pool.query('select * from friction_events where session_id = $1', [body.sessionId]);
    assert.equal(friction.rows[0].type, 'rage_click');
    assert.equal(friction.rows[0].element.label, 'Pay now');
    assert.equal(friction.rows[0].trail.length, 1);
  });

  it('accepts sendBeacon-style text/plain bodies and ignores duplicate friction ids', async () => {
    const body = batch();
    assert.equal((await postEvents(t.base, body, { beacon: true })).status, 202);
    assert.equal((await postEvents(t.base, body, { beacon: true })).status, 202);
    const { rows } = await t.pool.query('select count(*)::int as n from friction_events where session_id = $1', [body.sessionId]);
    assert.equal(rows[0].n, 1);
  });

  it('rejects unknown site keys, bad session ids and oversized batches', async () => {
    assert.equal((await postEvents(t.base, batch({ siteKey: 'nope' }))).status, 401);
    assert.equal((await postEvents(t.base, batch({ sessionId: 'not-a-uuid' }))).status, 400);
    const big = batch({ events: Array.from({ length: 101 }, () => ({ kind: 'interaction', type: 'click', url: 'x' })) });
    assert.equal((await postEvents(t.base, big)).status, 400);
  });

  it('enforces a site’s allowed origins', async () => {
    await t.pool.query(`insert into sites (name, public_key, allowed_origins) values ('Locked', 'pk_locked', '{https://good.test}')`);
    assert.equal((await postEvents(t.base, batch({ siteKey: 'pk_locked' }), { origin: 'https://evil.test' })).status, 403);
    assert.equal((await postEvents(t.base, batch({ siteKey: 'pk_locked' }), { origin: 'https://good.test' })).status, 202);
  });

  it('serves one active template per trigger, letting site templates override defaults', async () => {
    const res = await fetch(`${t.base}/v1/surveys?siteKey=pk_dev_local`);
    assert.equal(res.status, 200);
    const { templates } = await res.json();
    assert.deepEqual(
      [...new Set(templates.map((x) => x.triggerType))].sort(),
      ['dead_click', 'error', 'form_abandon', 'manual', 'rage_click'],
    );
    for (const tpl of templates) assert.ok(tpl.questions.length >= 1 && tpl.questions.length <= 3);

    await t.pool.query(
      `insert into survey_templates (site_id, slug, trigger_type, title, questions)
       select id, 'rage-click-default', 'rage_click', 'Custom title', '[{"id":"q","type":"text","prompt":"Why?"}]'
       from sites where public_key = 'pk_dev_local'`,
    );
    const after = await (await fetch(`${t.base}/v1/surveys?siteKey=pk_dev_local`)).json();
    assert.equal(after.templates.find((x) => x.slug === 'rage-click-default').title, 'Custom title');
  });

  it('rejects templates with more than 3 questions', async () => {
    await assert.rejects(
      t.pool.query(
        `insert into survey_templates (slug, trigger_type, title, questions)
         values ('too-long', 'manual', 'x', '[{},{},{},{}]')`,
      ),
    );
  });
});
