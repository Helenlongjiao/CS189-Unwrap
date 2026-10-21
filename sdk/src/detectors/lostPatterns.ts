import {
  alternatingSwitches,
  bounces,
  clicksWithoutNavigation,
  collapsedPages,
  distinctPages,
  distinctQueries,
  dwellNoClick,
  focusesThenLeft,
  hasReturnCycle,
  helpClicks,
  maxVisits,
  pagesAfterError,
  quickReturns,
  repeatedLabel,
  scrollReversals,
  searchesIn,
  searchNoFollow,
  type LostSnapshot,
} from './lostScore';

export interface LostPattern {
  id: string;
  weight: number;
  strong: boolean;
  test: (snapshot: LostSnapshot) => boolean;
}

const patterns: LostPattern[] = [];

/** Catalog numbers are doubled so one story can reach the toast and a strong story clears the full guide. */
function points(weight: number): number {
  return weight * 2;
}

function weak(id: string, weight: number, test: (snapshot: LostSnapshot) => boolean) {
  patterns.push({ id, weight: points(weight), strong: false, test });
}

function strong(id: string, weight: number, test: (snapshot: LostSnapshot) => boolean) {
  patterns.push({ id, weight: points(weight), strong: true, test });
}

const seq = (snapshot: LostSnapshot, ms: number) => collapsedPages(snapshot.pages, snapshot.now, ms);

// Two pages traded back and forth. 3 switches is A-B-A-B.
for (const [switches, windowMs, weight] of [
  [3, 20_000, 18],
  [3, 30_000, 17],
  [3, 45_000, 16],
  [3, 90_000, 14],
  [3, 180_000, 12],
  [5, 60_000, 22],
  [5, 120_000, 20],
  [5, 180_000, 18],
] as const) {
  weak(`ab-${switches}-switches-${windowMs / 1000}s`, weight, (s) => alternatingSwitches(seq(s, windowMs)) >= switches);
}

// A loop through 3 or 4 distinct pages that comes back to the start.
for (const [span, windowMs, weight] of [
  [4, 60_000, 20],
  [4, 120_000, 16],
  [4, 240_000, 14],
  [5, 120_000, 20],
  [5, 180_000, 18],
  [5, 240_000, 16],
] as const) {
  weak(`cycle-${span - 1}-${windowMs / 1000}s`, weight, (s) => hasReturnCycle(seq(s, windowMs), span));
}

// Several different pages in a short stretch.
for (const [count, windowMs, weight] of [
  [3, 15_000, 16],
  [3, 30_000, 14],
  [3, 60_000, 12],
  [4, 20_000, 18],
  [4, 45_000, 16],
  [4, 90_000, 14],
  [5, 45_000, 20],
  [5, 90_000, 18],
  [5, 180_000, 14],
  [6, 60_000, 22],
  [6, 120_000, 18],
  [6, 240_000, 14],
  [7, 90_000, 22],
  [7, 180_000, 18],
  [8, 180_000, 20],
] as const) {
  weak(`hop-${count}-${windowMs / 1000}s`, weight, (s) => distinctPages(s.pages, s.now, windowMs) >= count);
}

// The same page opened again and again.
for (const [count, windowMs, weight] of [
  [3, 60_000, 16],
  [3, 120_000, 14],
  [3, 300_000, 12],
  [4, 60_000, 20],
  [4, 120_000, 18],
  [4, 300_000, 14],
  [5, 180_000, 22],
  [6, 300_000, 22],
] as const) {
  weak(`revisit-${count}-${windowMs / 1000}s`, weight, (s) => maxVisits(s.pages, s.now, windowMs) >= count);
}

// Back to the page they just left, quickly.
for (const [gapMs, count, windowMs, weight] of [
  [2_000, 2, 30_000, 16],
  [4_000, 2, 45_000, 14],
  [8_000, 2, 60_000, 12],
  [3_000, 3, 45_000, 20],
  [5_000, 3, 90_000, 18],
  [2_000, 4, 60_000, 22],
  [8_000, 4, 120_000, 18],
] as const) {
  weak(`back-${count}-within-${gapMs / 1000}s-${windowMs / 1000}s`, weight, (s) => quickReturns(s.pages, s.now, gapMs, windowMs) >= count);
}

// Pages left almost immediately, more than once.
for (const [dwellMs, count, windowMs, weight] of [
  [2_000, 2, 30_000, 16],
  [3_000, 2, 45_000, 14],
  [5_000, 2, 60_000, 12],
  [2_000, 3, 60_000, 20],
  [4_000, 3, 90_000, 18],
  [8_000, 3, 120_000, 16],
  [2_000, 4, 90_000, 22],
  [5_000, 4, 180_000, 18],
] as const) {
  weak(`bounce-${count}-under-${dwellMs / 1000}s-${windowMs / 1000}s`, weight, (s) => bounces(s.pages, s.now, dwellMs, windowMs) >= count);
}

