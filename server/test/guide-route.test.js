import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { saveIndex } from '../src/crawl.js';
import { startTestServer } from './helpers.js';

// A tiny Southwest-like site in the test database, with fake 2-number embeddings.
const page = (path, title, embedding) => ({
  url: `http://localhost:5173${path}`,
  title,
  headings: [title],
  links: [],
  controls: [],
  excerpt: title,
  embedding,
});
const SITE = [page('/', 'Home', [0.1, 0.99]), page('/bags.html', 'Bags', [1, 0]), page('/help.html', 'Help', [0, 1])];
// The same site crawled with no key: no embeddings saved.
const NO_EMBEDDINGS = [page('/', 'Home', null), page('/bags.html', 'Bags', null)].map((p) => ({ ...p, url: p.url.replace('5173', '5174') }));

const ask = (base, query, url = 'http://localhost:5173/') =>
  fetch(`${base}/v1/guide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteKey: 'pk_dev_local', sessionId: randomUUID(), query, url }),
  });
const paths = (body) => body.matches.map((match) => new URL(match.url).pathname);

describe('POST /v1/guide with meaning search', () => {
  let server;
  let calls;
  let behave;
  before(async () => {
    // Fake embeddings helper: records each call, then does whatever the current test sets.
    const embedder = { embed: async (texts) => { calls.push(texts); return behave(texts); } };
    server = await startTestServer({ embedder });
    await saveIndex(server.pool, [...SITE, ...NO_EMBEDDINGS]);
  });
  after(async () => {
    await server.close();
  });

  it("embeds the visitor's question once and finds pages by meaning", async () => {
    calls = [];
    behave = async () => [[0.95, 0.05]]; // "luggage" means nearly the same as Bags
    const res = await ask(server.base, 'luggage');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(calls, [['luggage']]);
    assert.equal(paths(body)[0], '/bags.html');
    assert.equal(body.matches[0].reason, 'Closest match on this site.');
  });

  it('D1. never errors when OpenAI fails: the visitor still gets keyword results', async () => {
    calls = [];
    behave = async () => { throw new Error('OpenAI responded 500'); };
    const res = await ask(server.base, 'bags');
    assert.equal(res.status, 200);
    assert.deepEqual(paths(await res.json()), ['/bags.html']);
    assert.equal(calls.length, 1);
  });

  it("doesn't send the question to OpenAI when the site's pages have no embeddings", async () => {
    calls = [];
    behave = async () => [[1, 0]];
    const res = await ask(server.base, 'bags', 'http://localhost:5174/');
    assert.equal(res.status, 200);
    assert.deepEqual(paths(await res.json()), ['/bags.html']);
    assert.deepEqual(calls, []);
  });
});

describe('POST /v1/guide with no API key', () => {
  let server;
  before(async () => {
    server = await startTestServer();
    await saveIndex(server.pool, SITE);
  });
  after(async () => {
    await server.close();
  });

  it('uses keyword search only, exactly like today', async () => {
    const synonym = await ask(server.base, 'luggage');
    assert.equal(synonym.status, 200);
    assert.deepEqual((await synonym.json()).matches, []);
    const exact = await ask(server.base, 'bags');
    assert.deepEqual(paths(await exact.json()), ['/bags.html']);
  });
});
