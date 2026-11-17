# Benchmark test catalog

See `scenarios.ts` and `lostScenarios.ts` for definitions. **`what`** below matches each story.

## Friction

### `rage_click`

| ID | Website | Expect | What |
|---|---|---|---|
| `quiet-amazon-rage-quantity` | Amazon | quiet | Taps quantity + on the PDP; count updates each time |
| `rage-amazon-buy-now` | Amazon | prompt | Repeatedly presses the disabled Buy Now button on the PDP buy box |
| `quiet-expedia-rage-select` | Expedia | quiet | Clicks Select twice quickly; fare state advances |
| `rage-expedia-seat-map` | Expedia | prompt | Hammers the dead-end Seat map control on a fare card |
| `quiet-harbor-rage-balances` | Harbor Credit Union | quiet | Clicks Refresh balances three times; each response updates the label |
| `rage-review-transfer-dead` | Harbor Credit Union | prompt | Clicks "Review transfer" four times; nothing happens |
| `rage-slow-triple-click` | Harbor Credit Union | prompt | Clicks the dead "Review transfer" button three times, about 300 ms apart |
| `rage-checkbox-toggle` | Linden Clinic | quiet | Ticks and unticks a checkbox three times (state changes, but no element does) |
| `rage-double-click` | Linden Clinic | quiet | Double-clicks a button (two clicks only) |
| `rage-linden-dead-book` | Linden Clinic | prompt | Hammers Book slot when the handler is a no-op |
| `quiet-lulu-size-2` | Lululemon | quiet | Selects an in-stock size twice (state changes) |
| `rage-lulu-size-6` | Lululemon | prompt | Clicks unavailable size 6 repeatedly (preventDefault only) |
| `rage-carousel-next` | Northline | quiet | Flips quickly through a carousel with the "next" arrow |
| `rage-northline-dead-apply` | Northline | prompt | Hammers Apply coupon on cart; button has no handler |
| `rage-quantity-plus` | Northline | quiet | Taps the quantity "+" button quickly; the number goes up each time |
| `rage-select-paragraph-text` | Northline | quiet | Triple-clicks a paragraph to select it |
| `rage-toggle-save` | Northline | quiet | Taps a "Save for later" heart three times; it flips each time |
| `rage-apply-promo-dead` | Skyline Air | prompt | Hammers the "Apply" promo button, which has no handler |
| `rage-disabled-submit` | Skyline Air | prompt | Presses a greyed-out "Complete booking" button over and over |
| `rage-div-button-dead` | Skyline Air | prompt | Mashes a "View seat map" control built from a div; nothing responds |
| `rage-text-field-cursor` | Skyline Air | quiet | Clicks inside the "Full name" field three times to place the cursor |
| `quiet-sw-rage-select` | Southwest | quiet | Double-taps Select on a fare; navigation fires |
| `rage-sw-promo-apply` | Southwest | prompt | Hammers the promo Apply button on Purchase (handler is a no-op) |
| `rage-div-onclick-dead` | Westbridge University | prompt | Mashes a calendar day cell (a div with a click handler) that does nothing |
| `rage-menu-toggle` | Westbridge University | quiet | Opens and closes the nav menu quickly |

### `dead_click`

