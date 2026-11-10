import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lostDetector } from '../src/detectors/lost';
import {
  DECAY_MS,
  FULL_SCORE,
  LOST_RULES,
  NUDGE_SCORE,
  assessLost,
  type LostTrailEvent,
} from '../src/detectors/lostModel';
import { politeCrawl, profileFromPages, type FetchedPage } from '../src/profile/crawl';
import { resolveConfig } from '../src/config';
import type { LostTuning } from '../src/detectors/lostConfig';
import { LOST_MODEL_VERSION, type SiteProfile } from '../src/profile/profile';
import { pageIdentity, pageTemplate, routeFields } from '../src/profile/route';
import { click, setup, type as fill } from './harness';

const NOW = 1_000_000;

function page(path: string, at: number): LostTrailEvent {
  return { type: 'page', at, url: `http://shop.test${path}` };
}

function tap(label: string, at: number, extra: Partial<LostTrailEvent> = {}): LostTrailEvent {
  return { type: 'click', at, url: 'http://shop.test/', label, ...extra };
}

function pages(paths: string[], gap: number): LostTrailEvent[] {
  const start = NOW - (paths.length - 1) * gap;
  return paths.map((path, index) => page(path, start + index * gap));
}

function judge(events: LostTrailEvent[], profile?: SiteProfile, now = NOW, tuning?: Partial<LostTuning>) {
  return assessLost(events, now, profile, tuning);
}

describe('route templates', () => {
  it('collapses ids, drops queries and anchors, and keeps hash routes', () => {
    expect(pageIdentity('http://shop.test/products/42?page=2#reviews')).toBe('/products/42');
    expect(pageTemplate('http://shop.test/products/42')).toBe('/products/:id');
    expect(pageTemplate('http://shop.test/products/7')).toBe('/products/:id');
    expect(pageIdentity('http://shop.test/app#section')).toBe('/app');
    expect(pageIdentity('http://shop.test/#/inbox')).toBe('/inbox');
    expect(pageIdentity('http://shop.test/#!/billing')).toBe('/billing');
  });

  it('stores a hash of a long token instead of the token', () => {
    const token = 'a'.repeat(40);
    const fields = routeFields(`http://shop.test/reset/${token}`);
    expect(fields.identity).not.toContain(token);
    expect(fields.template).toBe('/reset/:id');
    expect(routeFields(`http://shop.test/reset/${'b'.repeat(40)}`).identity).not.toBe(fields.identity);
    expect(routeFields('http://shop.test/products/42')).toMatchObject({ identity: '/products/42', template: '/products/:id' });
  });
});

