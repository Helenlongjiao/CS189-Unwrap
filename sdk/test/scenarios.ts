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
  /**
   * Held-out scenarios were written after the detector weights were tuned and are never used to
   * tune them. They are reported separately and do not gate CI, so they show how the detectors
   * do on pages they were not fitted to.
   */
  heldOut?: boolean;
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

/** A page whose buttons write to the clipboard. */
function installClipboard() {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
  document.getElementById('copy')?.addEventListener('click', () => {
    void navigator.clipboard.writeText('ABCD-1234');
  });
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

  // Added after the 2026-11 meeting: rage clicks are a page-break signal that needs layers of
  // evidence (page response, failed or missing requests, 5+ clicks, mouse movement).
  {
    id: 'rage-failed-request-with-error-message',
    detector: 'rage_click',
    source: 'Skyline Air · Checkout',
    expect: 'prompt',
    what: 'Clicks "Submit" three times; the request fails and the page shows an error message',
    html: '<button type="button" id="submit">Submit</button><div id="msg"></div>',
    prepare: () => {
      stubFetch(() => fail(500));
      document.getElementById('submit')!.addEventListener('click', async () => {
        const res = await window.fetch('/api/submit', { method: 'POST' });
        if (!res.ok) document.getElementById('msg')!.textContent = 'Something went wrong. Try again.';
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#submit'), 3, 150);
      await tick(1000);
    },
  },
  {
    id: 'rage-up-arrow-with-request',
    detector: 'rage_click',
    source: 'Northline · Product',
    expect: 'quiet',
    what: 'Taps a quantity up-arrow quickly; each tap saves to the server and the number goes up',
    html: '<button type="button" id="up" aria-label="Increase quantity">▲</button><span id="qty">1</span>',
    prepare: () => {
      stubFetch(() => ok());
      document.getElementById('up')!.addEventListener('click', async () => {
        await window.fetch('/api/cart/qty', { method: 'POST' });
        const qty = document.getElementById('qty')!;
        qty.textContent = String(Number(qty.textContent) + 1);
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#up'), 5, 90);
      await tick(1000);
    },
  },
  {
    id: 'dead-slow-request',
    detector: 'dead_click',
    source: 'Linden Clinic · Billing',
    expect: 'quiet',
    what: 'Clicks "Save"; it sends a request and the page only updates two seconds later',
    html: '<button type="button" id="save">Save</button><p id="status"></p>',
    prepare: () => {
      stubFetch(() => ok());
      document.getElementById('save')!.addEventListener('click', async () => {
        await window.fetch('/api/save', { method: 'POST' });
        setTimeout(() => (document.getElementById('status')!.textContent = 'Saved'), 2000);
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#save'));
      await tick(1500);
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

  // ───────────── held-out: modeled on the Southwest / Amazon / Expedia / Lululemon sites ─────────────
  // Written after tuning. Do not change detector weights to make these pass; report the result.
  {
    id: 'held-rage-southwest-promo-apply',
    detector: 'rage_click',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'prompt',
    what: 'Hammers the promo "Apply" button inside the payment form; it has an empty handler',
    html: `<form id="book"><input name="card" /><input name="promo" />
      <button type="button" id="promo-apply" class="btn-ghost">Apply</button>
      <button type="submit">Purchase</button></form>`,
    prepare: () => document.getElementById('promo-apply')!.addEventListener('click', () => {}),
    play: async ({ $, burst, tick }) => {
      await burst($('#promo-apply'), 5, 100);
      await tick(1000);
    },
  },
  {
    id: 'held-rage-amazon-buy-now-disabled',
    detector: 'rage_click',
    heldOut: true,
    source: 'Amazon · Product',
    expect: 'prompt',
    what: 'Presses the disabled "Buy Now" button repeatedly',
    html: '<button class="btn" type="button" id="buy" disabled style="width:100%">Buy Now</button>',
    play: async ({ $, hammerDisabled, tick }) => {
      await hammerDisabled($('#buy'), 4, 120);
      await tick(1000);
    },
  },
  {
    id: 'held-rage-lululemon-size-6',
    detector: 'rage_click',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'prompt',
    what: 'Taps size 6, a greyed-out size button with no handler, several times',
    html: '<div class="sizes"><button class="size" type="button">4</button><button class="size dead" type="button" id="noop-size">6</button></div>',
    play: async ({ $, burst, tick }) => {
      await burst($('#noop-size'), 4, 110);
      await tick(1000);
    },
  },
  {
    id: 'held-rage-lululemon-pick-size',
    detector: 'rage_click',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'quiet',
    what: 'Flips between sizes 2, 4 and 8 while deciding; the selected size highlights each time',
    html: `<div class="sizes"><button class="size on" type="button" data-s="2">2</button>
      <button class="size" type="button" data-s="4">4</button><button class="size" type="button" data-s="8">8</button></div>`,
    prepare: () => {
      document.querySelectorAll<HTMLElement>('.size').forEach((b) =>
        b.addEventListener('click', () => {
          document.querySelectorAll('.size').forEach((o) => o.classList.remove('on'));
          b.classList.add('on');
        }),
      );
    },
    play: async ({ $, click, tick }) => {
      for (const s of ['4', '8', '4', '2']) {
        click($(`[data-s="${s}"]`));
        await tick(220);
      }
      await tick(1000);
    },
  },
  {
    id: 'held-dead-amazon-prime-filter',
    detector: 'dead_click',
    heldOut: true,
    source: 'Amazon · Search',
    expect: 'prompt',
    what: 'Clicks the "Prime only" filter chip, which has an empty handler and changes nothing',
    // The real site styles .chip with cursor:pointer (test-site/amazon/style.css).
    html: '<aside class="filters"><div class="chip" id="dead-filter" style="cursor:pointer">Prime only</div><div class="chip" style="cursor:pointer">Under $50</div></aside><ul id="results"><li>Earbuds</li></ul>',
    prepare: () => document.getElementById('dead-filter')!.addEventListener('click', () => {}),
    play: async ({ $, click, tick }) => {
      click($('#dead-filter'));
      await tick(1100);
    },
  },
  {
    id: 'held-dead-lululemon-size-6',
    detector: 'dead_click',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'prompt',
    what: 'Clicks size 6 once; the button does nothing',
    html: '<div class="sizes"><button class="size dead" type="button" id="noop-size">6</button></div>',
    play: async ({ $, click, tick }) => {
      click($('#noop-size'));
      await tick(1100);
    },
  },
  {
    id: 'held-dead-amazon-filter-applies',
    detector: 'dead_click',
    heldOut: true,
    source: 'Amazon · Search',
    expect: 'quiet',
    what: 'Clicks the "Under $50" filter and the results list updates',
    html: '<div class="chip" id="under50" style="cursor:pointer">Under $50</div><ul id="results"><li>Earbuds $79</li><li>Kettle $34</li></ul>',
    prepare: () =>
      document.getElementById('under50')!.addEventListener('click', () => {
        document.querySelector('#results li')!.remove();
      }),
    play: async ({ $, click, tick }) => {
      click($('#under50'));
      await tick(1100);
    },
  },
  {
    id: 'held-error-southwest-book-500',
    detector: 'error',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'prompt',
    what: 'Clicks "Purchase"; POST /api/book returns 500 and the page rethrows "inventory service timeout"',
    html: '<form id="book"><button type="submit" id="purchase">Purchase</button></form>',
    prepare: () => stubFetch((url) => (url.includes('/api/book') ? fail(500) : ok())),
    play: async ({ $, click, tick }) => {
      click($('#purchase'));
      await window.fetch('/api/book', { method: 'POST', body: '{}' });
      jsError('inventory service timeout');
      await tick(500);
    },
  },
  {
    id: 'held-error-expedia-chat-widget',
    detector: 'error',
    heldOut: true,
    source: 'Expedia · Flights',
    expect: 'quiet',
    what: 'After clicking "Search flights", a third-party chat widget script throws',
    html: '<button id="search">Search flights</button>',
    play: async ({ $, click, tick }) => {
      click($('#search'));
      await tick(300);
      jsError('Cannot read properties of null', 'https://widget.intercom.io/widget/abc123');
    },
  },
  {
    id: 'held-error-lululemon-analytics-post',
    detector: 'error',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'quiet',
    what: 'Clicks "Add to bag"; only the analytics beacon POST fails',
    html: '<button id="add">Add to bag</button>',
    prepare: () => stubFetch((url) => (url.includes('segment.io') ? fail(500) : ok())),
    play: async ({ $, click, tick }) => {
      click($('#add'));
      await window.fetch('https://api.segment.io/v1/t', { method: 'POST', body: '{}' });
      await tick(500);
    },
  },

  // ───────────── held-out: harder error cases, written before changing errors.ts ─────────────
  {
    id: 'held-error-enter-key-submit-500',
    detector: 'error',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'prompt',
    what: 'Fills the form and presses Enter (no mouse click); POST /api/book returns 500',
    html: '<form id="book"><input id="card" name="card" /><button type="submit">Purchase</button></form>',
    prepare: () => stubFetch((url) => (url.includes('/api/book') ? fail(500) : ok())),
    play: async ({ $, tick }) => {
      const card = $<HTMLInputElement>('#card');
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      $('#book').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await window.fetch('/api/book', { method: 'POST', body: '{}' });
      await tick(500);
    },
  },
  {
    id: 'held-error-slow-post-500',
    detector: 'error',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'prompt',
    what: 'Clicks "Purchase"; the booking request hangs for 4 seconds, then returns 500',
    html: '<button id="purchase">Purchase</button>',
    prepare: () =>
      stubFetch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return fail(500);
      }),
    play: async ({ $, click, tick }) => {
      click($('#purchase'));
      const pending = window.fetch('/api/book', { method: 'POST', body: '{}' });
      await tick(4200);
      await pending;
    },
  },
  {
    id: 'held-error-abort-rejection',
    detector: 'error',
    heldOut: true,
    source: 'Expedia · Flights',
    expect: 'quiet',
    what: 'Clicks a filter while a search is in flight; the older search is cancelled and rejects with AbortError',
    html: '<button id="filter">Nonstop only</button>',
    play: async ({ $, click, tick }) => {
      click($('#filter'));
      await tick(200);
      const reason = new DOMException('The user aborted a request.', 'AbortError');
      window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason }));
    },
  },
  {
    id: 'held-error-first-party-beacon-500',
    detector: 'error',
    heldOut: true,
    source: 'Amazon · Product',
    expect: 'quiet',
    what: 'Clicks "Add to cart"; only the site’s own analytics beacon (/api/analytics/collect) returns 500',
    html: '<button id="add">Add to cart</button>',
    prepare: () => stubFetch((url) => (url.includes('/analytics/') ? fail(500) : ok())),
    play: async ({ $, click, tick }) => {
      click($('#add'));
      await window.fetch('/api/analytics/collect', { method: 'POST', body: '{}' });
      await tick(500);
    },
  },
  {
    id: 'held-error-background-poll-500',
    detector: 'error',
    heldOut: true,
    source: 'Amazon · Home',
    expect: 'quiet',
    what: 'A notifications poll starts on its own and returns 500 one second after the user happens to click a menu',
    html: '<button id="menu">Menu</button>',
    prepare: () =>
      stubFetch(async (url) => {
        if (url.includes('/api/notifications')) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          return fail(500);
        }
        return ok();
      }),
    play: async ({ $, click, tick }) => {
      const poll = window.fetch('/api/notifications');
      await tick(1500);
      click($('#menu'));
      await tick(1200);
      await poll;
    },
  },
  // ───────────── held-out: harder rage / dead click cases, written before changing the detectors ─────────────
  {
    id: 'held-rage-hung-request-spinner',
    detector: 'rage_click',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'prompt',
    what: 'Hammers "Purchase" while a spinner shows and the booking request never answers',
    html: '<button id="purchase">Purchase</button><div id="status"></div>',
    prepare: () => {
      stubFetch(() => new Promise<Response>(() => undefined));
      document.getElementById('purchase')!.addEventListener('click', () => {
        document.getElementById('status')!.textContent = 'Processing…';
        void window.fetch('/api/book', { method: 'POST', body: '{}' });
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#purchase'), 4, 200);
      await tick(5000);
    },
  },
  {
    id: 'held-rage-slow-request-impatient',
    detector: 'rage_click',
    heldOut: true,
    source: 'Expedia · Flights',
    expect: 'quiet',
    what: 'Taps "Search" three times while a slow (1.5 s) but working request completes',
    html: '<button id="search">Search</button><div id="status"></div>',
    prepare: () => {
      stubFetch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return ok();
      });
      document.getElementById('search')!.addEventListener('click', () => {
        void window.fetch('/api/search');
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#search'), 3, 200);
      await tick(4000);
    },
  },
  {
    id: 'held-rage-copy-code-button',
    detector: 'rage_click',
    heldOut: true,
    source: 'Amazon · Gift cards',
    expect: 'quiet',
    what: 'Taps "Copy code" three times; it only writes to the clipboard',
    html: '<button id="copy">Copy code</button>',
    prepare: installClipboard,
    play: async ({ $, burst, tick }) => {
      await burst($('#copy'), 3, 150);
      await tick(1000);
    },
  },
  {
    id: 'held-rage-blocked-by-overlay',
    detector: 'rage_click',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'prompt',
    what: 'Clicks "Add to bag" four times, but an invisible overlay left on the page swallows every click',
    html: '<button id="add">Add to bag</button><div id="overlay" style="position:fixed;inset:0"></div>',
    play: async ({ $, burst, tick }) => {
      await burst($('#overlay'), 4, 120);
      await tick(1000);
    },
  },
  {
    id: 'held-dead-search-icon-focuses-input',
    detector: 'dead_click',
    heldOut: true,
    source: 'Amazon · Home',
    expect: 'quiet',
    what: 'Clicks the search icon; the only response is the search box taking focus',
    html: '<input id="q" placeholder="Search" /><button id="icon" type="button">Search</button>',
    prepare: () =>
      document.getElementById('icon')!.addEventListener('click', () => {
        (document.getElementById('q') as HTMLInputElement).focus();
      }),
    play: async ({ $, click, tick }) => {
      click($('#icon'));
      await tick(1100);
    },
  },
  {
    id: 'held-dead-copy-link-clipboard',
    detector: 'dead_click',
    heldOut: true,
    source: 'Southwest · Confirmation',
    expect: 'quiet',
    what: 'Clicks "Copy confirmation link"; it only writes to the clipboard',
    html: '<button id="copy" type="button">Copy confirmation link</button>',
    prepare: installClipboard,
    play: async ({ $, click, tick }) => {
      click($('#copy'));
      await tick(1100);
    },
  },
  {
    id: 'held-dead-opens-new-tab',
    detector: 'dead_click',
    heldOut: true,
    source: 'Expedia · Flights',
    expect: 'quiet',
    what: 'Clicks "Print itinerary"; the page opens a new window and nothing in this page changes',
    html: '<button id="print" type="button">Print itinerary</button>',
    prepare: () => {
      window.open = vi.fn(() => null) as typeof window.open;
      document.getElementById('print')!.addEventListener('click', () => {
        window.open('/itinerary/print', '_blank');
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#print'));
      await tick(1100);
    },
  },
];

/** Scenarios used to tune the detectors and gate CI. */
export const ciScenarios = scenarios.filter((s) => !s.heldOut);
/** Scenarios written after tuning; reported separately and never gate CI. */
export const heldOutScenarios = scenarios.filter((s) => s.heldOut);

export { ENDPOINT };