// On-site search that never turns into a click.
for (const [idleMs, windowMs, weight] of [
  [15_000, 60_000, 18],
  [20_000, 90_000, 16],
  [30_000, 180_000, 14],
] as const) {
  weak(`search-no-follow-${idleMs / 1000}s`, weight, (s) => searchNoFollow(s, idleMs, windowMs));
}
weak('search-twice-60s', 20, (s) => searchesIn(s, 60_000).length >= 2);
weak('search-twice-180s', 16, (s) => searchesIn(s, 180_000).length >= 2);
weak('search-thrice-180s', 22, (s) => searchesIn(s, 180_000).length >= 3);
weak('search-edited-120s', 18, (s) => distinctQueries(s, 120_000) >= 2);
weak('search-then-help-60s', 22, (s) => searchesIn(s, 60_000).length >= 1 && helpClicks(s, 60_000) >= 1);

weak('help-once-180s', 16, (s) => helpClicks(s, 180_000) >= 1);
weak('help-twice-120s', 22, (s) => helpClicks(s, 120_000) >= 2);
weak('help-then-hop-30s', 18, (s) => helpClicks(s, 30_000) >= 1 && distinctPages(s.pages, s.now, 30_000) >= 3);
weak('help-and-scroll-60s', 18, (s) => helpClicks(s, 60_000) >= 1 && scrollReversals(s, 60_000) >= 3);

// Clicking around a page that never changes.
for (const [count, windowMs, weight] of [
  [4, 20_000, 14],
  [5, 30_000, 16],
  [6, 45_000, 18],
  [8, 60_000, 20],
  [4, 60_000, 12],
  [6, 120_000, 16],
  [10, 120_000, 22],
] as const) {
  weak(`clicks-${count}-no-nav-${windowMs / 1000}s`, weight, (s) => clicksWithoutNavigation(s, windowMs) >= count);
}
for (const [times, windowMs, weight] of [
  [3, 20_000, 14],
  [4, 30_000, 18],
  [5, 45_000, 22],
  [4, 90_000, 16],
] as const) {
  weak(`repeat-label-${times}-${windowMs / 1000}s`, weight, (s) => repeatedLabel(s, windowMs, times));
}

// Scrolling up and down without settling.
for (const [count, windowMs, weight] of [
  [3, 20_000, 14],
  [4, 30_000, 16],
  [5, 45_000, 18],
  [6, 60_000, 20],
  [4, 90_000, 14],
  [6, 120_000, 18],
] as const) {
  weak(`scroll-${count}-${windowMs / 1000}s`, weight, (s) => scrollReversals(s, windowMs) >= count);
}

for (const [dwellMs, weight] of [
  [30_000, 12],
  [45_000, 16],
  [60_000, 18],
  [90_000, 22],
] as const) {
  weak(`dwell-${dwellMs / 1000}s-no-click`, weight, (s) => dwellNoClick(s, dwellMs));
}
weak('dwell-30s-and-scroll', 18, (s) => dwellNoClick(s, 30_000) && scrollReversals(s, 60_000) >= 2);

// A form was started, then they left it.
for (const [fields, windowMs, weight] of [
  [3, 60_000, 18],
  [4, 90_000, 20],
  [2, 45_000, 14],
  [5, 120_000, 22],
] as const) {
  weak(`form-${fields}-then-left-${windowMs / 1000}s`, weight, (s) => focusesThenLeft(s, fields, windowMs));
}
weak('form-2-and-help', 20, (s) => focusesThenLeft(s, 2, 60_000) && helpClicks(s, 60_000) >= 1);

// Wandering after something already failed.
weak('error-then-2-pages-30s', 18, (s) => pagesAfterError(s, 2, 30_000));
weak('error-then-3-pages-60s', 22, (s) => pagesAfterError(s, 3, 60_000));
weak('error-then-help-45s', 20, (s) => pagesAfterError(s, 1, 45_000) && helpClicks(s, 45_000) >= 1);
weak('error-then-search-60s', 20, (s) => pagesAfterError(s, 1, 60_000) && searchesIn(s, 60_000).length >= 1);
weak('page-404-then-3-pages-90s', 24, (s) => pagesAfterError(s, 3, 90_000, 'page'));