describe('lost rules', () => {
  it('publishes one versioned rule table', () => {
    const ids = LOST_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LOST_MODEL_VERSION).toBe('lost-score/7');
    expect(judge([]).version).toBe(LOST_MODEL_VERSION);
  });

  it('does not nudge for a single mild signal', () => {
    const help = judge([tap('Help', NOW)]);
    expect(help.tier).toBe('none');
    expect(help.score).toBeLessThan(NUDGE_SCORE);
    expect(help.evidence).toContain('help');

    const stuck = judge([page('/account', NOW - 45_000)]);
    expect(stuck).toMatchObject({ tier: 'none', score: 0, motion: 'other' });
    expect(stuck.evidence).not.toContain('dwell-flat');

    const short = pages(['/a', '/b', '/a', '/b', '/a', '/b'], 1_000);
    expect(judge(short)).toMatchObject({ tier: 'none', score: 0, motion: 'other' });

    const pass = pages(['/a', '/b', '/c', '/d', '/e', '/f', '/a'], 1_000);
    expect(judge(pass)).toMatchObject({ tier: 'none', score: 0, motion: 'other' });

    const loop = pages(['/a', '/b', '/c', '/d', '/e', '/f', '/a', '/b'], 1_000);
    const deep = judge(loop);
    expect(deep.tier).toBe('none');
    expect(deep.score).toBe(NUDGE_SCORE - 1);
    expect(deep.evidence).toEqual(['circle-6']);
  });

  it('nudges when two different signals overlap, and opens fully when a strong rule matches', () => {
    const looped = judge([...pages(['/billing', '/orders', '/account', '/settings', '/billing', '/orders'], 1_000), tap('Help', NOW)]);
    expect(looped.tier).toBe('nudge');
    expect(looped.score).toBeGreaterThanOrEqual(NUDGE_SCORE);
    expect(looped.score).toBeLessThan(FULL_SCORE);
    expect(looped.evidence).toEqual(expect.arrayContaining(['circle-4', 'help']));

    const trapped = judge([...pages(['/a', '/b', '/c', '/d', '/e', '/f', '/a', '/b'], 1_000), tap('Help', NOW)]);
    expect(trapped.tier).toBe('full');
    expect(trapped.strong).toBe(false);

    const missed = judge([
      { type: 'error', at: NOW - 3_000, url: 'http://shop.test/missing', kind: 'page' },
      page('/news', NOW - 2_000),
      page('/account', NOW - 1_000),
      page('/search', NOW),
    ]);
    expect(missed.tier).toBe('full');
    expect(missed.strong).toBe(true);
    expect(missed.evidence).toContain('error-wander');
  });

  it('lets an aging signal fade inside its window', () => {
    const loop = pages(['/billing', '/orders', '/account', '/settings', '/billing', '/orders'], 1_000);
    const fresh = judge([...loop, tap('Help', NOW)]);
    const aged = judge([...loop, tap('Help', NOW - 180_000)]);
    expect(fresh.score).toBeGreaterThan(aged.score);
    expect(aged.score).toBe(NUDGE_SCORE);
    expect(aged.tier).toBe('nudge');
    expect(judge([...loop, tap('Help', NOW - 180_001)]).tier).toBe('none');
  });

  it('drops a failed search once it leaves the window', () => {
    const hops = (at: number): LostTrailEvent[] => [
      { type: 'search', at: at - 20, url: 'http://shop.test/find', query: 'shoes' },
      { type: 'search', at: at - 10, url: 'http://shop.test/find', query: 'boots' },
      page('/a', at - 5),
      page('/b', at),
    ];
    expect(judge(hops(NOW)).tier).toBe('full');
    expect(judge(hops(NOW - 180_000)).tier).toBe('none');
    expect(judge(hops(NOW - DECAY_MS)).tier).toBe('none');
  });
});

