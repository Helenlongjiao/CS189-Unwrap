import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { embedPages, parseHtml, saveIndex } from '../src/crawl.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { TEST_DATABASE_URL } from './helpers.js';

const PAGE = `<!doctype html><html><head><title>Demo Air - Bags</title></head><body>
  <header><a href="/">Demo Air</a><nav><a href="/login.html">Log in</a><a href="/deals.html">Special offers</a></nav></header>
  <main><h1>Bags</h1><p>First two checked bags are free.</p></main>
  <footer>Copyright 2026 Demo Air</footer>
  <nav aria-label="Trip tools"><a href="/check-in.html">Check in</a></nav>
</body></html>`;

const page = (url, embedText) => ({ url, title: '', headings: [], links: [], controls: [], excerpt: '', embedText });

describe('crawler embedding text', () => {
  it("is the page's own content: title, headings and main text, without the shared menu or footer", () => {
    const { embedText } = parseHtml('http://air.test/bags.html', PAGE);
    assert.match(embedText, /Demo Air - Bags/);
    assert.match(embedText, /Bags/);
    assert.match(embedText, /First two checked bags are free\./);
    for (const shared of ['Log in', 'Special offers', 'Copyright', 'Trip tools', 'Check in']) {
      assert.doesNotMatch(embedText, new RegExp(shared), `should not contain "${shared}"`);
    }
  });

  it('drops the header, menu and footer when a page has no <main>', () => {
    const html = PAGE.replace('<main>', '<div>').replace('</main>', '</div>');
    const { embedText } = parseHtml('http://air.test/bags.html', html);
    assert.match(embedText, /First two checked bags are free\./);
    assert.equal(embedText.match(/Demo Air - Bags/g).length, 1, 'title appears once');
    for (const shared of ['Log in', 'Special offers', 'Copyright', 'Check in']) {
      assert.doesNotMatch(embedText, new RegExp(shared), `should not contain "${shared}"`);
    }
  });

  it('is capped so one very long page cannot make the whole request fail', () => {
    const html = PAGE.replace('<p>First two checked bags are free.</p>', `<p>${'word '.repeat(5000)}</p>`);
    assert.ok(parseHtml('http://air.test/bags.html', html).embedText.length <= 8000);
  });
});

describe('embedPages', () => {
  const pages = [page('http://air.test/', 'Home'), page('http://air.test/bags.html', 'Bags'), page('http://air.test/help.html', 'Help')];

  it("sends every page's embedding text in one request and attaches each embedding to its page", async () => {
    const calls = [];
    const embedder = { embed: async (texts) => { calls.push(texts); return [[1, 0], [0, 1], [0.5, 0.5]]; } };
    const out = await embedPages(pages, embedder);
    assert.deepEqual(calls, [['Home', 'Bags', 'Help']]);
    assert.deepEqual(out.map((p) => [p.url, p.embedding]), [
      ['http://air.test/', [1, 0]],
      ['http://air.test/bags.html', [0, 1]],
      ['http://air.test/help.html', [0.5, 0.5]],
    ]);
  });

  it('keeps the pages without embeddings when OpenAI fails, so the crawl still finishes', async () => {
    const warnings = [];
    const embedder = { embed: async () => { throw new Error('OpenAI responded 500'); } };
    const out = await embedPages(pages, embedder, { log: (msg) => warnings.push(msg) });
    assert.deepEqual(out.map((p) => [p.url, p.embedding]), pages.map((p) => [p.url, null]));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /OpenAI responded 500/);
  });

  it('keeps the pages without embeddings when there is no API key', async () => {
    const out = await embedPages(pages, null);
    assert.deepEqual(out.map((p) => p.embedding), [null, null, null]);
  });
});

describe('saveIndex', () => {
  let pool;
  before(async () => {
    pool = createPool(TEST_DATABASE_URL);
    await pool.query('drop schema public cascade; create schema public;');
    await migrate(pool, { log: () => {} });
  });
  after(async () => {
    await pool.end();
  });

  it("saves each page's embedding, or none when it has no embedding", async () => {
    await saveIndex(pool, [
      { ...page('http://air.test/bags.html', 'Bags'), embedding: [0.25, -0.5, 1] },
      { ...page('http://air.test/help.html', 'Help'), embedding: null },
    ]);
    const { rows } = await pool.query('select url, embedding from page_index order by url');
    assert.deepEqual(rows, [
      { url: 'http://air.test/bags.html', embedding: [0.25, -0.5, 1] },
      { url: 'http://air.test/help.html', embedding: null },
    ]);
  });
});