| ID | Website | Expect | What |
|---|---|---|---|
| `dead-amazon-buy-now-disabled` | Amazon | prompt | Single press on disabled Buy Now on the PDP buy box |
| `dead-amazon-prime-filter` | Amazon | prompt | Clicks the Prime only filter chip (documented dead click) |
| `quiet-amazon-add-to-cart` | Amazon | quiet | Clicks Add to Cart, which updates state |
| `dead-expedia-seat-map-twice` | Expedia | prompt | Clicks a dead-end Seat map control twice |
| `quiet-expedia-dead-select` | Expedia | quiet | One Select click opens trip summary |
| `dead-review-transfer` | Harbor Credit Union | prompt | Clicks "Review transfer" once; nothing happens |
| `quiet-harbor-dead-rates` | Harbor Credit Union | quiet | Clicks See rates once; APR text appears |
| `dead-linden-dead-book` | Linden Clinic | prompt | Clicks Book slot once with no effect |
| `dead-native-validation` | Linden Clinic | quiet | Submits a form with an empty required field; the browser shows its own message |
| `dead-table-row-single-click` | Linden Clinic | quiet | Clicks a lab-result row once, out of curiosity |
| `dead-lulu-size-6` | Lululemon | prompt | Clicks size 6 once; size is a no-op |
| `quiet-lulu-dead-size-2` | Lululemon | quiet | Selects in-stock size 2 once |
| `dead-back-to-top` | Northline | quiet | Clicks "Back to top"; the page scrolls but no element changes |
| `dead-details-toggle` | Northline | quiet | Opens an FAQ answer |
| `dead-northline-dead-chip` | Northline | prompt | Clicks a Sale filter chip once; nothing changes |
| `dead-apply-promo` | Skyline Air | prompt | Clicks "Apply" once; the button has no handler |
| `dead-disabled-submit` | Skyline Air | prompt | Clicks a greyed-out "Complete booking" button |
| `dead-submit-slow-request` | Skyline Air | quiet | Clicks "Complete booking"; the page handles the submit but the request takes a while |
| `dead-text-field` | Skyline Air | quiet | Clicks into a text field |
| `dead-sw-promo` | Southwest | prompt | Single click on promo Apply with no effect |
| `quiet-sw-select-flight` | Southwest | quiet | Clicks Select on a flight; navigates to the next step |
| `dead-aria-disabled-control` | Westbridge University | prompt | Clicks a div-based "Register" control marked aria-disabled, with no explanation |
| `dead-card-clicked-twice` | Westbridge University | prompt | Clicks a course card that looks clickable, then tries again; nothing happens |
| `dead-card-single-click` | Westbridge University | quiet | Clicks a clickable-looking course card once and moves on |

### `error`

| ID | Website | Expect | What |
|---|---|---|---|
| `error-amazon-checkout-crash` | Amazon | prompt | Place order fails; POST returns 500 then first-party script throws |
| `quiet-amazon-error-image` | Amazon | quiet | Hero image fails to load after a click on the gallery thumb |
| `error-expedia-seat-map-click` | Expedia | prompt | Seat map after click; broken flow throws like the demo 404 hook |
| `quiet-expedia-select` | Expedia | quiet | Clicks Select on a fare with a successful follow-up request |
| `error-analytics-post-fails` | Harbor Credit Union | quiet | A analytics beacon to a third-party host returns 500 after a click |
| `error-browser-extension` | Harbor Credit Union | quiet | A browser extension’s script throws after a click |
| `error-promise-rejection-after-click` | Harbor Credit Union | prompt | An unhandled promise rejection right after clicking "Send transfer" |
| `error-console-warning` | Linden Clinic | quiet | The site logs a framework warning with console.error after a click |
| `error-js-after-click` | Linden Clinic | prompt | A script error from the site’s own code right after clicking "Pay balance" |
| `error-lulu-add-bag` | Lululemon | prompt | Add to bag throws after inventory check fails |
| `quiet-lulu-error-timer` | Lululemon | quiet | PDP logs a timer warning with no user click |
| `error-broken-image` | Northline | quiet | A decorative image fails to load a second after a click |
| `error-resize-observer` | Northline | quiet | The browser’s harmless "ResizeObserver loop" warning after a click |
| `error-search-get-500` | Northline | prompt | Clicks "Search" and the site’s own results request returns 500 |
| `error-tracker-script` | Northline | quiet | A third-party tag manager script throws after a click |
| `error-background-console` | Skyline Air | quiet | The site logs console.error on its own with no click |
| `error-background-js` | Skyline Air | quiet | A script error fires on its own with no click (page timer) |
| `error-checkout-crash` | Skyline Air | prompt | Clicks "Complete booking"; POST /api/book returns 500, then the page script crashes |
| `error-sw-purchase` | Southwest | prompt | Purchase submit; POST /api/book fails and the page throws |
| `error-sw-seat-map-click` | Southwest | prompt | View seat map after click; broken flow throws like the demo 404 hook |
| `quiet-sw-error-check-in` | Southwest | quiet | Check in succeeds after click; no thrown error |
| `error-network-down-after-click` | Westbridge University | prompt | Clicks "Register"; the request gets no response |
| `error-opaque-script-error` | Westbridge University | quiet | A cross-origin script fails; the browser only reports "Script error." |

## Lost

### Stuck (`lostTruePositiveTargets`)

