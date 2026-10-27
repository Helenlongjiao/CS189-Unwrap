import { vi } from 'vitest';
import { ENDPOINT, click, pointerdown } from './harness';

/**
 * Replayable user sessions for measuring false positives. Each one sets up a small page, plays
 * what a user (or the page) does, and says whether the detector SHOULD prompt.
 *
 *  - `prompt`: a user who is really stuck. A miss here lowers the true-positive rate.
 *  - `quiet`: normal behavior or noise that looks like friction. A prompt here is a false positive.
 *
 * Pages are modeled on the demo sites in test-site/ (Skyline Air's dead "Apply" button, the
 * checkout crash, Harbor's "Review transfer" button, ...). To add a case recorded from a real
 * session, copy the page structure into `html` and replay the events in `play`.
 */
export type ScenarioDetector = 'rage_click' | 'dead_click' | 'error';

export interface Api {
  $: <T extends Element = HTMLElement>(selector: string) => T;
  click: typeof click;
  pointerdown: typeof pointerdown;
  tick: (ms: number) => Promise<void>;
  /** `n` clicks on one element, `gapMs` apart. */
  burst: (el: Element, n: number, gapMs: number, x?: number, y?: number) => Promise<void>;
  /** `n` pointer presses on a disabled control, `gapMs` apart. */
  hammerDisabled: (el: Element, n: number, gapMs: number) => Promise<void>;
}

export interface Scenario {
  id: string;
  detector: ScenarioDetector;
  /** Demo site page the scenario is modeled on. */
  source: string;
  expect: 'prompt' | 'quiet';
  what: string;
  html: string;
  prepare?: () => void;
  play: (api: Api) => Promise<void>;
}

export const api: Api = {
  $: (selector) => document.querySelector(selector) as never,
  click,
  pointerdown,
  tick: (ms) => vi.advanceTimersByTimeAsync(ms).then(() => undefined),
  async burst(el, n, gapMs, x = 10, y = 10) {
    for (let i = 0; i < n; i++) {
      click(el, x, y);
      await vi.advanceTimersByTimeAsync(gapMs);
    }
  },
  async hammerDisabled(el, n, gapMs) {
    for (let i = 0; i < n; i++) {
      pointerdown(el);
      await vi.advanceTimersByTimeAsync(gapMs);
    }
  },
};

const SAME_ORIGIN = `${location.origin}/assets/app.js`;

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  window.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

const ok = () => new Response('{}', { status: 200 });
const fail = (status: number) => new Response('{}', { status });

function jsError(message: string, filename = SAME_ORIGIN) {
  window.dispatchEvent(new ErrorEvent('error', { message, filename, lineno: 12 }));
}

