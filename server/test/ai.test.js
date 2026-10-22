import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { createSurveyGenerator, describeForModel, sanitizeSurvey } from '../src/ai.js';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { TEST_DATABASE_URL } from './helpers.js';

const trigger = () => ({
  id: randomUUID(),
  type: 'error',
  at: 2000,
  url: 'http://shop.test/seat-map',
  title: 'Not found',
  element: { selector: 'a.seat', tag: 'a', label: 'View seat map' },
  context: { kind: 'page', status: 404, stack: 'secret stack' },
  trail: [
    { type: 'page_view', at: 0, url: 'http://shop.test/flights', data: { title: 'Flights' } },
    { type: 'click', at: 1000, url: 'http://shop.test/flights', data: { tag: 'a', label: 'View seat map' } },
  ],
});

describe('survey generator', () => {
  it('describes the route for the model without stack traces', () => {
    const d = describeForModel(trigger(), { region: 'Los Angeles', partOfDay: 'evening' });
    assert.deepEqual(d.route, ['+0s opened /flights "Flights"', '+1s clicked a "View seat map" on /flights']);
    assert.equal(d.details.stack, undefined);
    assert.equal(d.visitor.partOfDay, 'evening');
  });

  it('forces model output into a safe survey shape', () => {
    const s = sanitizeSurvey({
      headline: 'x'.repeat(200),
      message: 'Sorry',
      questions: [
        { type: 'choice', prompt: 'Which?', required: true, options: ['A', 'A', 'B', 'C', 'D', 'E', 'F'] },
        { type: 'choice', prompt: 'Only one option becomes text', options: ['solo'] },
        { type: 'text', prompt: 'Tell us' },
        { type: 'text', prompt: 'Dropped: max 3' },
      ],
    });
    assert.equal(s.headline.length, 80);
    assert.equal(s.questions.length, 3);
    assert.deepEqual(s.questions[0].options.map((o) => o.value), ['a', 'a_2', 'b', 'c', 'd']);
    assert.equal(s.questions[1].type, 'text');
    assert.deepEqual(s.questions.map((q) => q.id), ['q1', 'q2', 'q3']);
  });

  it('is disabled without an API key', () => {
    assert.equal(createSurveyGenerator({}), null);
  });

  it('calls OpenAI with a strict JSON schema', async () => {
    let sent;
    const gen = createSurveyGenerator({
      apiKey: 'sk-test',
      fetchImpl: async (url, init) => {
        sent = JSON.parse(init.body);
        const content = JSON.stringify({ headline: 'Seat map missing', message: 'Sorry', questions: [{ type: 'text', prompt: 'What seat?', required: false, options: [] }] });
        return new Response(JSON.stringify({ model: 'gpt-test', choices: [{ message: { content } }] }));
      },
    });
    const out = await gen.generate(trigger(), {});
    assert.equal(sent.response_format.json_schema.strict, true);
    assert.equal(out.headline, 'Seat map missing');
    assert.equal(out.model, 'gpt-test');
  });
});

describe('POST /v1/surveys/generate', () => {
  let pool;
  let server;
  let base;

  before(async () => {
    pool = createPool(TEST_DATABASE_URL);
    await pool.query('drop schema public cascade; create schema public;');
    await migrate(pool, { log: () => {} });
    const surveyGenerator = {
      model: 'fake',
      generate: async () => ({
        headline: 'That seat map link is broken',
        message: 'Sorry!',
        questions: [{ id: 'q1', type: 'choice', prompt: 'Picking seats for this evening?', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }],
        model: 'fake',
        context: { route: [] },
        latencyMs: 5,
      }),
    };
    server = createApp({ pool, surveyGenerator }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://localhost:${server.address().port}`;
  });
  after(async () => {
    await new Promise((r) => server.close(r));
    await pool.end();
  });

  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });

  it('stores the generated survey and the visitor context, and accepts answers to it', async () => {
    const sessionId = randomUUID();
    const t = trigger();
    const res = await post('/v1/surveys/generate', { siteKey: 'pk_dev_local', sessionId, trigger: t, client: { region: 'Los Angeles', partOfDay: 'evening' } });
    assert.equal(res.status, 201);
    const survey = await res.json();
    assert.equal(survey.headline, 'That seat map link is broken');

    const session = await pool.query('select client from sessions where id = $1', [sessionId]);
    assert.equal(session.rows[0].client.region, 'Los Angeles');

    const answer = await post('/v1/responses', {
      siteKey: 'pk_dev_local', sessionId, triggerId: t.id, generatedSurveyId: survey.id, triggerType: 'error', status: 'submitted', answers: { q1: 'yes' },
    });
    assert.equal(answer.status, 201);
    const { rows } = await pool.query(
      `select r.answers, g.headline from survey_responses r join generated_surveys g on g.id = r.generated_survey_id where r.session_id = $1`,
      [sessionId],
    );
    assert.deepEqual(rows[0], { answers: { q1: 'yes' }, headline: 'That seat map link is broken' });

    const bad = await post('/v1/responses', {
      siteKey: 'pk_dev_local', sessionId, generatedSurveyId: survey.id, triggerType: 'error', status: 'submitted', answers: { q1: 'maybe' },
    });
    assert.equal(bad.status, 400);
  });

  it('caps AI surveys per session', async () => {
    const sessionId = randomUUID();
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await post('/v1/surveys/generate', { siteKey: 'pk_dev_local', sessionId, trigger: trigger(), client: {} })).status);
    }
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 201, 429]);
  });
});
