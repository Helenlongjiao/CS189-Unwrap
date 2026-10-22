import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { batch, postEvents, startTestServer } from './helpers.js';

describe('survey rules and responses', () => {
  let t;
  let templates;

  before(async () => {
    t = await startTestServer();
    ({ templates } = await (await fetch(`${t.base}/v1/surveys?siteKey=pk_dev_local`)).json());
  });
  after(() => t.close());

  const bySlug = (slug) => templates.find((x) => x.slug === slug);

  const postResponse = (body) =>
    fetch(`${t.base}/v1/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ siteKey: 'pk_dev_local', sessionId: randomUUID(), status: 'submitted', ...body }),
    });

  it('serves rule fields and specific variants alongside the defaults', () => {
    const disabled = bySlug('dead-click-disabled');
    assert.equal(disabled.priority, 10);
    assert.deepEqual(disabled.conditions, { context: { reason: ['disabled'] } });
    assert.deepEqual(bySlug('error-network').conditions, { context: { kind: ['network'] } });
    assert.deepEqual(bySlug('dead-click-default').conditions, {});
    assert.deepEqual(bySlug('manual-default').questions[1].showIf, { question: 'kind', in: ['lost'] });
    for (const intent of ['lost', 'issue', 'question']) {
      assert.deepEqual(bySlug(`manual-${intent}`).conditions, { context: { intent: [intent] } });
    }
  });

  it('stores a submitted response linked to its friction event', async () => {
    const events = batch();
    await postEvents(t.base, events);
    const friction = events.events.find((e) => e.kind === 'friction');
    const tpl = bySlug('rage-click-default');

    const res = await postResponse({
      sessionId: events.sessionId,
      triggerId: friction.id,
      templateId: tpl.id,
      triggerType: 'rage_click',
      answers: { goal: 'submit', outcome: 'nothing', details: 'The pay button does nothing', unknown_question: 'dropped' },
      url: 'http://site.test/checkout',
    });
    assert.equal(res.status, 201);

    const { rows } = await t.pool.query(
      `select r.answers, r.status, r.auto_opened, f.type as friction_type, f.element->>'label' as label
       from survey_responses r join friction_events f on f.id = r.trigger_id
       where r.id = $1`,
      [(await res.json()).id],
    );
    assert.deepEqual(rows[0].answers, { goal: 'submit', outcome: 'nothing', details: 'The pay button does nothing' });
    assert.equal(rows[0].status, 'submitted');
    assert.equal(rows[0].auto_opened, true);
    assert.equal(rows[0].friction_type, 'rage_click');
    assert.equal(rows[0].label, 'Pay now');
  });

  it('accepts a response that arrives before its friction event and stores dismissals without answers', async () => {
    const tpl = bySlug('error-default');
    const res = await postResponse({
      triggerId: randomUUID(),
      templateId: tpl.id,
      triggerType: 'error',
      status: 'dismissed',
      answers: { blocked: 'blocked' },
    });
    assert.equal(res.status, 201);
    const { rows } = await t.pool.query('select answers, status from survey_responses where id = $1', [(await res.json()).id]);
    assert.deepEqual(rows[0], { answers: {}, status: 'dismissed' });
  });

  it('rejects invalid options, unknown templates and bad statuses', async () => {
    const tpl = bySlug('rage-click-default');
    const base = { triggerId: randomUUID(), templateId: tpl.id, triggerType: 'rage_click' };
    assert.equal((await postResponse({ ...base, answers: { goal: 'not-an-option' } })).status, 400);
    assert.equal((await postResponse({ ...base, templateId: randomUUID() })).status, 400);
    assert.equal((await postResponse({ ...base, status: 'maybe' })).status, 400);
    assert.equal((await postResponse({ ...base, siteKey: 'nope' })).status, 401);
  });
});