describe('sessions that should stay quiet', () => {
  it('reads an article', () => {
    const events: LostTrailEvent[] = [
      page('/story', NOW - 90_000),
      { type: 'scroll', at: NOW - 80_000, url: 'http://shop.test/story', y: 0 },
      { type: 'scroll', at: NOW - 70_000, url: 'http://shop.test/story', y: 500 },
      { type: 'scroll', at: NOW - 60_000, url: 'http://shop.test/story', y: 200 },
    ];
    expect(judge(events)).toMatchObject({ tier: 'none', score: 0, motion: 'reading' });
  });

  it('opens three products from a listing', () => {
    expect(judge(pages(['/shop', '/products/1', '/products/2', '/products/3'], 1_000)).tier).toBe('none');
    const browsing = pages(['/products', '/products/1', '/products', '/products/2', '/products', '/products/3'], 1_000);
    expect(judge(browsing)).toMatchObject({ tier: 'none', score: 0 });
  });

  it('treats one fast pass as progress and a second pass as a circle', () => {
    const trip = ['/', '/flights', '/seatmap', '/checkout', '/'];
    const fast = judge([...pages(trip, 200), tap('Help', NOW)]);
    expect(fast).toMatchObject({ tier: 'none', motion: 'other' });
    expect(fast.evidence).toContain('help');
    expect(fast.evidence).not.toContain('circle-4');
    expect(fast.recovered).toContain('progress');

    const detour = judge([...pages(['/', '/flights', '/seatmap', '/flights', '/checkout', '/'], 200), tap('Help', NOW)]);
    expect(detour.tier).toBe('none');
    expect(detour.recovered).toContain('progress');

    const again = judge([...pages([...trip, '/flights'], 200), tap('Help', NOW)]);
    expect(again).toMatchObject({ tier: 'nudge', motion: 'circling' });
    expect(again.evidence).toEqual(expect.arrayContaining(['circle-4', 'help']));
  });

  it('steps through checkout', () => {
    const result = judge(pages(['/cart', '/checkout', '/checkout/shipping', '/checkout/payment'], 1_000));
    expect(result).toMatchObject({ tier: 'none', score: 0 });
    expect(result.recovered).toContain('forward');
  });

  it('toggles filters without leaving the page', () => {
    const events = [page('/shop', NOW - 2_000), ...[0, 1, 2, 3].map((i) => tap('Color', NOW - 1_000 + i, { inPage: true }))];
    expect(judge(events)).toMatchObject({ tier: 'none', score: 0 });
  });

  it('ignores console and resource errors, and script errors nobody clicked', () => {
    const wander = [page('/news', NOW - 2_000), page('/account', NOW - 1_000), page('/search', NOW)];
    expect(judge([{ type: 'error', at: NOW - 3_000, url: 'http://shop.test/', kind: 'console' }, ...wander]).tier).toBe('none');
    expect(judge([{ type: 'error', at: NOW - 3_000, url: 'http://shop.test/', kind: 'resource' }, ...wander]).evidence).not.toContain('error-wander');
    expect(judge([{ type: 'error', at: NOW - 3_000, url: 'http://shop.test/', kind: 'js' }, ...wander]).evidence).not.toContain('error-wander');
  });

  it('counts a script error only when a click just caused it', () => {
    const after = [page('/news', NOW - 2_000), page('/account', NOW - 1_000), page('/search', NOW)];
    const caused = judge([tap('Save', NOW - 4_000), { type: 'error', at: NOW - 3_000, url: 'http://shop.test/', kind: 'js' }, ...after]);
    expect(caused.tier).toBe('full');
    const late = judge([tap('Save', NOW - 30_000), { type: 'error', at: NOW - 3_000, url: 'http://shop.test/', kind: 'js' }, ...after]);
    expect(late.evidence).not.toContain('error-wander');
  });

  it('treats repeated replaceState on one path as one visit', () => {
    const events = [0, 1, 2, 3, 4].map((i) => page('/app', NOW - 4_000 + i * 1_000));
    expect(judge(events)).toMatchObject({ tier: 'none', score: 0 });
  });

  it('clears help and a started form once the form is submitted', () => {
    const events: LostTrailEvent[] = [
      page('/pricing', NOW - 3_000),
      tap('Contact', NOW - 2_500),
      page('/contact', NOW - 2_000),
      { type: 'edit', at: NOW - 1_500, url: 'http://shop.test/contact', field: 'Email' },
      { type: 'edit', at: NOW - 1_000, url: 'http://shop.test/contact', field: 'Message' },
      { type: 'submit', at: NOW, url: 'http://shop.test/contact' },
    ];
    expect(judge(events)).toMatchObject({ tier: 'none', score: 0 });
    expect(judge(events).recovered).toEqual(expect.arrayContaining(['submit-help']));
  });

  it('treats two searches with no further movement as looking, not lost', () => {
    const events: LostTrailEvent[] = [
      { type: 'search', at: NOW - 20_000, url: 'http://shop.test/find', query: 'shoes' },
      { type: 'search', at: NOW - 16_000, url: 'http://shop.test/find', query: 'boots' },
    ];
    const result = judge(events);
    expect(result.tier).toBe('none');
    expect(result.evidence).toContain('search-reformulation');
  });

  it('treats a result click as the search succeeding', () => {
    const events: LostTrailEvent[] = [
      { type: 'search', at: NOW - 4_000, url: 'http://shop.test/find', query: 'shoes' },
      { type: 'search', at: NOW - 3_000, url: 'http://shop.test/find', query: 'boots' },
      tap('Trail runners', NOW - 2_000),
      page('/a', NOW - 1_000),
      page('/b', NOW),
    ];
    expect(judge(events).evidence).not.toContain('search-then-hop');
    expect(judge(events).tier).toBe('none');
  });

  it('does not treat tabbing through a form as abandoning it', () => {
    const events: LostTrailEvent[] = [page('/apply', NOW - 2_000), page('/next', NOW), tap('Help', NOW)];
    expect(judge(events).tier).toBe('none');
  });

  it('nudges when a form was actually filled in and then left, on top of another signal', () => {
    const events: LostTrailEvent[] = [
      page('/apply', NOW - 3_000),
      { type: 'edit', at: NOW - 2_000, url: 'http://shop.test/apply', field: 'Email' },
      { type: 'edit', at: NOW - 1_500, url: 'http://shop.test/apply', field: 'Name' },
      page('/next', NOW - 500),
      tap('Help', NOW),
    ];
    expect(judge(events).tier).toBe('nudge');
    expect(judge(events).evidence).toEqual(expect.arrayContaining(['form-left', 'help']));
  });

  it('opens the full guide after two searches that never resolve and then more hops', () => {
    const events: LostTrailEvent[] = [
      { type: 'search', at: NOW - 4_000, url: 'http://shop.test/find', query: 'shoes' },
      { type: 'search', at: NOW - 3_000, url: 'http://shop.test/find', query: 'boots' },
      page('/a', NOW - 1_000),
      page('/b', NOW),
    ];
    expect(judge(events)).toMatchObject({ tier: 'full', strong: true });
    expect(judge(events).evidence).toContain('search-then-hop');
  });

  it('does not call a checkout after a 404 wandering, including a funnel from the site profile', () => {
    const error: LostTrailEvent = { type: 'error', at: NOW - 4_000, url: 'http://shop.test/missing', kind: 'page' };
    expect(judge([error, ...pages(['/checkout', '/checkout/shipping', '/checkout/payment'], 1_000)]).tier).toBe('none');

    const custom = [error, page('/bag', NOW - 2_000), page('/ship', NOW - 1_000), page('/pay', NOW)];
    expect(judge(custom).tier).toBe('full');
    const profile: SiteProfile = {
      version: LOST_MODEL_VERSION,
      listings: [],
      help: [],
      search: [],
      funnels: [['/bag', '/ship', '/pay']],
    };
    expect(judge(custom, profile).tier).toBe('none');
  });

  it('treats a short return through one section plus help as browsing, and a listing as a catalog', () => {
    const events = [...pages(['/docs', '/docs/getting-started', '/docs', '/docs/billing', '/docs', '/docs/privacy'], 1_000), tap('Help', NOW)];
    expect(judge(events).tier).toBe('none');
    const profile: SiteProfile = {
      version: LOST_MODEL_VERSION,
      listings: ['/docs/:id'],
      help: ['/docs'],
      search: [],
      funnels: [],
    };
    const listed = judge(events, profile);
    expect(listed.tier).toBe('none');
    expect(listed.recovered).toContain('catalog');
  });

  it('treats a docs circle as reading and a navbar circle as lost', () => {
    const guide = ['/guide/install', '/guide/api', '/guide/setup', '/guide/auth', '/guide/billing', '/guide/privacy', '/guide/install', '/guide/api'];
    const circle = [...pages(guide, 1_000), tap('Help', NOW)];
    const reading: SiteProfile = { version: LOST_MODEL_VERSION, listings: [], help: [], search: [], funnels: [], reading: ['/guide'] };
    expect(judge(circle).tier).toBe('nudge');
    expect(judge(circle, reading)).toMatchObject({ tier: 'none', motion: 'reading' });
    expect(judge(circle, reading, NOW, { readingCircles: 'soft' }).tier).toBe('nudge');
    expect(judge(circle, reading, NOW, { readingCircles: 'lost' })).toMatchObject({ tier: 'nudge', motion: 'circling' });

    const sections = ['/pricing', '/about', '/blog', '/careers'];
    const nav: SiteProfile = { version: LOST_MODEL_VERSION, listings: [], help: [], search: [], funnels: [], sections };
    expect(judge(pages(sections, 1_000), nav)).toMatchObject({ tier: 'none', score: 0, motion: 'sections' });
    const navCircle = [...pages([...sections, '/pricing', '/about'], 1_000), tap('Help', NOW)];
    expect(judge(navCircle, nav)).toMatchObject({ tier: 'nudge', motion: 'circling' });
  });

  it('does not treat a sequence of navbar labels as thrashing', () => {
    const labels = ['Pricing', 'About', 'Blog', 'Careers', 'Docs', 'Support'];
    const events = labels.map((label, index) => tap(label, NOW - 1_000 + index * 10));
    events.push(tap('Help', NOW));
    expect(judge(events).tier).toBe('nudge');
    const nav: SiteProfile = {
      version: LOST_MODEL_VERSION,
      listings: [],
      help: [],
      search: [],
      funnels: [],
      sectionLabels: labels,
    };
    expect(judge(events, nav)).toMatchObject({ tier: 'none', motion: 'sections' });
  });

  it('lets the owner turn reading signals on and circles off', () => {
    const stuck = [page('/account', NOW - 45_000)];
    expect(judge(stuck, undefined, NOW, { rules: { 'dwell-flat': { weight: 16 } } }).evidence).toContain('dwell-flat');

    const loop = pages(['/a', '/b', '/c', '/d', '/e', '/f', '/a', '/b'], 1_000);
    const quiet = judge(loop, undefined, NOW, { disabled: ['circle-4', 'circle-6'] });
    expect(quiet).toMatchObject({ tier: 'none', score: 0 });

    const config = resolveConfig({ siteKey: 'pk', lost: { readingCircles: 'soft', nudgeScore: 30 } });
    expect(config.lost).toMatchObject({ readingCircles: 'soft', nudgeScore: 30, fullScore: FULL_SCORE, decayMs: DECAY_MS, minCirclePages: 4, relatedCirclePages: 6 });
  });

  it('does not call docs or a navbar tour after a 404 wandering', () => {
    const error: LostTrailEvent = { type: 'error', at: NOW - 4_000, url: 'http://shop.test/missing', kind: 'page' };
    const docs = [error, ...pages(['/guide/a', '/guide/b', '/guide/c'], 1_000)];
    const reading: SiteProfile = { version: LOST_MODEL_VERSION, listings: [], help: [], search: [], funnels: [], reading: ['/guide'] };
    expect(judge(docs).tier).toBe('full');
    expect(judge(docs, reading).tier).toBe('none');

    const tour = [error, ...pages(['/pricing', '/about', '/blog'], 1_000)];
    const nav: SiteProfile = {
      version: LOST_MODEL_VERSION,
      listings: [],
      help: [],
      search: [],
      funnels: [],
      sections: ['/pricing', '/about', '/blog'],
    };
    expect(judge(tour).tier).toBe('full');
    expect(judge(tour, nav).tier).toBe('none');
  });

  it('scores a long unrelated circle above a catalog or add and drop circle', () => {
    const products = [...pages(['/products/1', '/products/2', '/products/1', '/products/2'], 1_000), tap('Help', NOW)];
    expect(judge(products).tier).toBe('none');
    expect(judge(products).evidence).not.toContain('circle-4');

    const longCatalog = [
      ...pages(['/products/1', '/products/2', '/products/3', '/products/4', '/products/5', '/products/6', '/products/1', '/products/2'], 1_000),
      tap('Help', NOW),
    ];
    const catalog = judge(longCatalog);
    expect(catalog.tier).toBe('nudge');
    expect(catalog.score).toBeLessThan(FULL_SCORE);
    expect(catalog.evidence).toContain('circle-4');

    const classes = ['/classes/add', '/classes/drop', '/classes/waitlist', '/classes/swap', '/classes/add'];
    expect(judge([...pages(classes, 1_000), tap('Help', NOW)]).tier).toBe('none');

    const wide = judge([...pages(['/billing', '/orders', '/account', '/settings', '/billing', '/orders'], 1_000), tap('Help', NOW)]);
    expect(wide.tier).toBe('nudge');
    expect(wide.evidence).toEqual(expect.arrayContaining(['circle-4', 'help']));
    expect(wide.score).toBeGreaterThan(catalog.score);
  });

  it('lets the owner shorten a circle and group paths that do not share a parent', () => {
    const short = [...pages(['/billing', '/orders', '/billing', '/orders'], 1_000), tap('Help', NOW)];
    expect(judge(short).tier).toBe('none');
    expect(judge(short, undefined, NOW, { minCirclePages: 2 }).tier).toBe('nudge');

    const mixed = [...pages(['/catalog', '/add', '/drop', '/waitlist', '/catalog', '/add'], 1_000), tap('Help', NOW)];
    expect(judge(mixed).tier).toBe('nudge');
    const grouped: SiteProfile = {
      version: LOST_MODEL_VERSION,
      listings: [],
      help: [],
      search: [],
      funnels: [],
      related: [['/catalog', '/add', '/drop', '/waitlist', '/swap', '/search']],
    };
    expect(judge(mixed, grouped).tier).toBe('none');

    const longer = [...pages(['/catalog', '/add', '/drop', '/waitlist', '/swap', '/search', '/catalog', '/add'], 1_000), tap('Help', NOW)];
    expect(judge(longer).tier).toBe('full');
    const groupedLong = judge(longer, grouped);
    expect(groupedLong.tier).toBe('nudge');
    expect(groupedLong.score).toBeLessThan(judge(longer).score);
  });

  it('counts repeated clicks that are not tabs or filters', () => {
    const plain = [page('/shop', NOW - 2_000), ...[0, 1, 2, 3, 4, 5].map((i) => tap('Apply', NOW - 1_000 + i * 10)), tap('Help', NOW)];
    expect(judge(plain).tier).toBe('nudge');
    const filters = [page('/shop', NOW - 2_000), ...[0, 1, 2, 3, 4, 5].map((i) => tap('Color', NOW - 1_000 + i * 10, { inPage: true })), tap('Help', NOW)];
    expect(judge(filters).tier).toBe('none');
  });
});

