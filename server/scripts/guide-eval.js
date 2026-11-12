// Scores the I'm Lost guide on a fixed question list (guide-questions.json).
// Crawls each demo site straight from the test-site folder (no servers or database needed),
// runs every question through the guide's matcher, and prints how often it finds the right page.
// Usage: npm run eval:guide -w server
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlOrigin } from '../src/crawl.js';
import { bestMatches, normUrl } from '../src/guideMatch.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { sites, questions } = JSON.parse(await readFile(path.join(here, 'guide-questions.json'), 'utf8'));

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
const results = questions.map((q) => {
  const { origin } = sites[q.site];
  const found = bestMatches(q.question, index[q.site], `${origin}/`, 3).map((m) => pathOf(m.url));
  const first = q.expect.includes(found[0]);
  const top3 = found.some((p) => q.expect.includes(p));
  const pass = q.kind === 'none' ? found.length === 0 : first;
  return { ...q, found, first, top3, pass };
});

for (const r of results) {
  const mark = r.pass ? 'ok  ' : r.top3 ? 'top3' : 'MISS';
  const expect = r.kind === 'none' ? '(nothing)' : r.expect.join(' or ');
  console.log(`${mark}  ${r.site.padEnd(10)} ${r.kind.padEnd(8)} ${JSON.stringify(r.question).padEnd(22)} want ${expect.padEnd(34)} got ${r.found.join(', ') || '(nothing)'}`);
}

const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : 'n/a');
const count = (list, key) => list.filter((r) => r[key]).length;
const answerable = results.filter((r) => r.kind !== 'none');
const exact = results.filter((r) => r.kind === 'exact');
const synonym = results.filter((r) => r.kind === 'synonym');
const none = results.filter((r) => r.kind === 'none');

console.log(`
Pages crawled: ${Object.entries(index).map(([name, pages]) => `${name} ${pages.length}`).join(', ')}
Right page first:        ${pct(count(answerable, 'first'), answerable.length)}   (exact ${pct(count(exact, 'first'), exact.length)}, synonym ${pct(count(synonym, 'first'), synonym.length)})
Right page in top 3:     ${pct(count(answerable, 'top3'), answerable.length)}   (exact ${pct(count(exact, 'top3'), exact.length)}, synonym ${pct(count(synonym, 'top3'), synonym.length)})
Correctly shows nothing: ${pct(none.filter((r) => r.found.length === 0).length, none.length)}`);
