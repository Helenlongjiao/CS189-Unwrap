import { LOST_MODEL_VERSION, type SiteProfile } from './profile';
import { pageIdentity, pageTemplate } from './route';

/**
 * Polite crawl used by the integration guide, not by the in-page SDK.
 * It stays out of the browser bundle: nothing in the SDK entry imports it.
 * Same-origin HTML only, robots.txt first, and a pause between requests.
 */

export interface FetchedPage {
  ok: boolean;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface CrawlOptions {
  maxPages?: number;
  /** Pause between requests. Defaults to 1s. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface PageSource {
  url: string;
  html: string;
}

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const FIELD = /<(input|textarea)\b([^>]*)>/gi;
const HELP = /\b(help|faq|support|contact)\b/i;
const SEARCH_WORD = /\bsearch\b/i;

function attr(source: string, name: string): string {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? match[1] ?? match[2] ?? '' : '';
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRobots(text: string): string[] {
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) {
      current = null;
      continue;
    }
    const split = line.indexOf(':');
    if (split < 0) continue;
    const key = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.disallow.length) {
        current = { agents: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'disallow' && current && value) {
      current.disallow.push(value);
    }
  }
  return groups.find((group) => group.agents.includes('*'))?.disallow ?? [];
}

function isDisallowed(path: string, rules: string[]): boolean {
  return rules.some((rule) => {
    const exact = rule.endsWith('$');
    const prefix = exact ? rule.slice(0, -1) : rule;
    if (!prefix) return false;
    if (exact) return path === prefix;
    return path === prefix || path.startsWith(prefix);
  });
}

function linksOf(html: string, base: string): { href: string; text: string; nofollow: boolean }[] {
  const found: { href: string; text: string; nofollow: boolean }[] = [];
  for (const match of html.matchAll(ANCHOR)) {
    const href = attr(match[1], 'href');
    if (!href || href.startsWith('#') || /^(?:mailto|javascript|tel):/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      url.search = '';
      found.push({
        href: url.href,
        text: visibleText(match[2]),
        nofollow: /\bnofollow\b/i.test(attr(match[1], 'rel')),
      });
    } catch {
      /* ignore malformed hrefs */
    }
  }
  return found;
}

function hasSearchBox(html: string): boolean {
  for (const match of html.matchAll(FIELD)) {
    const attrs = match[2];
    if ((attr(attrs, 'type') || '').toLowerCase() === 'search') return true;
    if ((attr(attrs, 'role') || '').toLowerCase() === 'searchbox') return true;
    const blob = [attr(attrs, 'name'), attr(attrs, 'id'), attr(attrs, 'placeholder'), attr(attrs, 'aria-label')].join(' ');
    if (SEARCH_WORD.test(blob)) return true;
  }
  return false;
}

/** Build a site profile from HTML that has already been fetched. */
export function profileFromPages(pages: PageSource[]): SiteProfile {
  const help = new Set<string>();
  const search = new Set<string>();
  const listingCounts = new Map<string, number>();

  const noteUrl = (href: string) => {
    const template = pageTemplate(href);
    if (!template.includes(':id')) return;
    listingCounts.set(template, (listingCounts.get(template) ?? 0) + 1);
  };

  for (const page of pages) {
    noteUrl(page.url);
    if (hasSearchBox(page.html)) search.add(pageTemplate(page.url));
    for (const link of linksOf(page.html, page.url)) {
      noteUrl(link.href);
      if (HELP.test(link.text)) help.add(pageTemplate(link.href));
    }
  }

  const listings = [...listingCounts.entries()].filter((entry) => entry[1] >= 2).map((entry) => entry[0]);
  return {
    version: LOST_MODEL_VERSION,
    listings,
    reading: [],
    sections: [],
    sectionLabels: [],
    help: [...help],
    search: [...search],
    funnels: [],
  };
}

/**
 * Fetch a site's public pages and return the profile the lostness model can use.
 * Starts with robots.txt, skips disallowed and off-origin URLs, and waits between requests.
 */
export async function politeCrawl(
  startUrl: string,
  fetchImpl: (url: string) => Promise<FetchedPage>,
  options: CrawlOptions = {},
): Promise<SiteProfile> {
  const delayMs = options.delayMs ?? 1000;
  const maxPages = options.maxPages ?? 8;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const origin = new URL(startUrl).origin;
  let firstFetch = true;

  const get = async (url: string): Promise<FetchedPage> => {
    if (!firstFetch) await sleep(delayMs);
    firstFetch = false;
    return fetchImpl(url);
  };

  let rules: string[] = [];
  try {
    const robots = await get(new URL('/robots.txt', origin).href);
    if (robots.ok) rules = parseRobots(await robots.text());
  } catch {
    /* a missing robots file should not block the guide */
  }

  const queue = [startUrl];
  const seen = new Set<string>();
  const pages: PageSource[] = [];

  while (queue.length && pages.length < maxPages) {
    const next = queue.shift();
    if (!next) break;
    let target: URL;
    try {
      target = new URL(next);
    } catch {
      continue;
    }
    if (target.origin !== origin) continue;
    target.search = '';
    target.hash = '';
    const identity = pageIdentity(target.href);
    if (seen.has(identity) || isDisallowed(identity, rules)) continue;
    seen.add(identity);

    let response: FetchedPage;
    try {
      response = await get(target.href);
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const html = await response.text();
    const type = response.headers?.get('content-type') ?? '';
    if (type && !/html/i.test(type)) continue;
    if (!type && !html.includes('<')) continue;
    pages.push({ url: target.href, html });

    for (const link of linksOf(html, target.href)) {
      if (link.nofollow || queue.length >= 100) continue;
      try {
        const linked = new URL(link.href);
        if (linked.origin !== origin || isDisallowed(pageIdentity(linked.href), rules)) continue;
        queue.push(linked.href);
      } catch {
        /* skip */
      }
    }
  }

  return profileFromPages(pages);
}