describe('integration-guide crawl', () => {
  it('marks help, search, and listings from fetched html', () => {
    const profile = profileFromPages([
      {
        url: 'http://shop.test/',
        html: [
          '<a href="/support">Contact</a>',
          '<a href="/products/1">One</a>',
          '<a href="/products/2">Two</a>',
          '<a href="/cart">Cart</a>',
          '<a href="/checkout">Checkout</a>',
          '<a href="/checkout/payment">Payment</a>',
          '<input type="search" name="q">',
        ].join(''),
      },
      { url: 'http://shop.test/team', html: '<input placeholder="research interests">' },
    ]);
    expect(profile.version).toBe(LOST_MODEL_VERSION);
    expect(profile.help).toContain('/support');
    expect(profile.listings).toContain('/products/:id');
    expect(profile.search).toContain('/');
    expect(profile.search).not.toContain('/team');
    expect(profile.funnels).toEqual([]);
  });

  it('waits between requests and skips disallowed and off-origin urls', async () => {
    const seen: string[] = [];
    const sleep = vi.fn(async () => {});
    const html = [
      '<a href="/about">About</a>',
      '<a href="/secret/staff">Secret</a>',
      '<a href="https://evil.test/phish">Phish</a>',
      '<a href="/support">Contact</a>',
      '<a rel="nofollow" href="/private">Skip</a>',
    ].join('');
    const bodies: Record<string, string> = {
      'http://shop.test/robots.txt': 'User-agent: *\nDisallow: /secret\n',
      'http://shop.test/': html,
      'http://shop.test/about': '<p>About</p>',
      'http://shop.test/support': '<p>Help</p>',
    };
    const fetchImpl = async (url: string): Promise<FetchedPage> => {
      seen.push(url);
      const body = bodies[url];
      if (!body) return { ok: false, text: async () => '' };
      const type = url.endsWith('robots.txt') ? 'text/plain' : 'text/html';
      return { ok: true, headers: { get: () => type }, text: async () => body };
    };

    const profile = await politeCrawl('http://shop.test/', fetchImpl, { delayMs: 1000, sleep, maxPages: 8 });
    expect(seen).toContain('http://shop.test/robots.txt');
    expect(seen).toContain('http://shop.test/about');
    expect(seen.some((url) => url.includes('secret') || url.includes('evil.test') || url.includes('/private'))).toBe(false);
    expect(sleep.mock.calls.length).toBe(seen.length - 1);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(profile.help).toContain('/support');
  });
});

