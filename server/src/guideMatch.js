const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'for', 'on', 'in', 'my', 'me', 'i', 'is', 'it', 'how', 'do', 'where', 'can', 'find', 'get', 'please', 'want', 'need', 'looking', 'what', 'this', 'that', 'trying', 'try', 'go', 'going', 'see', 'show', 'take', 'just', 'page']);
const HOURS = new Set(['hours', 'hour', 'open', 'opening', 'closes', 'closing', 'schedule'].map((word) => singular(word)));
const TIME = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;

// Meaning search settings. Start values from the plan; step 7 tunes them with the quiz (npm run eval:guide).
/** Pages less similar than this to the question are left out of the meaning list. */
export const MIN_SIMILARITY = 0.3;
/** The 60 in RRF's 1 / (60 + position). */
const RRF_K = 60;
/** How much each list's points count. Raise KEYWORD_WEIGHT if exact-word questions lose their top page. */
const KEYWORD_WEIGHT = 1;
const MEANING_WEIGHT = 1;

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

/**
 * Singular form of a word, so "exchanges" matches "exchange" and "stores" matches "store".
 * Short words and words that only look plural ("status", "address", "this") are left alone.
 */
export function singular(word) {
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (/(ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(singular)
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

/** Every keyword match, best first. This is today's keyword search, unchanged. */
function keywordRanked(query, pages) {
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
    .map(({ page }) => page);
}

/** How close two embeddings are in meaning: 1 is the same, near 0 is unrelated. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** Pages at or above the cutoff, closest in meaning first. Pages without an embedding are skipped. */
function meaningRanked(queryEmbedding, pages, minSimilarity) {
  return pages
    .map((page) => ({ page, similarity: cosineSimilarity(queryEmbedding, page.embedding) }))
    .filter(({ similarity }) => similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .map(({ page }) => page);
}

/**
 * Reciprocal Rank Fusion: each list gives a page weight / (RRF_K + position) points, and points are added up.
 * Ties go to the better keyword position, so a visitor's exact words win an even split.
 */
function mergeRanked(keywordList, meaningList) {
  const merged = new Map();
  const entry = (page) => {
    if (!merged.has(page.url)) merged.set(page.url, { page, points: 0, keywordPos: Infinity, meaningPos: Infinity });
    return merged.get(page.url);
  };
  keywordList.forEach((page, i) => {
    const item = entry(page);
    item.points += KEYWORD_WEIGHT / (RRF_K + i + 1);
    item.keywordPos = i;
  });
  meaningList.forEach((page, i) => {
    const item = entry(page);
    item.points += MEANING_WEIGHT / (RRF_K + i + 1);
    item.meaningPos = i;
  });
  return [...merged.values()].sort((a, b) => b.points - a.points || a.keywordPos - b.keywordPos || a.meaningPos - b.meaningPos);
}

/**
 * Up to `limit` pages for the visitor's question. With `queryEmbedding`, keyword and meaning results are merged
 * with RRF; without it (no key, or OpenAI failed), this is keyword search alone, exactly as before.
 * `minSimilarity` is only for the quiz script (npm run eval:guide) to compare cutoffs; the server uses the default.
 */
export function bestMatches(query, pages, fromUrl, limit = 3, { queryEmbedding = null, minSimilarity = MIN_SIMILARITY } = {}) {
  const keywordList = keywordRanked(query, pages);
  const ranked = queryEmbedding
    ? mergeRanked(keywordList, meaningRanked(queryEmbedding, pages, minSimilarity))
    : keywordList.map((page) => ({ page, keywordPos: 0 }));
  return ranked.slice(0, limit).map(({ page, keywordPos }) => ({
    url: page.url,
    title: page.title || page.url,
    // A page found only by meaning doesn't contain the visitor's words, so "Mentioned on ..." would be wrong.
    reason: keywordPos === Infinity ? 'Closest match on this site.' : reasonFor(query, page),
    steps: pathBetween(fromUrl, page.url, pages),
  }));
}
