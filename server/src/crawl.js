import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.js';
import './env.js';
import { normUrl } from './guideMatch.js';
import { migrate } from './migrate.js';

const TAG = /<[^>]+>/g;

function strip(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
}

function textOf(html) {
  return strip(html)
    .replace(TAG, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function collect(html, re) {
  const out = [];
  for (const match of strip(html).matchAll(re)) out.push(match);
  return out;
}

export function parseHtml(pageUrl, html) {
  const clean = strip(html);
  const title = textOf((clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const headings = collect(clean, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)
    .map((match) => textOf(match[1]))
    .filter(Boolean)
    .slice(0, 12);
  const links = [];
  for (const match of collect(clean, /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href;
    try {
      href = new URL(match[1], pageUrl);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(href.protocol)) continue;
    href.hash = '';
    if (href.search) continue;
    const text = textOf(match[2]).slice(0, 80);
    if (!text) continue;
    links.push({ text, href: href.href });
  }
  const controls = collect(clean, /<button[^>]*>([\s\S]*?)<\/button>/gi)
    .map((match) => textOf(match[1]).slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);
  const excerpt = textOf(clean).slice(0, 500);
  return { url: pageUrl, title: title.slice(0, 140), headings, links, controls, excerpt };
}

export async function crawlOrigin(origin, { maxPages = 40, fetchImpl = fetch } = {}) {
  const root = origin.replace(/\/$/, '');
  const queue = [`${root}/`];
  const seen = new Set();
  const pages = [];
  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    const key = normUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    let res;
    try {
      res = await fetchImpl(url, { redirect: 'follow' });
    } catch {
      continue;
    }
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('html')) continue;
    const html = await res.text();
    const page = parseHtml(res.url || url, html);
    pages.push(page);
    let originHost;
    try {
      originHost = new URL(root).origin;
    } catch {
      continue;
    }
    for (const link of page.links) {
      try {
        const next = new URL(link.href);
        if (next.origin !== originHost) continue;
        const id = normUrl(next.href);
        if (!seen.has(id)) queue.push(next.href);
      } catch {
        /* skip malformed links */
      }
    }
  }
  return pages;
}

export async function saveIndex(pool, pages) {
  for (const page of pages) {
    let origin;
    try {
      origin = new URL(page.url).origin;
    } catch {
      continue;
    }
    await pool.query(
      `insert into page_index (origin, url, title, headings, links, controls, excerpt, fetched_at)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, now())
       on conflict (origin, url) do update set
         title = excluded.title,
         headings = excluded.headings,
         links = excluded.links,
         controls = excluded.controls,
         excerpt = excluded.excerpt,
         fetched_at = now()`,
      [origin, normUrl(page.url), page.title, JSON.stringify(page.headings), JSON.stringify(page.links), JSON.stringify(page.controls), page.excerpt],
    );
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const origins = process.argv.slice(2);
  if (!origins.length) {
    console.error('Usage: node server/src/crawl.js http://localhost:5173 ...');
    process.exit(1);
  }
  const pool = createPool();
  try {
    await migrate(pool, { log: () => {} });
    for (const origin of origins) {
      const pages = await crawlOrigin(origin);
      await saveIndex(pool, pages);
      console.log(`indexed ${pages.length} pages from ${origin}`);
    }
  } finally {
    await pool.end();
  }
}