| ID | Website | `expectTier` | What |
|---|---|---|---|
| `stuck-amazon-prime-filter-dead-end` | Amazon | full | Clicks Prime only repeatedly, then searches without choosing a product |
| `stuck-expedia-fare-hop` | Expedia | full | Bounces across trips, support, and cancellation without booking |
| `stuck-repeated-same-link` | Harbor CU | nudge | Clicks the same Review transfer label four times |
| `stuck-dwell-no-click` | Linden Clinic | nudge | Stays on FAQ but scrolls up and down without clicking (not calm reading) |
| `stuck-form-then-leave` | Linden Clinic | full | Touches three refill fields, abandons to home, then opens Help |
| `stuck-js-error-wander` | Linden Clinic | full | JS error on pay, then wanders across three pages |
| `stuck-scroll-reversal` | Linden Clinic | nudge | Scrolls up and down the FAQ without settling |
| `stuck-lulu-size-6-then-help` | Lululemon | nudge | Mashes unavailable size 6 then opens Help |
| `stuck-back-button-spam` | Northline | full | Rapid checkout ↔ cart alternation |
| `stuck-checkout-cart-loop` | Northline | full | Pings checkout and cart back and forth, then opens Help |
| `stuck-clicks-same-page` | Northline | nudge | Clicks many filters on the shop without navigating away |
| `stuck-sale-revisit` | Northline | full | Opens the same sale page five times in two minutes |
| `stuck-search-help-hop` | Northline | full | Search, Help, then three quick hops |
| `stuck-search-twice-no-click` | Northline | full | Tries two different queries and still never clicks a result |
| `stuck-error-then-wander` | Skyline Air | full | After a 404, hops across four more pages without finishing anything |
| `stuck-sw-404-then-hop` | Southwest | full | Broken seat-map path (page error) then wanders across four booking steps |
| `stuck-sw-promo-apply-spam` | Southwest | nudge | Clicks promo Apply many times with no navigation |
| `stuck-bounce-pages` | Westbridge | nudge | Very short visits on three pages in a row |
| `stuck-help-once` | Westbridge | nudge | Clicks Help once and stays on one page |

### Competent (`lostFalsePositiveGuards`)

| ID | Website | What |
|---|---|---|
| `competent-amazon-pdp-afk` | Amazon | Stays on a product page reading details (no Buy Now spam) |
| `competent-amazon-search-to-pdp` | Amazon | Search results to product (not the dead Prime filter) |
| `competent-expedia-select-trip` | Expedia | Flights list → trip summary without looping |
| `competent-harbor-rates-peek` | Harbor CU | Views rates once and returns home to open an account |
| `competent-harbor-transfer-happy` | Harbor CU | Accounts → transfer → submit → confirmation |
| `competent-pay-on-one-screen` | Harbor CU | Pays a balance on a single page and submits |
| `competent-linden-refill` | Linden Clinic | Completes a prescription refill and submits |
| `competent-read-afk-policy` | Linden Clinic | AFK on a policy page for almost a minute without clicking (reading) |
| `competent-read-policy` | Linden Clinic | Reads a single policy page and scrolls down steadily |
| `competent-lulu-product-to-bag` | Lululemon | Picks in-stock size 2 and adds Align pant to bag |
| `competent-lulu-read-product-afk` | Lululemon | AFK on the PDP reading copy without clicking |
| `competent-browse-three-products` | Northline | Clicks through three product pages in under a minute, then leaves |
| `competent-carousel-browse` | Northline | Uses in-page gallery next controls without changing URL |
| `competent-compare-pick-one` | Northline | Opens two products, adds one, goes to cart (brief back-and-forth, not panic) |
| `competent-filter-then-product` | Northline | Taps in-page filters, then opens one product |
| `competent-menu-explore` | Northline | Opens menu and visits three departments |
| `competent-returns-policy` | Northline | Opens returns help and reads without using the global Help control |
| `competent-search-then-result` | Northline | Searches once and clicks a result |
| `competent-shop-to-checkout` | Northline | Home → category → product → cart → checkout with normal pauses and add-to-bag |
| `competent-size-guide` | Northline | Size guide → back to product → add to bag |
| `competent-skyline-seats` | Skyline Air | Flights → seat map → checkout (linear) |
| `competent-sw-flight-purchase` | Southwest | Flights → seats → checkout → fills card (no dead promo spam) |
| `competent-read-article-pauses` | Westbridge | Stays on one article with slow scrolling (reading, not stuck) |
| `competent-westbridge-course-pick` | Westbridge | Picks one course and completes registration |

### Held-out

| ID | Website | Kind | What |
|---|---|---|---|
| `held-competent-lulu-store-search` | Lululemon | competent | Store locator and help article (guide query “State Street hours”) |
| `held-competent-black-friday` | Northline | competent | Fast browsing but each step adds intent (view + add) |
| `held-stuck-hop6-help` | Westbridge | stuck (full) | Six distinct pages in 90s plus Help |
