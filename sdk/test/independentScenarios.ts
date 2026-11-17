import { SAME_ORIGIN, fail, jsError, ok, stubFetch } from './scenarios';
import type { Scenario } from './scenarios';

/**
 * Scenarios written WITHOUT reading the detector code (sdk/src/detectors), from real user behavior,
 * the public definitions of rage / dead / error clicks, and the demo sites' own pages. They are
 * reported separately and never used to tune weights.
 */
export const independentScenarios: Scenario[] = [
  // ───────────────────────── rage click ─────────────────────────
  {
    id: 'ind-rage-lulu-size6-noop',
    detector: 'rage_click',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'prompt',
    what: 'Taps size "6" five times in a row because it never highlights; the control is a no-op, so the user is stuck.',
    html: `<div class="sizes">
      <button class="size" type="button">4</button>
      <button class="size dead" type="button" id="noop-size">6</button>
      <button class="size" type="button">8</button></div>`,
    prepare: () => {
      document.getElementById('noop-size')!.addEventListener('click', (e) => e.preventDefault());
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#noop-size'), 5, 140, 22, 18);
      await tick(1000);
    },
  },
  {
    id: 'ind-rage-expedia-booknow-dead',
    detector: 'rage_click',
    heldOut: true,
    source: 'Expedia · Checkout',
    expect: 'prompt',
    what: 'Fills in the form and hammers "Book now", which does nothing and shows no message.',
    html: `<form class="form panel"><input placeholder="Full name" /><input type="email" placeholder="Email" />
      <input placeholder="Card number" /><button class="btn" type="button" id="book">Book now</button></form>`,
    play: async ({ $, burst, tick }) => {
      await burst($('#book'), 6, 170, 50, 14);
      await tick(1000);
    },
  },
  {
    id: 'ind-rage-sw-purchase-hangs',
    detector: 'rage_click',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'prompt',
    what: 'Clicks "Purchase" repeatedly; the request hangs forever and the page gives no spinner or message, so it feels frozen.',
    html: `<form id="book"><input name="card" placeholder="Card number" /><button type="button" id="buy">Purchase</button></form>`,
    prepare: () => {
      stubFetch(() => new Promise<Response>(() => undefined));
      document.getElementById('buy')!.addEventListener('click', () => {
        void fetch('/api/book', { method: 'POST', body: '{}' });
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#buy'), 5, 200, 40, 12);
      await tick(1500);
    },
  },
  {
    id: 'ind-rage-amazon-prime-chip',
    detector: 'rage_click',
    heldOut: true,
    source: 'Amazon · Search',
    expect: 'prompt',
    what: 'Keeps clicking the "Prime only" filter chip but the results never change.',
    html: `<aside class="filters"><div class="chip" id="dead-filter" style="cursor:pointer">Prime only</div>
      <div class="chip">Under $50</div></aside><div id="results">3 results</div>`,
    prepare: () => {
      document.getElementById('dead-filter')!.addEventListener('click', () => {});
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#dead-filter'), 4, 250, 30, 10);
      await tick(1000);
    },
  },
  {
    id: 'ind-rage-expedia-modal-close-stuck',
    detector: 'rage_click',
    heldOut: true,
    source: 'Expedia · Flights',
    expect: 'prompt',
    what: 'A seat-map overlay will not close: the user mashes the X button and the overlay stays covering the page.',
    html: `<div id="overlay" role="dialog" style="position:fixed;inset:0;background:#fff">
      <button type="button" id="close" aria-label="Close">✕</button><p>Seat map</p></div>`,
    prepare: () => {
      document.getElementById('close')!.addEventListener('click', () => {
        /* handler bug: never hides the overlay */
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#close'), 5, 120, 12, 12);
      await tick(1000);
    },
  },
  {
    id: 'ind-rage-lulu-size-picker-switch',
    detector: 'rage_click',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'quiet',
    what: 'Quickly tries sizes 0, 2, 4 and 8 to compare; each button selects correctly, and they are different targets.',
    html: `<div class="sizes"><button class="size" type="button" id="s0">0</button>
      <button class="size" type="button" id="s2">2</button><button class="size" type="button" id="s4">4</button>
      <button class="size" type="button" id="s8">8</button></div>`,
    prepare: () => {
      document.querySelectorAll('.size').forEach((b) =>
        b.addEventListener('click', () => {
          document.querySelectorAll('.size').forEach((o) => o.classList.remove('on'));
          b.classList.add('on');
        }),
      );
    },
    play: async ({ $, click, tick }) => {
      for (const [sel, x] of [['#s0', 20], ['#s2', 90], ['#s4', 160], ['#s8', 230]] as const) {
        click($(sel), x, 300);
        await tick(150);
      }
      await tick(1000);
    },
  },
  {
    id: 'ind-rage-amazon-image-dblclick-zoom',
    detector: 'rage_click',
    heldOut: true,
    source: 'Amazon · Product',
    expect: 'quiet',
    what: 'Double-clicks the product photo to zoom in, which works; a double-click is not frustration.',
    html: `<div id="photo" style="width:300px;height:300px">image</div>`,
    prepare: () => {
      document.getElementById('photo')!.addEventListener('dblclick', () => document.getElementById('photo')!.classList.add('zoomed'));
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#photo'), 2, 110, 120, 120);
      await tick(1000);
    },
  },
  {
    id: 'ind-rage-sw-passenger-stepper',
    detector: 'rage_click',
    heldOut: true,
    source: 'Southwest · Flights',
    expect: 'quiet',
    what: 'Taps the "+" passengers stepper four times quickly to go from 1 to 5 adults; the count updates each time.',
    html: `<button type="button" id="minus">−</button><span id="adults">1</span><button type="button" id="plus">+</button>`,
    prepare: () => {
      document.getElementById('plus')!.addEventListener('click', () => {
        const el = document.getElementById('adults')!;
        el.textContent = String(Math.min(8, Number(el.textContent) + 1));
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#plus'), 4, 130, 14, 10);
      await tick(1000);
    },
  },
  {
    id: 'ind-rage-expedia-calendar-next',
    detector: 'rage_click',
    heldOut: true,
    source: 'Expedia · Flights',
    expect: 'quiet',
    what: 'Pages forward through the date-picker months with the "›" arrow to reach next spring; the month label changes each click.',
    html: `<button type="button" id="prev">‹</button><strong id="month">November</strong><button type="button" id="next">›</button>`,
    prepare: () => {
      const months = ['November', 'December', 'January', 'February', 'March', 'April'];
      let i = 0;
      document.getElementById('next')!.addEventListener('click', () => {
        i = Math.min(months.length - 1, i + 1);
        document.getElementById('month')!.textContent = months[i];
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#next'), 5, 180, 8, 8);
      await tick(1000);
    },
  },
  {
    id: 'ind-rage-amazon-double-add-to-cart',
    detector: 'rage_click',
    heldOut: true,
    source: 'Amazon · Product',
    expect: 'quiet',
    what: 'Accidentally double-clicks "Add to cart"; the button flips to "Added ✓" right away, so nothing is wrong.',
    html: `<button type="button" id="add">Add to cart</button>`,
    prepare: () => {
      document.getElementById('add')!.addEventListener('click', () => {
        document.getElementById('add')!.textContent = 'Added ✓';
      });
    },
    play: async ({ $, burst, tick }) => {
      await burst($('#add'), 2, 120, 40, 12);
      await tick(1000);
    },
  },

  // ───────────────────────── dead click ─────────────────────────
  {
    id: 'ind-dead-amazon-4stars-chip',
    detector: 'dead_click',
    heldOut: true,
    source: 'Amazon · Search',
    expect: 'prompt',
    what: 'Clicks the "4 Stars & Up" filter chip once, waits, and the result list never changes.',
    html: `<aside><div class="chip" id="stars" style="cursor:pointer">4 Stars &amp; Up</div></aside><h1>Results for “earbuds”</h1><div id="r">3 results</div>`,
    play: async ({ $, click, tick }) => {
      click($('#stars'), 30, 12);
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-sw-manage-trip-card',
    detector: 'dead_click',
    heldOut: true,
    source: 'Southwest · Manage trip',
    expect: 'prompt',
    what: 'Clicks a "Change flight" card that looks like a button (pointer cursor, arrow) but has no handler or link.',
    html: `<div class="card" id="change" role="button" tabindex="0" style="cursor:pointer">Change flight →</div>`,
    play: async ({ $, click, tick }) => {
      click($('#change'), 60, 25);
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-lulu-colour-dot',
    detector: 'dead_click',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'prompt',
    what: 'Clicks the "Scarlet" colour swatch to see the pant in red; nothing changes.',
    html: `<div class="colors"><span class="dot a" title="Ink"></span><span class="dot b" title="Sand"></span>
      <span class="dot c" id="scarlet" title="Scarlet" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#b22;cursor:pointer"></span></div>
      <div class="big" aria-hidden="true">photo (Ink)</div>`,
    play: async ({ $, click, tick }) => {
      click($('#scarlet'), 12, 12);
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-expedia-search-noop',
    detector: 'dead_click',
    heldOut: true,
    source: 'Expedia · Hotels',
    expect: 'prompt',
    what: 'Fills in the destination and clicks "Search"; the handler swallows the click and no results or spinner appear.',
    html: `<form id="f"><input name="dest" placeholder="Where to?" value="Denver" /><button class="btn" type="submit" id="go">Search</button></form>`,
    prepare: () => {
      document.getElementById('f')!.addEventListener('submit', (e) => e.preventDefault());
      document.getElementById('go')!.addEventListener('click', (e) => e.preventDefault());
    },
    play: async ({ $, click, tick }) => {
      click($('#go'), 40, 14);
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-lulu-save-for-later',
    detector: 'dead_click',
    heldOut: true,
    source: 'Lululemon · Cart',
    expect: 'prompt',
    what: 'Clicks "Save for later" on a cart line; the button does nothing and the item stays put.',
    html: `<div id="line">Align High-Rise Pant · $98 <button type="button" id="save">Save for later</button></div>`,
    prepare: () => {
      document.getElementById('save')!.addEventListener('click', () => {});
    },
    play: async ({ $, click, tick }) => {
      click($('#save'), 30, 10);
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-sw-label-focuses-input',
    detector: 'dead_click',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'quiet',
    what: 'Clicks the "Promo code" label, which just puts the cursor in the field; focus moving is the expected response.',
    html: `<label for="promo">Promo code</label><input id="promo" name="promo" />`,
    play: async ({ $, click, tick }) => {
      click($('label'), 20, 8);
      $<HTMLInputElement>('#promo').focus();
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-expedia-faq-accordion',
    detector: 'dead_click',
    heldOut: true,
    source: 'Expedia · Cancellation',
    expect: 'quiet',
    what: 'Opens a "Can I cancel within 24 hours?" FAQ entry; the answer expands as expected.',
    html: `<button type="button" id="q" aria-expanded="false">Can I cancel within 24 hours?</button><div id="a" hidden>Yes, free cancellation.</div>`,
    prepare: () => {
      document.getElementById('q')!.addEventListener('click', () => {
        document.getElementById('a')!.hidden = false;
        document.getElementById('q')!.setAttribute('aria-expanded', 'true');
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#q'), 50, 10);
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-lulu-size-guide-anchor',
    detector: 'dead_click',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'quiet',
    what: 'Clicks an in-page "Size guide" link that jumps to the guide section further down the same page.',
    html: `<a href="#guide" id="sg">Size guide</a><div style="height:1200px"></div><section id="guide">Size guide table</section>`,
    prepare: () => {
      document.getElementById('sg')!.addEventListener('click', (e) => {
        e.preventDefault();
        history.replaceState(null, '', '#guide');
        document.getElementById('guide')!.setAttribute('data-visited', '1');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#sg'), 30, 8);
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-amazon-add-to-cart-spinner',
    detector: 'dead_click',
    heldOut: true,
    source: 'Amazon · Product',
    expect: 'quiet',
    what: 'Clicks "Add to cart"; a spinner shows immediately and the item is added a couple seconds later, so the page clearly responded.',
    html: `<button type="button" id="add">Add to cart</button><span id="status"></span>`,
    prepare: () => {
      stubFetch(() => new Promise<Response>((r) => setTimeout(() => r(ok()), 2500)));
      document.getElementById('add')!.addEventListener('click', async () => {
        const btn = document.getElementById('add') as HTMLButtonElement;
        btn.disabled = true;
        document.getElementById('status')!.textContent = 'Adding…';
        await fetch('/api/cart', { method: 'POST', body: '{}' });
        document.getElementById('status')!.textContent = 'Added to cart';
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#add'), 40, 12);
      await tick(3000);
    },
  },
  {
    id: 'ind-dead-sw-click-plain-heading',
    detector: 'dead_click',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'quiet',
    what: 'Clicks on the plain "Trip summary" text while reading it; it is not styled as interactive so the user expects nothing.',
    html: `<div class="panel"><h2 id="h">Trip summary</h2><p>SBA → DEN · WN 1422 · 1 adult</p><p><strong>Total $59.00</strong></p></div>`,
    play: async ({ $, click, tick }) => {
      click($('#h'), 30, 10);
      await tick(1100);
    },
  },
  {
    id: 'ind-dead-amazon-tab-switch-panel',
    detector: 'dead_click',
    heldOut: true,
    source: 'Amazon · Product',
    expect: 'quiet',
    what: 'Clicks the "Reviews" tab; the panel content swaps from "Description" to "Reviews" immediately.',
    html: `<div role="tablist"><button role="tab" id="t-desc" aria-selected="true">Description</button><button role="tab" id="t-rev" aria-selected="false">Reviews</button></div>
      <div id="panel">Description text</div>`,
    prepare: () => {
      document.getElementById('t-rev')!.addEventListener('click', () => {
        document.getElementById('t-rev')!.setAttribute('aria-selected', 'true');
        document.getElementById('t-desc')!.setAttribute('aria-selected', 'false');
        document.getElementById('panel')!.textContent = '4.5 stars from 1,203 reviews';
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#t-rev'), 30, 10);
      await tick(1100);
    },
  },

  // ───────────────────────── error ─────────────────────────
  {
    id: 'ind-error-sw-booking-500',
    detector: 'error',
    heldOut: true,
    source: 'Southwest · Checkout',
    expect: 'prompt',
    what: 'Clicks "Purchase"; the booking request fails with a 500 and the page shows "Booking failed", so the user hits a real error.',
    html: `<form id="book"><button type="button" id="buy">Purchase</button><p id="err" hidden></p></form>`,
    prepare: () => {
      stubFetch(() => fail(500));
      document.getElementById('buy')!.addEventListener('click', async () => {
        const res = await fetch('/api/book', { method: 'POST', body: '{}' });
        if (!res.ok) {
          const err = document.getElementById('err')!;
          err.hidden = false;
          err.textContent = 'Booking failed: inventory service timeout';
          setTimeout(() => jsError('inventory service timeout'), 0);
        }
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#buy'), 40, 12);
      await tick(600);
    },
  },
  {
    id: 'ind-error-expedia-booknow-typeerror',
    detector: 'error',
    heldOut: true,
    source: 'Expedia · Checkout',
    expect: 'prompt',
    what: 'Clicks "Book now" and the page script immediately throws a TypeError from the site\'s own code, leaving the booking unfinished.',
    html: `<form class="form panel"><input placeholder="Card number" /><button type="button" id="book">Book now</button></form>`,
    prepare: () => {
      document.getElementById('book')!.addEventListener('click', () => {
        setTimeout(() => jsError("Cannot read properties of undefined (reading 'total')", SAME_ORIGIN), 120);
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#book'), 40, 12);
      await tick(800);
    },
  },
  {
    id: 'ind-error-amazon-cart-503',
    detector: 'error',
    heldOut: true,
    source: 'Amazon · Product',
    expect: 'prompt',
    what: 'Clicks "Add to cart" and the cart API answers 503, so the item is not added and the user sees "Could not add".',
    html: `<button type="button" id="add">Add to cart</button><p id="msg"></p>`,
    prepare: () => {
      stubFetch(() => fail(503));
      document.getElementById('add')!.addEventListener('click', async () => {
        const res = await fetch('/api/cart', { method: 'POST', body: '{}' });
        if (!res.ok) document.getElementById('msg')!.textContent = 'Could not add to cart';
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#add'), 40, 12);
      await tick(800);
    },
  },
  {
    id: 'ind-error-lulu-inventory-500',
    detector: 'error',
    heldOut: true,
    source: 'Lululemon · Product',
    expect: 'prompt',
    what: 'Picks size 4 and the stock-check request fails with 500, so "Add to bag" can no longer be trusted.',
    html: `<button class="size" type="button" id="s4">4</button><p id="stock"></p>`,
    prepare: () => {
      stubFetch(() => fail(500));
      document.getElementById('s4')!.addEventListener('click', async () => {
        const res = await fetch('/api/inventory?size=4');
        document.getElementById('stock')!.textContent = res.ok ? 'In stock' : 'Something went wrong';
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#s4'), 20, 10);
      await tick(800);
    },
  },
  {
    id: 'ind-error-sw-checkin-network-down',
    detector: 'error',
    heldOut: true,
    source: 'Southwest · Check in',
    expect: 'prompt',
    what: 'Submits the check-in form and the request itself fails ("Failed to fetch"), so the check-in never completes.',
    html: `<form id="ci"><input name="conf" value="ABC123" /><button type="button" id="go">Check in</button><p id="out"></p></form>`,
    prepare: () => {
      stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
      document.getElementById('go')!.addEventListener('click', async () => {
        try {
          await fetch('/api/check-in', { method: 'POST', body: '{}' });
        } catch {
          document.getElementById('out')!.textContent = 'Check-in failed. Try again.';
          setTimeout(() => jsError('Failed to fetch'), 0);
        }
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#go'), 40, 12);
      await tick(800);
    },
  },
  {
    id: 'ind-error-gtm-script-after-click',
    detector: 'error',
    heldOut: true,
    source: 'Amazon · Cart',
    expect: 'quiet',
    what: 'Right after a harmless click, Google Tag Manager throws inside its own script; the user\'s page works and never sees it.',
    html: `<button type="button" id="qty">Qty 1</button>`,
    prepare: () => {
      document.getElementById('qty')!.addEventListener('click', () => {
        setTimeout(() => jsError("Cannot read properties of null (reading 'push')", 'https://www.googletagmanager.com/gtm.js?id=GTM-XXXX'), 80);
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#qty'), 20, 10);
      await tick(800);
    },
  },
  {
    id: 'ind-error-extension-after-click',
    detector: 'error',
    heldOut: true,
    source: 'Lululemon · Cart',
    expect: 'quiet',
    what: 'A coupon-finder browser extension throws an error from its own content script just after the user clicks "Checkout"; the site is fine.',
    html: `<a href="#" id="co">Checkout</a>`,
    prepare: () => {
      document.getElementById('co')!.addEventListener('click', (e) => {
        e.preventDefault();
        setTimeout(() => jsError('Extension context invalidated.', 'chrome-extension://abcdefghijklmnop/content.js'), 100);
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#co'), 20, 10);
      await tick(800);
    },
  },
  {
    id: 'ind-error-resizeobserver-noise',
    detector: 'error',
    heldOut: true,
    source: 'Expedia · Hotels',
    expect: 'quiet',
    what: 'The browser logs the benign "ResizeObserver loop completed with undelivered notifications" while the user scrolls; nothing breaks.',
    html: `<div id="list" style="height:2000px">hotel results</div>`,
    play: async ({ tick }) => {
      await tick(3000);
      window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.', filename: '', lineno: 0 }));
      await tick(1000);
    },
  },
  {
    id: 'ind-error-analytics-beacon-fails',
    detector: 'error',
    heldOut: true,
    source: 'Southwest · Flights',
    expect: 'quiet',
    what: 'After the user clicks a fare, a background analytics beacon to a third-party host gets a 500; the fare selection itself works.',
    html: `<button type="button" id="fare">Wanna Get Away® $59</button><p id="picked"></p>`,
    prepare: () => {
      stubFetch((url) => (url.includes('analytics.example') ? fail(500) : ok()));
      document.getElementById('fare')!.addEventListener('click', () => {
        document.getElementById('picked')!.textContent = 'Selected';
        void fetch('https://analytics.example/collect', { method: 'POST', body: '{}' });
      });
    },
    play: async ({ $, click, tick }) => {
      click($('#fare'), 40, 12);
      await tick(800);
    },
  },
  {
    id: 'ind-error-typeahead-abort',
    detector: 'error',
    heldOut: true,
    source: 'Amazon · Search',
    expect: 'quiet',
    what: 'Types in the search box; each keystroke cancels the previous suggestion request (AbortError), which is normal typeahead behavior.',
    html: `<form><input id="q" placeholder="Search Amazon" /><ul id="sugg"></ul></form>`,
    prepare: () => {
      let calls = 0;
      stubFetch(() => {
        calls += 1;
        return calls === 1 ? Promise.reject(new DOMException('The user aborted a request.', 'AbortError')) : Promise.resolve(ok());
      });
      document.getElementById('q')!.addEventListener('input', async () => {
        try {
          await fetch('/api/suggest?q=ear');
        } catch {
          /* aborted by a newer keystroke */
        }
      });
    },
    play: async ({ $, tick }) => {
      const q = $<HTMLInputElement>('#q');
      for (const v of ['e', 'ea', 'ear']) {
        q.value = v;
        q.dispatchEvent(new Event('input', { bubbles: true }));
        await tick(120);
      }
      await tick(800);
    },
  },
  {
    id: 'ind-error-idle-page-load-noise',
    detector: 'error',
    heldOut: true,
    source: 'Expedia · Trips',
    expect: 'quiet',
    what: 'A third-party chat widget throws a generic "Script error." while the page loads, long before the user does anything, and the user then just reads.',
    html: `<h1>Your trips</h1><p>No upcoming trips.</p>`,
    play: async ({ tick }) => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', filename: '', lineno: 0 }));
      await tick(15000);
    },
  },
];