export const scenarios: Scenario[] = [
  // ───────────────────────── rage click ─────────────────────────
  {
    id: 'rage-apply-promo-dead',
    detector: 'rage_click',
    source: 'Skyline Air · Checkout',
    expect: 'prompt',
    what: 'Hammers the "Apply" promo button, which has no handler',
    html: '<button type="button" id="apply">Apply</button>',
    play: async ({ $, burst, tick }) => {
      await burst($('#apply'), 5, 80);
      await tick(1000);
    },
  },
  {
    id: 'rage-disabled-submit',
    detector: 'rage_click',
    source: 'Skyline Air · Checkout',
    expect: 'prompt',
    what: 'Presses a greyed-out "Complete booking" button over and over',
    html: '<button type="submit" id="book" disabled>Complete booking</button>',
    play: async ({ $, hammerDisabled, tick }) => {
      await hammerDisabled($('#book'), 4, 90);
      await tick(1000);
    },
  },
  {
    id: 'rage-review-transfer-dead',
    detector: 'rage_click',
    source: 'Harbor Credit Union · Transfers',
    expect: 'prompt',
    what: 'Clicks "Review transfer" four times; nothing happens',
    html: '<p><button type="button" id="review">Review transfer</button></p>',
    play: async ({ $, burst, tick }) => {
      await burst($('#review'), 4, 120);
      await tick(1000);
    },
  },
  {
    id: 'rage-div-button-dead',
    detector: 'rage_click',
    source: 'Skyline Air · Flights',
    expect: 'prompt',
    what: 'Mashes a "View seat map" control built from a div; nothing responds',
    html: '<div role="button" id="seat" tabindex="0">View seat map</div>',
    play: async ({ $, burst, tick }) => {
      await burst($('#seat'), 4, 100);
      await tick(1000);
    },
  },
  {
    id: 'rage-select-paragraph-text',
    detector: 'rage_click',
    source: 'Northline · Returns',
    expect: 'quiet',
    what: 'Triple-clicks a paragraph to select it',
    html: '<p id="policy">Items can be returned within 30 days of delivery.</p>',
    play: async ({ $, burst, tick }) => {
      await burst($('#policy'), 3, 90, 40, 20);
      await tick(1000);
    },
  },
  {
    id: 'rage-quantity-plus',
    detector: 'rage_click',
    source: 'Northline · Product',
    expect: 'quiet',
    what: 'Taps the quantity "+" button quickly; the number goes up each time',
    html: '<button type="button" id="plus">+</button><span id="qty">1</span>',
    prepare: () => {
      document.getElementById('plus')!.addEventListener('click', () => {
        const qty = document.getElementById('qty')!;
        qty.textContent = String(Number(qty.textContent) + 1);
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#plus'), 5, 90);
      await tick(1000);
    },
  },
  {
    id: 'rage-carousel-next',
    detector: 'rage_click',
    source: 'Northline · Home',
    expect: 'quiet',
    what: 'Flips quickly through a carousel with the "next" arrow',
    html: '<button type="button" id="next" aria-label="Next slide">›</button><div id="slide">Slide 1</div>',
    prepare: () => {
      let n = 1;
      document.getElementById('next')!.addEventListener('click', () => {
        n += 1;
        document.getElementById('slide')!.textContent = `Slide ${n}`;
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#next'), 4, 100);
      await tick(1000);
    },
  },
  {
    id: 'rage-toggle-save',
    detector: 'rage_click',
    source: 'Northline · Shop',
    expect: 'quiet',
    what: 'Taps a "Save for later" heart three times; it flips each time',
    html: '<button type="button" id="heart" aria-pressed="false">♡ Save</button>',
    prepare: () => {
      const heart = document.getElementById('heart')!;
      heart.addEventListener('click', () => heart.setAttribute('aria-pressed', String(heart.getAttribute('aria-pressed') !== 'true')));
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#heart'), 3, 110);
      await tick(1000);
    },
  },
  {
    id: 'rage-text-field-cursor',
    detector: 'rage_click',
    source: 'Skyline Air · Checkout',
    expect: 'quiet',
    what: 'Clicks inside the "Full name" field three times to place the cursor',
    html: '<label for="name">Full name</label><input id="name" name="name" />',
    play: async ({ $, burst, tick }) => {
      await burst($('#name'), 3, 150, 60, 30);
      await tick(1000);
    },
  },
  {
    id: 'rage-menu-toggle',
    detector: 'rage_click',
    source: 'Westbridge University · Home',
    expect: 'quiet',
    what: 'Opens and closes the nav menu quickly',
    html: '<button type="button" id="menu">Menu</button><nav id="nav"></nav>',
    prepare: () => {
      document.getElementById('menu')!.addEventListener('click', () => document.getElementById('nav')!.classList.toggle('open'));
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#menu'), 3, 100);
      await tick(1000);
    },
  },
  {
    id: 'rage-double-click',
    detector: 'rage_click',
    source: 'Linden Clinic · Appointments',
    expect: 'quiet',
    what: 'Double-clicks a button (two clicks only)',
    html: '<button type="button" id="book">Book visit</button>',
    play: async ({ $, burst, tick }) => {
      await burst($('#book'), 2, 80);
      await tick(1000);
    },
  },

  // Added after the weights were set, to check they were not fitted to the cases above.
  {
    id: 'rage-div-onclick-dead',
    detector: 'rage_click',
    source: 'Westbridge University · Calendar',
    expect: 'prompt',
    what: 'Mashes a calendar day cell (a div with a click handler) that does nothing',
    html: '<div onclick="" id="day">Oct 14</div>',
    play: async ({ $, burst, tick }) => {
      await burst($('#day'), 3, 100);
      await tick(1000);
    },
  },
  {
    id: 'rage-slow-triple-click',
    detector: 'rage_click',
    source: 'Harbor Credit Union · Transfers',
    expect: 'prompt',
    what: 'Clicks the dead "Review transfer" button three times, about 300 ms apart',
    html: '<button type="button" id="review">Review transfer</button>',
    play: async ({ $, burst, tick }) => {
      await burst($('#review'), 3, 300);
      await tick(1000);
    },
  },
  {
    id: 'rage-checkbox-toggle',
    detector: 'rage_click',
    source: 'Linden Clinic · Refill',
    expect: 'quiet',
    what: 'Ticks and unticks a checkbox three times (state changes, but no element does)',
    html: '<label><input type="checkbox" id="agree" /> I agree</label>',
    play: async ({ $, burst, tick }) => {
      await burst($('#agree'), 3, 120);
      await tick(1000);
    },
  },

  // ───────────────────────── dead click ─────────────────────────
  {
    id: 'dead-apply-promo',
    detector: 'dead_click',
    source: 'Skyline Air · Checkout',
    expect: 'prompt',
    what: 'Clicks "Apply" once; the button has no handler',
    html: '<input id="promo" name="promo" /><button type="button" id="apply">Apply</button>',
    play: async ({ $, click, tick }) => {
      click($('#apply'));
      await tick(1100);
    },
  },
  {
    id: 'dead-disabled-submit',
    detector: 'dead_click',
    source: 'Skyline Air · Checkout',
    expect: 'prompt',
    what: 'Clicks a greyed-out "Complete booking" button',
    html: '<button type="submit" id="book" disabled>Complete booking</button>',
    play: async ({ $, pointerdown, tick }) => {
      pointerdown($('#book'));
      await tick(1100);
    },
  },
  {
    id: 'dead-review-transfer',
    detector: 'dead_click',
    source: 'Harbor Credit Union · Transfers',
    expect: 'prompt',
    what: 'Clicks "Review transfer" once; nothing happens',
    html: '<p><button type="button" id="review">Review transfer</button></p>',
    play: async ({ $, click, tick }) => {
      click($('#review'));
      await tick(1100);
    },
  },
  {
    id: 'dead-aria-disabled-control',
    detector: 'dead_click',
    source: 'Westbridge University · Registration',
    expect: 'prompt',
    what: 'Clicks a div-based "Register" control marked aria-disabled, with no explanation',
    html: '<div role="button" aria-disabled="true" id="register">Register</div>',
    play: async ({ $, pointerdown, tick }) => {
      pointerdown($('#register'));
      await tick(1100);
    },
  },
  {
    id: 'dead-card-clicked-twice',
    detector: 'dead_click',
    source: 'Westbridge University · Courses',
    expect: 'prompt',
    what: 'Clicks a course card that looks clickable, then tries again; nothing happens',
    html: '<div onclick="" id="course">MATH 101 · Calculus</div>',
    play: async ({ $, click, tick }) => {
      click($('#course'));
      await tick(1500);
      click($('#course'));
      await tick(1500);
    },
  },
  {
    id: 'dead-card-single-click',
    detector: 'dead_click',
    source: 'Westbridge University · Courses',
    expect: 'quiet',
    what: 'Clicks a clickable-looking course card once and moves on',
    html: '<div onclick="" id="course">MATH 101 · Calculus</div>',
    play: async ({ $, click, tick }) => {
      click($('#course'));
      await tick(1500);
    },
  },
  {
    id: 'dead-table-row-single-click',
    detector: 'dead_click',
    source: 'Linden Clinic · Records',
    expect: 'quiet',
    what: 'Clicks a lab-result row once, out of curiosity',
    html: '<div onclick="" id="row">Lab results · Oct 3</div>',
    play: async ({ $, click, tick }) => {
      click($('#row'));
      await tick(1500);
    },
  },
  {
    id: 'dead-native-validation',
    detector: 'dead_click',
    source: 'Linden Clinic · Refill',
    expect: 'quiet',
    what: 'Submits a form with an empty required field; the browser shows its own message',
    html: '<form id="refill"><input name="rx" required /><button type="submit" id="go">Request refill</button></form>',
    play: async ({ $, click, tick }) => {
      click($('#go'));
      await tick(1500);
    },
  },
  {
    id: 'dead-submit-slow-request',
    detector: 'dead_click',
    source: 'Skyline Air · Checkout',
    expect: 'quiet',
    what: 'Clicks "Complete booking"; the page handles the submit but the request takes a while',
    html: '<form id="checkout" novalidate><button type="submit" id="book">Complete booking</button></form>',
    prepare: () => {
      document.getElementById('checkout')!.addEventListener('submit', (e) => e.preventDefault());
    },
    play: async ({ $, click, tick }) => {
      click($('#book'));
      await tick(1500);
    },
  },
  {
    id: 'dead-back-to-top',
    detector: 'dead_click',
    source: 'Northline · Help',
    expect: 'quiet',
    what: 'Clicks "Back to top"; the page scrolls but no element changes',
    html: '<button type="button" id="top">Back to top</button>',
    prepare: () => {
      document.getElementById('top')!.addEventListener('click', () => window.dispatchEvent(new Event('scroll')));
    },
    play: async ({ $, click, tick }) => {
      click($('#top'));
      await tick(1500);
    },
  },
  {
    id: 'dead-details-toggle',
    detector: 'dead_click',
    source: 'Northline · Help',
    expect: 'quiet',
    what: 'Opens an FAQ answer',
    html: '<details><summary id="q">How do returns work?</summary><p>Within 30 days.</p></details>',
    play: async ({ $, click, tick }) => {
      click($('#q'));
      await tick(1500);
    },
  },
  {
    id: 'dead-text-field',
    detector: 'dead_click',
    source: 'Skyline Air · Checkout',
    expect: 'quiet',
    what: 'Clicks into a text field',
    html: '<input id="name" name="name" />',
    play: async ({ $, click, tick }) => {
      click($('#name'));
      await tick(1500);
    },
  },

  // ───────────────────────── error ─────────────────────────
  {
    id: 'error-checkout-crash',
    detector: 'error',
    source: 'Skyline Air · Checkout',
    expect: 'prompt',
    what: 'Clicks "Complete booking"; POST /api/book returns 500, then the page script crashes',
    html: '<button id="book">Complete booking</button>',
    prepare: () => stubFetch((url) => (url.includes('/api/book') ? fail(500) : ok())),
    play: async ({ $, click, tick }) => {
      click($('#book'));
      await window.fetch('/api/book', { method: 'POST', body: '{}' });
      jsError("Cannot read properties of undefined (reading 'confirmation')");
      await tick(500);
    },
  },
  {
    id: 'error-js-after-click',
    detector: 'error',
    source: 'Linden Clinic · Billing',
    expect: 'prompt',
    what: 'A script error from the site’s own code right after clicking "Pay balance"',
    html: '<button id="pay">Pay balance</button>',
    play: async ({ $, click, tick }) => {
      click($('#pay'));
      await tick(200);
      jsError('payment is not a function');
    },
  },
  {
    id: 'error-promise-rejection-after-click',
    detector: 'error',
    source: 'Harbor Credit Union · Transfers',
    expect: 'prompt',
    what: 'An unhandled promise rejection right after clicking "Send transfer"',
    html: '<button id="send">Send transfer</button>',
    play: async ({ $, click, tick }) => {
      click($('#send'));
      await tick(300);
      window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('Transfer service rejected the request') }));
    },
  },
  {
    id: 'error-network-down-after-click',
    detector: 'error',
    source: 'Westbridge University · Registration',
    expect: 'prompt',
    what: 'Clicks "Register"; the request gets no response',
    html: '<button id="register">Register</button>',
    prepare: () => {
      window.fetch = vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch;
    },
    play: async ({ $, click }) => {
      click($('#register'));
      await window.fetch('/api/register', { method: 'POST', body: '{}' }).catch(() => undefined);
    },
  },
  {
    id: 'error-search-get-500',
    detector: 'error',
    source: 'Northline · Shop',
    expect: 'prompt',
    what: 'Clicks "Search" and the site’s own results request returns 500',
    html: '<button id="search">Search</button>',
    prepare: () => stubFetch((url) => (url.includes('/api/search') ? fail(500) : ok())),
    play: async ({ $, click }) => {
      click($('#search'));
      await window.fetch('/api/search?q=boots');
    },
  },
  {
    id: 'error-resize-observer',
    detector: 'error',
    source: 'Northline · Shop',
    expect: 'quiet',
    what: 'The browser’s harmless "ResizeObserver loop" warning after a click',
    html: '<button id="filter">Filter</button>',
    play: async ({ $, click, tick }) => {
      click($('#filter'));
      await tick(100);
      jsError('ResizeObserver loop completed with undelivered notifications.', '');
    },
  },
  {
    id: 'error-tracker-script',
    detector: 'error',
    source: 'Northline · Shop',
    expect: 'quiet',
    what: 'A third-party tag manager script throws after a click',
    html: '<button id="add">Add to bag</button>',
    play: async ({ $, click, tick }) => {
      click($('#add'));
      await tick(300);
      jsError('fbq is not defined', 'https://www.googletagmanager.com/gtm.js');
    },
  },
  {
    id: 'error-browser-extension',
    detector: 'error',
    source: 'Harbor Credit Union · Accounts',
    expect: 'quiet',
    what: 'A browser extension’s script throws after a click',
    html: '<button id="view">View statement</button>',
    play: async ({ $, click, tick }) => {
      click($('#view'));
      await tick(300);
      jsError('Extension context invalidated.', 'chrome-extension://abcdef/content.js');
    },
  },
  {
    id: 'error-opaque-script-error',
    detector: 'error',
    source: 'Westbridge University · Aid',
    expect: 'quiet',
    what: 'A cross-origin script fails; the browser only reports "Script error."',
    html: '<button id="apply">Apply for aid</button>',
    play: async ({ $, click, tick }) => {
      click($('#apply'));
      await tick(300);
      jsError('Script error.', '');
    },
  },
  {
    id: 'error-broken-image',
    detector: 'error',
    source: 'Northline · Stores',
    expect: 'quiet',
    what: 'A decorative image fails to load a second after a click',
    html: '<button id="more">Show stores</button><img id="banner" alt="" />',
    play: async ({ $, click, tick }) => {
      click($('#more'));
      await tick(1000);
      $('#banner').dispatchEvent(new Event('error'));
    },
  },
  {
    id: 'error-console-warning',
    detector: 'error',
    source: 'Linden Clinic · Messages',
    expect: 'quiet',
    what: 'The site logs a framework warning with console.error after a click',
    html: '<button id="compose">Compose</button>',
    play: async ({ $, click, tick }) => {
      click($('#compose'));
      await tick(200);
      console.error('Warning: Each child in a list should have a unique "key" prop.');
    },
  },
  {
    id: 'error-analytics-post-fails',
    detector: 'error',
    source: 'Harbor Credit Union · Index',
    expect: 'quiet',
    what: 'A analytics beacon to a third-party host returns 500 after a click',
    html: '<button id="rates">See rates</button>',
    prepare: () => stubFetch((url) => (url.includes('segment.io') ? fail(500) : ok())),
    play: async ({ $, click }) => {
      click($('#rates'));
      await window.fetch('https://api.segment.io/v1/track', { method: 'POST', body: '{}' });
    },
  },
  {
    id: 'error-background-js',
    detector: 'error',
    source: 'Skyline Air · Home',
    expect: 'quiet',
    what: 'A script error fires on its own with no click (page timer)',
    html: '<p>Welcome</p>',
    play: async ({ tick }) => {
      await tick(5000);
      jsError('timer callback failed');
    },
  },
  {
    id: 'error-background-console',
    detector: 'error',
    source: 'Skyline Air · Home',
    expect: 'quiet',
    what: 'The site logs console.error on its own with no click',
    html: '<p>Welcome</p>',
    play: async ({ tick }) => {
      await tick(5000);
      console.error('deprecated API used');
    },
  },
];

export { ENDPOINT };
