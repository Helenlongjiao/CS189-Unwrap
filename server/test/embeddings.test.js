import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmbedder } from '../src/embeddings.js';

describe('embeddings helper', () => {
  it('is disabled without an API key', () => {
    assert.equal(createEmbedder({}), null);
  });

  it('sends many texts in one request and returns their embeddings in the same order', async () => {
    const calls = [];
    const embedder = createEmbedder({
      apiKey: 'sk-test',
      baseUrl: 'https://us.api.openai.com/v1/',
      fetchImpl: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        // OpenAI tags each embedding with the position of its text; answer out of order on purpose.
        return new Response(JSON.stringify({
          data: [
            { index: 2, embedding: [0, 0, 1] },
            { index: 0, embedding: [1, 0, 0] },
            { index: 1, embedding: [0, 1, 0] },
          ],
        }));
      },
    });
    const texts = ['Bags', 'Check in', 'Help'];
    const out = await embedder.embed(texts);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://us.api.openai.com/v1/embeddings');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
    assert.deepEqual(calls[0].body, { model: 'text-embedding-3-small', input: texts });
    assert.deepEqual(out, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  });

  it('throws when OpenAI returns an error, so callers can fall back to keywords', async () => {
    const embedder = createEmbedder({
      apiKey: 'sk-test',
      fetchImpl: async () => new Response('rate limited', { status: 429 }),
    });
    await assert.rejects(embedder.embed(['Bags']), /OpenAI responded 429/);
  });

  it('gives up after about 2 seconds when OpenAI does not answer', async () => {
    const embedder = createEmbedder({
      apiKey: 'sk-test',
      // Never answers; only stops when the helper cancels the request.
      // The timer stands in for the open network connection a real request would keep alive.
      fetchImpl: (url, init) => new Promise((resolve, reject) => {
        const openConnection = setTimeout(() => {}, 10_000);
        init.signal.addEventListener('abort', () => {
          clearTimeout(openConnection);
          reject(init.signal.reason);
        });
      }),
    });
    const started = Date.now();
    await assert.rejects(embedder.embed(['Bags']));
    const waited = Date.now() - started;
    assert.ok(waited >= 1900 && waited < 3000, `waited ${waited}ms`);
  });
});