describe('lost detector', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('does not nudge for one help click', () => {
    const harness = setup(lostDetector);
    cleanup = harness.cleanup;
    harness.breadcrumbs.add('click', { label: 'Help' });
    expect(harness.triggers.filter((trigger) => trigger.type === 'lost')).toHaveLength(0);
  });

  it('opens the full guide with a rule version after a 404 and unrelated pages', () => {
    const harness = setup(lostDetector);
    cleanup = harness.cleanup;
    harness.breadcrumbs.add('error', { kind: 'page', status: 404 });
    for (const path of ['/news', '/account', '/search']) {
      vi.advanceTimersByTime(50);
      harness.breadcrumbs.add('page_view', { title: path, identity: path });
    }
    const lost = harness.triggers.filter((trigger) => trigger.type === 'lost');
    expect(lost).toHaveLength(1);
    expect(lost[0].context).toMatchObject({ tier: 'full', strong: true, version: LOST_MODEL_VERSION });
  });

  it('ignores filter toggles and still notices repeated clicks on a plain control', () => {
    // The harness does not write click breadcrumbs (the SDK shell does). Add the trail entry,
    // then click so the detector can mark tabs and filters as in-page.
    const press = (harness: ReturnType<typeof setup>, el: Element, label: string) => {
      harness.breadcrumbs.add('click', { label });
      click(el);
    };

    document.body.innerHTML = '<button id="filter" aria-expanded="false">Color</button><button id="help">Help</button>';
    const filters = setup(lostDetector);
    cleanup = filters.cleanup;
    for (let i = 0; i < 6; i++) press(filters, document.getElementById('filter')!, 'Color');
    vi.advanceTimersByTime(20);
    press(filters, document.getElementById('help')!, 'Help');
    expect(filters.triggers.filter((trigger) => trigger.type === 'lost')).toHaveLength(0);
    filters.cleanup();
    sessionStorage.clear();

    document.body.innerHTML = '<button id="apply">Apply</button><button id="help">Help</button>';
    const plain = setup(lostDetector);
    cleanup = plain.cleanup;
    for (let i = 0; i < 6; i++) press(plain, document.getElementById('apply')!, 'Apply');
    vi.advanceTimersByTime(20);
    press(plain, document.getElementById('help')!, 'Help');
    expect(plain.triggers.filter((trigger) => trigger.type === 'lost').map((trigger) => trigger.context.tier)).toEqual(['nudge']);
  });

  it('ignores keyboard focus and counts fields whose values changed', () => {
    document.body.innerHTML = '<input id="email" name="email"><input id="name" name="name">';
    const focused = setup(lostDetector);
    cleanup = focused.cleanup;
    focused.breadcrumbs.add('page_view', { title: 'Apply', identity: '/apply' });
    vi.advanceTimersByTime(20);
    document.getElementById('email')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    document.getElementById('name')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(20);
    focused.breadcrumbs.add('page_view', { title: 'Next', identity: '/next' });
    vi.advanceTimersByTime(20);
    focused.breadcrumbs.add('click', { label: 'Help' });
    expect(focused.triggers.filter((trigger) => trigger.type === 'lost')).toHaveLength(0);
    focused.cleanup();
    sessionStorage.clear();

    const typed = setup(lostDetector);
    cleanup = typed.cleanup;
    typed.breadcrumbs.add('page_view', { title: 'Apply', identity: '/apply' });
    vi.advanceTimersByTime(20);
    fill(document.getElementById('email') as HTMLInputElement, 'a@b.c');
    fill(document.getElementById('name') as HTMLInputElement, 'Ada');
    vi.advanceTimersByTime(20);
    typed.breadcrumbs.add('page_view', { title: 'Next', identity: '/next' });
    vi.advanceTimersByTime(20);
    typed.breadcrumbs.add('click', { label: 'Help' });
    expect(typed.triggers.filter((trigger) => trigger.type === 'lost').map((trigger) => trigger.context.tier)).toEqual(['nudge']);
  });

  it('does not treat a research field as search, and does treat a search box', () => {
    document.body.innerHTML = '<input id="q" placeholder="research interests">';
    const research = setup(lostDetector);
    cleanup = research.cleanup;
    const field = document.getElementById('q') as HTMLInputElement;
    field.value = 'shoes';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);
    field.value = 'boots';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);
    research.breadcrumbs.add('page_view', { title: 'A', identity: '/a' });
    vi.advanceTimersByTime(20);
    research.breadcrumbs.add('page_view', { title: 'B', identity: '/b' });
    expect(research.triggers.filter((trigger) => trigger.type === 'lost')).toHaveLength(0);
    research.cleanup();
    sessionStorage.clear();

    document.body.innerHTML = '<input id="q" type="search">';
    const search = setup(lostDetector);
    cleanup = search.cleanup;
    const box = document.getElementById('q') as HTMLInputElement;
    box.value = 'shoes';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);
    box.value = 'boots';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(400);
    search.breadcrumbs.add('page_view', { title: 'A', identity: '/a' });
    vi.advanceTimersByTime(20);
    search.breadcrumbs.add('page_view', { title: 'B', identity: '/b' });
    expect(search.triggers.filter((trigger) => trigger.type === 'lost').map((trigger) => trigger.context.tier)).toEqual(['full']);
    expect(search.triggers[0].context.query).toBe('boots');
  });
});
