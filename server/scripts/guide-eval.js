// Scores the I'm Lost guide on a fixed question list (guide-questions.json).
// Crawls each demo site straight from the test-site folder (no servers or database needed),
// runs every question through the guide's matcher, and prints how often it finds the right page.
// With OPENAI_API_KEY in server/.env it also scores meaning search (real embeddings) at several cutoffs.
// Usage: npm run eval:guide -w server
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlOrigin, embedPages } from '../src/crawl.js';
import { createEmbedder } from '../src/embeddings.js';
import { MIN_SIMILARITY, bestMatches, cosineSimilarity, normUrl } from '../src/guideMatch.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { sites, questions } = JSON.parse(await readFile(path.join(here, 'guide-questions.json'), 'utf8'));
const CUTOFFS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

/** Answers like test-site/server.mjs does, but reads the files directly. */
function folderFetch(dir) {
  return async (url) => {
    const { pathname } = new URL(url);
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    try {
      const html = await readFile(path.join(repo, dir, path.normalize(file)), 'utf8');
      return { ok: true, url, headers: new Headers({ 'content-type': 'text/html' }), text: async () => html };
    } catch {
      return { ok: false, url, headers: new Headers({ 'content-type': 'text/html' }), text: async () => '' };
    }
  };
}

// Same pages the real crawl saves, with URLs normalized the way saveIndex stores them.
const index = {};
for (const [name, site] of Object.entries(sites)) {
  const pages = await crawlOrigin(site.origin, { fetchImpl: folderFetch(site.dir) });
  index[name] = pages.map((page) => ({ ...page, url: normUrl(page.url) }));
}

const pathOf = (url) => new URL(url).pathname;

/** Runs every question; `embeddingOf(q)` gives the question's embedding, or null for keyword search only. */
function run(embeddingOf = () => null, minSimilarity = MIN_SIMILARITY) {
  return questions.map((q) => {
    const { origin } = sites[q.site];
    const found = bestMatches(q.question, index[q.site], `${origin}/`, 3, { queryEmbedding: embeddingOf(q), minSimilarity })
      .map((m) => pathOf(m.url));
    const first = q.expect.includes(found[0]);
    const top3 = found.some((p) => q.expect.includes(p));
    const pass = q.kind === 'none' ? found.length === 0 : first;
    return { ...q, found, first, top3, pass };
  });
}

function printLines(results) {
  for (const r of results) {
    const mark = r.pass ? 'ok  ' : r.top3 ? 'top3' : 'MISS';
    const expect = r.kind === 'none' ? '(nothing)' : r.expect.join(' or ');
    console.log(`${mark}  ${r.site.padEnd(10)} ${r.kind.padEnd(8)} ${JSON.stringify(r.question).padEnd(22)} want ${expect.padEnd(34)} got ${r.found.join(', ') || '(nothing)'}`);
  }
}

const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : 'n/a');
const count = (list, key) => list.filter((r) => r[key]).length;
function scores(results) {
  const answerable = results.filter((r) => r.kind !== 'none');
  const exact = results.filter((r) => r.kind === 'exact');
  const synonym = results.filter((r) => r.kind === 'synonym');
  const none = results.filter((r) => r.kind === 'none');
  return {
    first: pct(count(answerable, 'first'), answerable.length),
    top3: pct(count(answerable, 'top3'), answerable.length),
    exactFirst: pct(count(exact, 'first'), exact.length),
    exactTop3: pct(count(exact, 'top3'), exact.length),
    synonymFirst: pct(count(synonym, 'first'), synonym.length),
    synonymTop3: pct(count(synonym, 'top3'), synonym.length),
    nothing: pct(none.filter((r) => r.found.length === 0).length, none.length),
  };
}

const keywordOnly = run();
printLines(keywordOnly);
const k = scores(keywordOnly);
console.log(`
Pages crawled: ${Object.entries(index).map(([name, pages]) => `${name} ${pages.length}`).join(', ')}
Right page first:        ${k.first}   (exact ${k.exactFirst}, synonym ${k.synonymFirst})
Right page in top 3:     ${k.top3}   (exact ${k.exactTop3}, synonym ${k.synonymTop3})
Correctly shows nothing: ${k.nothing}`);

const embedder = createEmbedder({ apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL || undefined, timeoutMs: 30_000 });
if (!embedder) {
  console.log('\nMeaning search: skipped (no OPENAI_API_KEY in server/.env).');
} else {
  // Real embeddings: one request per site for the pages (like the crawler), one for all questions.
  for (const name of Object.keys(index)) {
    index[name] = await embedPages(index[name], embedder, { log: (msg) => { throw new Error(msg); } });
  }
  const vectors = await embedder.embed(questions.map((q) => q.question));
  const embeddingOf = (q) => vectors[questions.indexOf(q)];

  console.log(`\n=== Meaning search (${embedder.model}) ===\n\nSimilarity of each question to pages (helps pick the cutoff):`);
  for (const q of questions) {
    const sims = index[q.site]
      .map((page) => ({ path: pathOf(page.url), sim: cosineSimilarity(embeddingOf(q), page.embedding) }))
      .sort((a, b) => b.sim - a.sim);
    const want = q.kind === 'none' ? '' : sims.filter((s) => q.expect.includes(s.path)).map((s) => `${s.path} ${s.sim.toFixed(2)}`).join(', ');
    console.log(`  ${q.site.padEnd(10)} ${q.kind.padEnd(8)} ${JSON.stringify(q.question).padEnd(22)} closest ${`${sims[0].path} ${sims[0].sim.toFixed(2)}`.padEnd(28)} ${want ? `right page ${want}` : ''}`);
  }

  console.log('\nScores by cutoff (keyword + meaning, merged with RRF):\n');
  console.log('  cutoff         | right page first       | in top 3      | exact first | synonym first | correctly shows nothing');
  console.log(`  keyword only   | ${k.first.padEnd(22)} | ${k.top3.padEnd(13)} | ${k.exactFirst.padEnd(11)} | ${k.synonymFirst.padEnd(13)} | ${k.nothing}`);
  for (const cutoff of CUTOFFS) {
    const s = scores(run(embeddingOf, cutoff));
    const label = `${cutoff.toFixed(2)}${cutoff === MIN_SIMILARITY ? ' (now)' : ''}`;
    console.log(`  ${label.padEnd(14)} | ${s.first.padEnd(22)} | ${s.top3.padEnd(13)} | ${s.exactFirst.padEnd(11)} | ${s.synonymFirst.padEnd(13)} | ${s.nothing}`);
  }

  const merged = run(embeddingOf);
  console.log(`\nEach question at the current cutoff (${MIN_SIMILARITY}):\n`);
  printLines(merged);
  const changed = merged.filter((r, i) => r.kind === 'exact' && r.found[0] !== keywordOnly[i].found[0]);
  console.log(`\nExact-word questions whose top page changed from keyword only: ${changed.length ? changed.map((r) => JSON.stringify(r.question)).join(', ') : 'none'}`);
}