// Combinations of otherwise mild signals.
weak('loop-and-bounce-60s', 22, (s) => alternatingSwitches(seq(s, 60_000)) >= 3 && bounces(s.pages, s.now, 8_000, 60_000) >= 2);
weak('loop-and-search-90s', 22, (s) => alternatingSwitches(seq(s, 90_000)) >= 3 && searchesIn(s, 90_000).length >= 1);
weak('hop4-and-scroll-60s', 20, (s) => distinctPages(s.pages, s.now, 60_000) >= 4 && scrollReversals(s, 60_000) >= 3);
weak('revisit3-and-help-120s', 22, (s) => maxVisits(s.pages, s.now, 120_000) >= 3 && helpClicks(s, 120_000) >= 1);
weak('revisit3-and-search-120s', 22, (s) => maxVisits(s.pages, s.now, 120_000) >= 3 && searchesIn(s, 120_000).length >= 1);
weak('bounce3-and-search-90s', 22, (s) => bounces(s.pages, s.now, 5_000, 90_000) >= 3 && searchesIn(s, 90_000).length >= 1);
weak('clicks5-and-help-60s', 22, (s) => clicksWithoutNavigation(s, 60_000) >= 5 && helpClicks(s, 60_000) >= 1);
weak('back3-and-help-90s', 22, (s) => quickReturns(s.pages, s.now, 8_000, 90_000) >= 3 && helpClicks(s, 90_000) >= 1);
weak('back3-and-search-90s', 22, (s) => quickReturns(s.pages, s.now, 8_000, 90_000) >= 3 && searchesIn(s, 90_000).length >= 1);
weak('search-and-hop3-60s', 20, (s) => searchesIn(s, 60_000).length >= 1 && distinctPages(s.pages, s.now, 60_000) >= 3);
weak('menu-and-bounce-60s', 20, (s) => clicksWithoutNavigation(s, 60_000) >= 4 && bounces(s.pages, s.now, 8_000, 60_000) >= 2);
weak('focus2-and-hop3-60s', 18, (s) => focusesThenLeft(s, 2, 60_000) && distinctPages(s.pages, s.now, 60_000) >= 3);

// A single strong pattern is enough to open the full guide.
strong('error-then-4-pages-60s', 80, (s) => pagesAfterError(s, 4, 60_000));
strong('revisit-5-120s', 75, (s) => maxVisits(s.pages, s.now, 120_000) >= 5);
strong('search-two-distinct-no-click', 75, (s) => distinctQueries(s, 180_000) >= 2 && searchNoFollow(s, 10_000, 180_000));
strong('ab-and-help', 80, (s) => alternatingSwitches(seq(s, 120_000)) >= 3 && helpClicks(s, 120_000) >= 1);
strong('cycle3-and-help', 80, (s) => hasReturnCycle(seq(s, 120_000), 4) && helpClicks(s, 120_000) >= 1);
strong('search-and-ab', 75, (s) => searchesIn(s, 120_000).length >= 1 && alternatingSwitches(seq(s, 120_000)) >= 3);
strong('bounce4-and-help', 75, (s) => bounces(s.pages, s.now, 8_000, 120_000) >= 4 && helpClicks(s, 120_000) >= 1);
strong('clicks8-and-search', 70, (s) => clicksWithoutNavigation(s, 120_000) >= 8 && searchesIn(s, 120_000).length >= 1);
strong('form3-and-help', 70, (s) => focusesThenLeft(s, 3, 90_000) && helpClicks(s, 90_000) >= 1);
strong('revisit4-and-search', 75, (s) => maxVisits(s.pages, s.now, 180_000) >= 4 && searchesIn(s, 180_000).length >= 1);
strong('rapid-8-pages-90s', 70, (s) => distinctPages(s.pages, s.now, 90_000) >= 8);
strong('scroll6-and-dwell45', 70, (s) => scrollReversals(s, 90_000) >= 6 && dwellNoClick(s, 45_000));
strong('back5-60s', 75, (s) => quickReturns(s.pages, s.now, 8_000, 60_000) >= 5);
strong('hop6-and-help', 75, (s) => distinctPages(s.pages, s.now, 90_000) >= 6 && helpClicks(s, 90_000) >= 1);
strong('dwell90-and-scroll4', 70, (s) => dwellNoClick(s, 90_000) && scrollReversals(s, 120_000) >= 4);

export const LOST_PATTERNS: readonly LostPattern[] = patterns;

export function evaluateLost(snapshot: LostSnapshot): Array<Pick<LostPattern, 'id' | 'weight' | 'strong'>> {
  const found: Array<Pick<LostPattern, 'id' | 'weight' | 'strong'>> = [];
  for (const pattern of LOST_PATTERNS) {
    try {
      if (pattern.test(snapshot)) found.push({ id: pattern.id, weight: pattern.weight, strong: pattern.strong });
    } catch {
      /* a bad snapshot should not take the page down */
    }
  }
  return found;
}
