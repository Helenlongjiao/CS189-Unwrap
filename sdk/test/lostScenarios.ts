import { vi } from 'vitest';
import type { Breadcrumbs } from '../src/breadcrumbs';
import { click, type } from './harness';

/**
 * Replayable user stories for the lost benchmark (`lostBenchmark.ts`).
 *
 * **competent_navigation** — Normal use (shopping, reading, completing tasks). Any lost nudge/full
 * counts as a **false positive** in the benchmark rate, not as a per-story test failure.
 *
 * **stuck** — User is lost; used for true-positive rate.
 */
export type LostStoryKind = 'competent_navigation' | 'stuck';

export type CompetentTag = 'shopping' | 'reading' | 'search' | 'forms' | 'banking';

export interface LostTrail {
  navigate: (path: string, title?: string) => void;
  click: (label: string) => void;
  error: (kind: string) => void;
  focusField: (name: string, fieldLabel: string) => void;
  submit: () => void;
  scrollY: (y: number) => Promise<void>;
  search: (query: string) => Promise<void>;
  tick: (ms: number) => Promise<void>;
  breadcrumbs: Breadcrumbs;
}

interface LostStoryBase {
  id: string;
  source: string;
  what: string;
  html?: string;
  prepare?: () => void;
  play: (trail: LostTrail) => Promise<void>;
}

export type LostScenario =
  | (LostStoryBase & { kind: 'competent_navigation'; tags: CompetentTag[] })
  | (LostStoryBase & { kind: 'stuck'; expectTier: 'nudge' | 'full' });

export function createTrail(breadcrumbs: Breadcrumbs, tick: (ms: number) => Promise<void>): LostTrail {
  const navigate = (path: string, title = path) => {
    const pathname = path.startsWith('/') ? path : `/${path}`;
    history.pushState({}, '', pathname);
    document.title = title;
    breadcrumbs.add('page_view', { title });
  };

  const clickLabel = (label: string) => {
    breadcrumbs.add('click', { label });
  };

  return {
    breadcrumbs,
    navigate,
    click: clickLabel,
    error: (kind) => breadcrumbs.add('error', { kind }),
    focusField: (name, fieldLabel) => breadcrumbs.add('focus', { field: fieldLabel, name }),
    submit: () => breadcrumbs.add('submit', {}),
    async scrollY(y: number) {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
      document.documentElement.scrollTop = y;
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      await tick(250);
    },
    async search(query: string) {
      const input = document.querySelector<HTMLInputElement>('input[data-pulse-search]');
      if (!input) throw new Error('lost scenario needs `<input type="search" data-pulse-search />` in html');
      type(input, query);
      await tick(450);
    },
    tick,
  };
}

export const tick: (ms: number) => Promise<void> = (ms) => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

