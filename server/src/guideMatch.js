const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'for', 'on', 'in', 'my', 'me', 'i', 'is', 'it', 'how', 'do', 'where', 'can', 'find', 'get', 'please', 'want', 'need', 'looking', 'what', 'this', 'that', 'trying', 'try', 'go', 'going', 'see', 'show', 'take', 'just', 'page']);
const HOURS = new Set(['hours', 'hour', 'open', 'opening', 'closes', 'closing', 'schedule']);
const TIME = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;

export function normUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.origin + u.pathname;
  } catch {
    return String(url || '');
  }
}

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP.has(word));
}

function fieldTokens(page) {
  const controls = Array.isArray(page.controls) ? page.controls : [];
  const headings = Array.isArray(page.headings) ? page.headings : [];
  return [
    [page.title, 5],
    [headings.join(' '), 4],
    [controls.join(' '), 4],
    [page.excerpt, 1],
  ];
}

/** Visible copy used to decide what a page is actually about, including hours like "10am–7pm". */
export function bodyText(page) {
  return fieldTokens(page)
    .map(([text]) => text)
    .filter(Boolean)
    .join(' ');
}

export function scorePage(query, page) {
  const wanted = tokens(query).filter((word) => !HOURS.has(word));
  if (!wanted.length) return 0;
  let score = 0;
  for (const [text, weight] of fieldTokens(page)) {
    const have = new Set(tokens(text));
    for (const word of wanted) if (have.has(word)) score += weight;
  }
  return score;
}

function mentionsHours(text) {
  return TIME.test(text) || /\bhours?\b/i.test(text);
}

function reasonFor(query, page) {
  const wanted = new Set(tokens(query));
  const headings = Array.isArray(page.headings) ? page.headings : [];
  const heading = headings.find((text) => tokens(text).some((word) => wanted.has(word)));
  if (heading) return `This page has “${heading}”.`;
  const links = Array.isArray(page.links) ? page.links : [];
  const link = links.find((item) => tokens(item?.text).some((word) => wanted.has(word)));
  if (link?.text) return `Linked as “${link.text}”.`;
  return `Mentioned on ${page.title || 'this page'}.`;
}

/** Shortest click path from the current page to the target, using crawled anchor text. */
export function pathBetween(fromUrl, targetUrl, pages) {
  const byUrl = new Map(pages.map((page) => [normUrl(page.url), page]));
  const target = normUrl(targetUrl);
  if (!byUrl.has(target)) return [];
  let start = normUrl(fromUrl);
  if (!byUrl.has(start)) {
    const origin = (() => {
      try {
        return new URL(fromUrl).origin;
      } catch {
        return '';
      }
    })();
    const home = byUrl.has(`${origin}/`) ? `${origin}/` : byUrl.keys().next().value;
    start = home || start;
  }
  if (start === target) return [];

  const queue = [{ url: start, steps: [] }];
  const seen = new Set([start]);
  while (queue.length) {
    const current = queue.shift();
    if (current.steps.length >= 6) continue;
    const page = byUrl.get(current.url);
    for (const link of page?.links || []) {
      const next = normUrl(link.href);
      if (!next || seen.has(next) || !byUrl.has(next)) continue;
      const steps = [...current.steps, { label: String(link.text || byUrl.get(next).title || 'Page').slice(0, 40), url: link.href }];
      if (next === target) return steps;
      seen.add(next);
      queue.push({ url: next, steps });
    }
  }
  const page = byUrl.get(target);
  return [{ label: page?.title || 'Page', url: page.url }];
}

export function bestMatches(query, pages, fromUrl, limit = 3) {
  const queryTokens = tokens(query);
  const wantsHours = queryTokens.some((word) => HOURS.has(word));
  const contentTokens = queryTokens.filter((word) => !HOURS.has(word));
  const bodies = pages.map((page) => bodyText(page));
  const df = new Map();
  for (const text of bodies) {
    for (const word of new Set(tokens(text))) df.set(word, (df.get(word) || 0) + 1);
  }
  const known = contentTokens.filter((word) => df.has(word));
  const rarest = known.length ? Math.min(...known.map((word) => df.get(word))) : Infinity;
  // "shop" is on every page's nav. "state" and "street" are not, so only those are required.
  const required = known.filter((word) => df.get(word) === rarest);

  return pages
    .map((page, index) => {
      const text = bodies[index];
      const have = new Set(tokens(text));
      if (required.length && !required.every((word) => have.has(word))) return null;
      if (!required.length && wantsHours && !mentionsHours(text)) return null;
      let score = scorePage(query, page);
      if (wantsHours && mentionsHours(text)) score += 8;
      if (wantsHours && required.length && !mentionsHours(text)) return null;
      if (score <= 0) return null;
      return { page, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.page.url.length - b.page.url.length)
    .slice(0, limit)
    .map(({ page }) => ({
      url: page.url,
      title: page.title || page.url,
      reason: reasonFor(query, page),
      steps: pathBetween(fromUrl, page.url, pages),
    }));
}
