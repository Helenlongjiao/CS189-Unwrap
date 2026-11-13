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
  /** Held-out stories are reported but excluded from CI gates (anti-overfitting). */
  heldOut?: boolean;
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

export const lostTruePositiveTargets: LostScenario[] = [
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
    what: 'Stays on FAQ but scrolls up and down without clicking (not calm reading)',
    html: '<main style="height:3000px">FAQ</main>',
    play: async (t) => {
      t.navigate('/faq', 'FAQ');
      await t.tick(20_000);
      for (const y of [0, 500, 120, 520, 80, 480]) {
        await t.scrollY(y);
        await t.tick(5_000);
      }
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
  {
    id: 'stuck-form-then-leave',
    kind: 'stuck',
    source: 'Linden Clinic · Refill',
    expectTier: 'full',
    what: 'Touches three refill fields, abandons to home, then opens Help',
    play: async (t) => {
      t.navigate('/refill', 'Refill');
      t.focusField('rx', 'Prescription number');
      t.focusField('pharmacy', 'Pharmacy');
      t.focusField('notes', 'Notes');
      await t.tick(5_000);
      t.navigate('/home', 'Home');
      t.click('Help');
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-clicks-same-page',
    kind: 'stuck',
    source: 'Northline · Filters',
    expectTier: 'nudge',
    what: 'Clicks many filters on the shop without navigating away',
    play: async (t) => {
      t.navigate('/shop', 'Shop');
      for (const label of ['Size 10', 'Blue', 'Waterproof', 'Sale', 'Trail', 'Wide', 'In stock', 'Sort by']) {
        t.click(label);
        await t.tick(1_500);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-scroll-reversal',
    kind: 'stuck',
    source: 'Linden Clinic · FAQ',
    expectTier: 'nudge',
    what: 'Scrolls up and down the FAQ without settling',
    html: '<main style="height:3000px">FAQ</main>',
    play: async (t) => {
      t.navigate('/faq', 'FAQ');
      const ys = [0, 480, 120, 520, 80, 560, 200];
      for (const y of ys) {
        await t.scrollY(y);
        await t.tick(3_000);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-back-button-spam',
    kind: 'stuck',
    source: 'Northline · Checkout',
    expectTier: 'full',
    what: 'Rapid checkout ↔ cart alternation',
    play: async (t) => {
      t.navigate('/checkout', 'Checkout');
      for (let i = 0; i < 5; i++) {
        t.navigate(i % 2 === 0 ? '/cart' : '/checkout', i % 2 === 0 ? 'Cart' : 'Checkout');
        await t.tick(2_000);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-js-error-wander',
    kind: 'stuck',
    source: 'Linden Clinic · Billing',
    expectTier: 'full',
    what: 'JS error on pay, then wanders across three pages',
    play: async (t) => {
      t.navigate('/billing', 'Billing');
      t.click('Pay balance');
      t.error('js');
      await t.tick(2_000);
      for (const path of ['/records', '/messages', '/appointments']) {
        t.navigate(path, path);
        await t.tick(2_000);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-search-help-hop',
    kind: 'stuck',
    source: 'Northline · Shop',
    expectTier: 'full',
    what: 'Search, Help, then three quick hops',
    html: '<input type="search" data-pulse-search placeholder="Search" />',
    play: async (t) => {
      t.navigate('/shop', 'Shop');
      await t.search('refund');
      t.click('Help');
      await t.tick(3_000);
      for (const path of ['/returns', '/shipping', '/contact']) {
        t.navigate(path, path);
        await t.tick(2_500);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-bounce-pages',
    kind: 'stuck',
    source: 'Westbridge · Calendar',
    expectTier: 'nudge',
    what: 'Very short visits on three pages in a row',
    play: async (t) => {
      for (const path of ['/calendar', '/deadlines', '/aid', '/registration']) {
        t.navigate(path, path);
        await t.tick(1_500);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-repeated-same-link',
    kind: 'stuck',
    source: 'Harbor CU · Transfers',
    expectTier: 'nudge',
    what: 'Clicks the same Review transfer label four times',
    play: async (t) => {
      t.navigate('/transfer', 'Transfer');
      for (let i = 0; i < 4; i++) {
        t.click('Review transfer');
        await t.tick(2_000);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-sw-promo-apply-spam',
    kind: 'stuck',
    source: 'Southwest · Checkout',
    expectTier: 'nudge',
    what: 'Clicks promo Apply many times with no navigation',
    play: async (t) => {
      t.navigate('/checkout.html', 'Payment');
      for (let i = 0; i < 5; i++) {
        t.click('Apply');
        await t.tick(2_000);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-lulu-size-6-then-help',
    kind: 'stuck',
    source: 'Lululemon · Product',
    expectTier: 'nudge',
    what: 'Mashes unavailable size 6 then opens Help',
    play: async (t) => {
      t.navigate('/product.html', 'Align High-Rise Pant');
      for (let i = 0; i < 5; i++) {
        t.click('6');
        await t.tick(1_500);
      }
      t.click('Help');
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-sw-404-then-hop',
    kind: 'stuck',
    source: 'Southwest · Flights',
    expectTier: 'full',
    what: 'Broken seat-map path (page error) then wanders across four booking steps',
    play: async (t) => {
      t.navigate('/flights.html', 'Flights');
      t.click('View seat map');
      t.error('page');
      await t.tick(2_000);
      for (const path of ['/bags.html', '/passengers.html', '/check-in.html', '/checkout.html']) {
        t.navigate(path, path);
        await t.tick(2_000);
      }
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-amazon-prime-filter-dead-end',
    kind: 'stuck',
    source: 'Amazon · Search',
    expectTier: 'full',
    what: 'Clicks Prime only repeatedly, then searches without choosing a product',
    html: '<input type="search" data-pulse-search placeholder="Search Amazon" />',
    play: async (t) => {
      t.navigate('/search.html', 'Search results');
      for (let i = 0; i < 5; i++) {
        t.click('Prime only');
        await t.tick(1_500);
      }
      await t.search('kettle');
      await t.tick(20_000);
      await t.tick(6_000);
    },
  },
  {
    id: 'stuck-expedia-fare-hop',
    kind: 'stuck',
    source: 'Expedia · Trips',
    expectTier: 'full',
    what: 'Bounces across trips, support, and cancellation without booking',
    play: async (t) => {
      t.navigate('/trips.html', 'Trips');
      await t.tick(2_000);
      t.navigate('/support.html', 'Support');
      await t.tick(2_000);
      t.navigate('/cancellation.html', 'Cancellation');
      await t.tick(2_000);
      t.navigate('/hotels.html', 'Hotels');
      await t.tick(2_000);
      t.navigate('/cars.html', 'Cars');
      await t.tick(2_000);
      t.click('Help');
      await t.tick(6_000);
    },
  },
];

export const lostFalsePositiveGuards: LostScenario[] = [
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
    id: 'competent-read-afk-policy',
    kind: 'competent_navigation',
    tags: ['reading'],
    source: 'Linden Clinic · FAQ',
    what: 'AFK on a policy page for almost a minute without clicking (reading)',
    play: async (t) => {
      t.navigate('/policy', 'Return policy');
      await t.tick(55_000);
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
  {
    id: 'competent-returns-policy',
    kind: 'competent_navigation',
    tags: ['reading'],
    source: 'Northline · Returns',
    what: 'Opens returns help and reads without using the global Help control',
    html: '<main style="height:1800px">Returns policy</main>',
    play: async (t) => {
      t.navigate('/returns', 'Returns');
      t.click('How returns work');
      await t.scrollY(0);
      await t.tick(8_000);
      await t.scrollY(300);
      await t.tick(10_000);
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-size-guide',
    kind: 'competent_navigation',
    tags: ['reading', 'shopping'],
    source: 'Northline · Size guide',
    what: 'Size guide → back to product → add to bag',
    play: async (t) => {
      t.navigate('/product/boots', 'Boots');
      t.click('Size guide');
      t.navigate('/size-guide', 'Size guide');
      await t.tick(15_000);
      t.navigate('/product/boots', 'Boots');
      await t.tick(8_000);
      t.click('Add to bag');
      t.navigate('/cart', 'Cart');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-harbor-transfer-happy',
    kind: 'competent_navigation',
    tags: ['banking'],
    source: 'Harbor CU · Transfers',
    what: 'Accounts → transfer → submit → confirmation',
    play: async (t) => {
      t.navigate('/accounts', 'Accounts');
      await t.tick(15_000);
      t.click('Transfer money');
      t.navigate('/transfer', 'Transfer');
      t.focusField('amount', 'Amount');
      t.focusField('to', 'To account');
      t.submit();
      t.navigate('/transfer/done', 'Done');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-harbor-rates-peek',
    kind: 'competent_navigation',
    tags: ['banking'],
    source: 'Harbor CU · Rates',
    what: 'Views rates once and returns home to open an account',
    play: async (t) => {
      t.navigate('/', 'Home');
      await t.tick(10_000);
      t.navigate('/rates', 'Rates');
      await t.tick(12_000);
      t.navigate('/', 'Home');
      await t.tick(8_000);
      t.click('Open account');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-westbridge-course-pick',
    kind: 'competent_navigation',
    tags: ['forms'],
    source: 'Westbridge · Courses',
    what: 'Picks one course and completes registration',
    play: async (t) => {
      t.navigate('/courses', 'Courses');
      await t.tick(10_000);
      t.click('MATH 101');
      t.navigate('/courses/math-101', 'MATH 101');
      t.focusField('crn', 'CRN');
      t.focusField('units', 'Units');
      t.submit();
      t.navigate('/registration/confirmed', 'Confirmed');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-linden-refill',
    kind: 'competent_navigation',
    tags: ['forms'],
    source: 'Linden Clinic · Refill',
    what: 'Completes a prescription refill and submits',
    play: async (t) => {
      t.navigate('/refill', 'Refill');
      t.focusField('rx', 'Prescription number');
      t.focusField('pharmacy', 'Pharmacy');
      t.submit();
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-skyline-seats',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Skyline Air · Seats',
    what: 'Flights → seat map → checkout (linear)',
    play: async (t) => {
      t.navigate('/flights', 'Flights');
      await t.tick(10_000);
      t.navigate('/seats', 'Seat map');
      await t.tick(12_000);
      t.click('Continue');
      t.navigate('/checkout', 'Checkout');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-carousel-browse',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Northline · Product',
    what: 'Uses in-page gallery next controls without changing URL',
    play: async (t) => {
      t.navigate('/product/coat', 'Coat');
      for (const i of [1, 2, 3, 4]) {
        t.click(`Gallery next ${i}`);
        await t.tick(2_000);
      }
      t.click('Add to bag');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-menu-explore',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Northline · Nav',
    what: 'Opens menu and visits three departments',
    play: async (t) => {
      t.navigate('/', 'Home');
      t.click('Menu');
      await t.tick(2_000);
      t.click('Women');
      t.navigate('/women', 'Women');
      await t.tick(15_000);
      t.click('Sale');
      t.navigate('/sale', 'Sale');
      await t.tick(15_000);
      t.click('Help center');
      t.navigate('/help', 'Help center');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-amazon-search-to-pdp',
    kind: 'competent_navigation',
    tags: ['shopping', 'search'],
    source: 'Amazon · Search',
    what: 'Search results to product (not the dead Prime filter)',
    html: '<input type="search" data-pulse-search placeholder="Search Amazon" />',
    play: async (t) => {
      t.navigate('/search.html', 'Search results');
      await t.search('earbuds');
      await t.tick(3_000);
      t.click('PulseBuds Pro');
      t.navigate('/product-earbuds.html', 'PulseBuds Pro');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-lulu-read-product-afk',
    kind: 'competent_navigation',
    tags: ['reading', 'shopping'],
    source: 'Lululemon · Product',
    what: 'AFK on the PDP reading copy without clicking',
    play: async (t) => {
      t.navigate('/product.html', 'Align High-Rise Pant');
      await t.tick(65_000);
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-amazon-pdp-afk',
    kind: 'competent_navigation',
    tags: ['reading', 'shopping'],
    source: 'Amazon · Product',
    what: 'Stays on a product page reading details (no Buy Now spam)',
    play: async (t) => {
      t.navigate('/product-earbuds.html', 'PulseBuds Pro');
      await t.tick(50_000);
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-lulu-product-to-bag',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Lululemon · Product',
    what: 'Picks in-stock size 2 and adds Align pant to bag',
    play: async (t) => {
      t.navigate('/product.html', 'Align High-Rise Pant');
      t.click('2');
      await t.tick(8_000);
      t.click('Add to bag');
      t.navigate('/cart.html', 'Bag');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-expedia-select-trip',
    kind: 'competent_navigation',
    tags: ['shopping'],
    source: 'Expedia · Flights',
    what: 'Flights list → trip summary without looping',
    play: async (t) => {
      t.navigate('/flights.html', 'Flights');
      await t.tick(12_000);
      t.click('Select');
      t.navigate('/trip.html', 'Trip');
      await t.tick(10_000);
      t.click('Continue to checkout');
      t.navigate('/checkout.html', 'Checkout');
      await t.tick(6_000);
    },
  },
  {
    id: 'competent-sw-flight-purchase',
    kind: 'competent_navigation',
    tags: ['shopping', 'forms'],
    source: 'Southwest · Flights',
    what: 'Flights → seats → checkout → fills card (no dead promo spam)',
    play: async (t) => {
      t.navigate('/flights.html', 'Flights');
      await t.tick(10_000);
      t.navigate('/seats.html', 'Seats');
      await t.tick(12_000);
      t.navigate('/checkout.html', 'Payment');
      t.focusField('card', 'Card number');
      await t.tick(6_000);
    },
  },
];

const heldOutLostStoryList: LostScenario[] = [
  {
    id: 'held-competent-black-friday',
    kind: 'competent_navigation',
    tags: ['shopping'],
    heldOut: true,
    source: 'Northline · Black Friday',
    what: 'Fast browsing but each step adds intent (view + add)',
    play: async (t) => {
      t.navigate('/sale', 'Sale');
      for (const slug of ['a', 'b', 'c', 'd', 'e']) {
        t.click(`View deal ${slug}`);
        t.navigate(`/product/deal-${slug}`, `Deal ${slug}`);
        await t.tick(6_000);
        t.click('Add to bag');
        await t.tick(4_000);
      }
      t.navigate('/cart', 'Cart');
      await t.tick(6_000);
    },
  },
  {
    id: 'held-stuck-hop6-help',
    kind: 'stuck',
    heldOut: true,
    source: 'Westbridge · Campuses',
    expectTier: 'full',
    what: 'Six distinct pages in 90s plus Help',
    play: async (t) => {
      t.navigate('/', 'Home');
      const paths = ['/courses', '/calendar', '/aid', '/housing', '/dining', '/map'];
      for (const path of paths) {
        t.navigate(path, path);
        await t.tick(7_000);
      }
      t.click('Help');
      await t.tick(6_000);
    },
  },
  {
    id: 'held-competent-lulu-store-search',
    kind: 'competent_navigation',
    tags: ['shopping', 'reading'],
    heldOut: true,
    source: 'Lululemon · Stores',
    what: 'Store locator and help article (guide query “State Street hours”)',
    play: async (t) => {
      t.navigate('/stores.html', 'Stores');
      await t.tick(10_000);
      t.click('State Street');
      t.navigate('/help.html', 'Help');
      await t.tick(15_000);
      await t.tick(6_000);
    },
  },
];

export const lostScenarios: LostScenario[] = [
  ...lostTruePositiveTargets,
  ...lostFalsePositiveGuards,
  ...heldOutLostStoryList,
];

export const ciLostScenarios = lostScenarios.filter((s) => !s.heldOut);
export const heldOutLostScenarios = lostScenarios.filter((s) => s.heldOut);
export const stuckUserStories = lostTruePositiveTargets;
export const competentNavigationStories = lostScenarios.filter((s) => s.kind === 'competent_navigation');