export const lostScenarios: LostScenario[] = [
  // ───────────────────────── stuck (true positives) ─────────────────────────
  {
    id: 'stuck-error-then-wander',
    kind: 'stuck',
    source: 'Skyline Air · Broken checkout link',
    expectTier: 'full',
    what: 'After a 404, hops across four more pages without finishing anything',
    play: async (t) => {
      t.navigate('/', 'Home');
      t.error('page');
      await t.tick(2_000);
      for (const path of ['/flights', '/seats', '/bags', '/pay']) {
        t.navigate(path);
        await t.tick(1_500);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-checkout-cart-loop',
    kind: 'stuck',
    source: 'Northline · Checkout',
    expectTier: 'full',
    what: 'Pings checkout and cart back and forth, then opens Help',
    play: async (t) => {
      t.navigate('/', 'Home');
      for (let i = 0; i < 5; i++) {
        t.navigate(i % 2 === 0 ? '/checkout' : '/cart', i % 2 === 0 ? 'Checkout' : 'Cart');
        await t.tick(3_000);
      }
      t.click('Help');
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-sale-revisit',
    kind: 'stuck',
    source: 'Northline · Promotions',
    expectTier: 'full',
    what: 'Opens the same sale page five times in two minutes',
    play: async (t) => {
      t.navigate('/', 'Home');
      for (let i = 0; i < 5; i++) {
        t.navigate('/sale', 'Sale');
        await t.tick(8_000);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-help-once',
    kind: 'stuck',
    source: 'Westbridge · Help',
    expectTier: 'nudge',
    what: 'Clicks Help once and stays on one page',
    play: async (t) => {
      t.navigate('/courses', 'Courses');
      t.click('Help');
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-dwell-no-click',
    kind: 'stuck',
    source: 'Linden Clinic · FAQ',
    expectTier: 'nudge',
    what: 'Stays on one page almost a minute without clicking anything',
    play: async (t) => {
      t.navigate('/faq', 'FAQ');
      await t.tick(50_000);
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-search-twice-no-click',
    kind: 'stuck',
    source: 'Northline · Shop search',
    expectTier: 'full',
    what: 'Tries two different queries and still never clicks a result',
    html: '<input type="search" data-pulse-search placeholder="Search products" />',
    play: async (t) => {
      t.navigate('/shop', 'Shop');
      await t.search('boots');
      await t.tick(3_000);
      await t.search('rain jacket');
      await t.tick(20_000);
      await t.tick(6_000);
    },
  },

  // ───────────────────── competent navigation (false positives) ─────────────────────
  {
    id: 'competent-shop-to-checkout',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Northline · Happy path',
    what: 'Home → category → product → cart → checkout with normal pauses and add-to-bag',
    play: async (t) => {
      t.navigate('/', 'Home');
      await t.tick(8_000);
      t.click('Men');
      t.navigate('/category/men', 'Men');
      await t.tick(10_000);
      t.click('Winter coat');
      t.navigate('/product/winter-coat', 'Winter coat');
      await t.tick(12_000);
      t.click('Add to bag');
      t.navigate('/cart', 'Cart');
      await t.tick(10_000);
      t.click('Checkout');
      t.navigate('/checkout', 'Checkout');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-browse-three-products',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Northline · Product grid',
    what: 'Clicks through three product pages in under a minute, then leaves',
    play: async (t) => {
      t.navigate('/shop', 'Shop');
      for (const slug of ['boots', 'jacket', 'beanie']) {
        t.click(`View ${slug}`);
        t.navigate(`/product/${slug}`, slug);
        await t.tick(9_000);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-compare-pick-one',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Northline · Compare',
    what: 'Opens two products, adds one, goes to cart (brief back-and-forth, not panic)',
    play: async (t) => {
      t.navigate('/shop', 'Shop');
      t.navigate('/product/runner-a', 'Runner A');
      await t.tick(11_000);
      t.navigate('/product/runner-b', 'Runner B');
      await t.tick(14_000);
      t.click('Add to bag');
      t.navigate('/cart', 'Cart');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-search-then-result',
    kind: 'competent_navigation',
    tags: ['shopping', 'search'],
    source: 'Northline · Shop',
    what: 'Searches once and clicks a result',
    html: '<input type="search" data-pulse-search placeholder="Search products" />',
    play: async (t) => {
      t.navigate('/shop', 'Shop');
      await t.search('hiking boots');
      await t.tick(3_000);
      t.click('Hiking boots · size 10');
      t.navigate('/product/boots', 'Boots');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-filter-then-product',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Northline · Filters',
    what: 'Taps in-page filters, then opens one product',
    play: async (t) => {
      t.navigate('/shop', 'Shop');
      t.click('Size 10');
      await t.tick(2_000);
      t.click('Waterproof');
      await t.tick(3_000);
      t.click('Trail running');
      t.navigate('/product/trail-x', 'Trail X');
      await t.tick(8_000);
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-read-policy',
    kind: 'competent_navigation',
    tags: ['reading'],
    source: 'Linden Clinic · FAQ',
    what: 'Reads a single policy page and scrolls down steadily',
    html: '<main style="height:2000px">Policy text</main>',
    play: async (t) => {
      t.navigate('/policy', 'Return policy');
      await t.scrollY(0);
      await t.tick(5_000);
      await t.scrollY(220);
      await t.tick(5_000);
      await t.scrollY(480);
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-read-article-pauses',
    kind: 'competent_navigation',
    tags: ['reading'],
    source: 'Westbridge · News',
    what: 'Stays on one article with slow scrolling (reading, not stuck)',
    html: '<article style="height:2400px">Campus news</article>',
    play: async (t) => {
      t.navigate('/news/financial-aid', 'Financial aid update');
      await t.scrollY(0);
      await t.tick(12_000);
      await t.scrollY(180);
      await t.tick(18_000);
      await t.scrollY(400);
      await t.tick(15_000);
      await t.scrollY(620);
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-pay-on-one-screen',
    kind: 'competent_navigation',
    tags: ['banking', 'forms'],
    source: 'Harbor CU · Billing',
    what: 'Pays a balance on a single page and submits',
    play: async (t) => {
      t.navigate('/billing', 'Billing');
      t.click('Pay balance');
      t.focusField('amount', 'Amount');
      t.submit();
      await t.tick(6_000);
    },
  },
];

export const competentNavigationStories = lostScenarios.filter((s) => s.kind === 'competent_navigation');
export const stuckUserStories = lostScenarios.filter((s) => s.kind === 'stuck');
