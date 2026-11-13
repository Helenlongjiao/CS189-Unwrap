# I'm Lost guide: quiz results with and without hybrid search

Quiz: 36 questions on the 4 demo sites (`server/scripts/guide-questions.json`), measured Nov 13, 2026 with `npm run eval:guide -w server`. Rerun it after changing the guide to compare. Embeddings: OpenAI `text-embedding-3-small`. Cutoff: 0.3.

- **Without hybrid search** = keyword search only (what the guide does with no OpenAI key).
- **With hybrid search** = keyword search + meaning search, merged with RRF (what the guide does with a key).
- **Before** = keyword search before the hybrid-search work (issue #9), which didn't match plurals.

## Summary

| Measure | Before | Without hybrid (keyword only) | With hybrid |
|---|---|---|---|
| Right page first (28 questions) | 12/28 (43%) | 16/28 (57%) | **24/28 (86%)** |
| Right page in top 3 | 13/28 (46%) | 16/28 (57%) | **26/28 (93%)** |
| Exact-word questions, first (8) | 8/8 (100%) | 8/8 (100%) | 8/8 (100%) |
| Synonym questions, first (20) | 4/20 (20%) | 8/20 (40%) | **16/20 (80%)** |
| Correctly shows nothing (8 off-topic) | 7/8 (88%) | 7/8 (88%) | 7/8 (88%) |

"Without hybrid" is better than before because keyword search now treats singular and plural as the same word ("exchange" now matches "exchanges"). It works even without a key.

## How the cutoff was chosen

With hybrid search at different cutoffs. Pages less similar to the question than the cutoff are left out of the meaning results.

| Cutoff | Right page first | In top 3 | Exact first | Synonym first | Correctly shows nothing |
|---|---|---|---|---|---|
| 0.20 | 25/28 (89%) | 28/28 (100%) | 8/8 (100%) | 17/20 (85%) | 3/8 (38%) |
| 0.25 | 24/28 (86%) | 26/28 (93%) | 8/8 (100%) | 16/20 (80%) | 5/8 (63%) |
| **0.30 (chosen)** | 24/28 (86%) | 26/28 (93%) | 8/8 (100%) | 16/20 (80%) | 7/8 (88%) |
| 0.35 | 21/28 (75%) | 22/28 (79%) | 8/8 (100%) | 13/20 (65%) | 7/8 (88%) |
| 0.40 | 18/28 (64%) | 19/28 (68%) | 8/8 (100%) | 10/20 (50%) | 7/8 (88%) |
| 0.45 | 17/28 (61%) | 17/28 (61%) | 8/8 (100%) | 9/20 (45%) | 7/8 (88%) |
| 0.50 | 16/28 (57%) | 16/28 (57%) | 8/8 (100%) | 8/20 (40%) | 7/8 (88%) |

0.30 keeps the most right answers without letting off-topic questions show pages. Off-topic questions score at most 0.29 against any page, and most right pages score 0.34 or more.

## Every question

✅ right page first · 🟡 right page 2nd or 3rd · ❌ miss

| Site | Question | Kind | Should find | Without hybrid (keyword only) | | With hybrid | |
|---|---|---|---|---|---|---|---|
| Southwest | "check in" | Exact word | `/check-in.html` | `/check-in.html`, `/help.html`, `/bags.html` | ✅ | `/check-in.html`, `/help.html`, `/seats.html` | ✅ |
| Southwest | "change flight" | Exact word | `/change-flight.html` | `/change-flight.html`, `/manage.html`, `/help.html` | ✅ | `/change-flight.html`, `/manage.html`, `/help.html` | ✅ |
| Southwest | "luggage" | Synonym | `/bags.html` | (nothing) | ❌ | `/bags.html` | ✅ |
| Southwest | "talk to someone" | Synonym | `/contact.html` | (nothing) | ❌ | (nothing) | ❌ |
| Southwest | "rebook my trip" | Synonym | `/change-flight.html` or `/manage.html` | `/manage.html`, `/help.html`, `/` | ✅ | `/manage.html`, `/help.html`, `/` | ✅ |
| Southwest | "pick a seat" | Synonym | `/seats.html` | `/seats.html`, `/flights.html` | ✅ | `/seats.html`, `/flights.html` | ✅ |
| Southwest | "my reservation" | Synonym | `/manage.html` or `/check-in.html` | `/check-in.html` | ✅ | `/check-in.html`, `/manage.html`, `/passengers.html` | ✅ |
| Southwest | "pet insurance" | Not on site | (nothing) | (nothing) | ✅ shows nothing | (nothing) | ✅ shows nothing |
| Southwest | "rent an apartment" | Not on site | (nothing) | (nothing) | ✅ shows nothing | (nothing) | ✅ shows nothing |
| Amazon | "track package" | Exact word | `/tracking.html` | `/tracking.html`, `/help.html`, `/orders.html` | ✅ | `/tracking.html`, `/orders.html`, `/account.html` | ✅ |
| Amazon | "gift cards" | Exact word | `/gift-cards.html` | `/gift-cards.html`, `/`, `/cart.html` | ✅ | `/gift-cards.html`, `/`, `/cart.html` | ✅ |
| Amazon | "send it back" | Synonym | `/returns.html` | (nothing) | ❌ | `/returns.html`, `/help.html`, `/orders.html` | ✅ |
| Amazon | "headphones" | Synonym | `/product-earbuds.html` | (nothing) | ❌ | `/product-earbuds.html`, `/electronics.html` | ✅ |
| Amazon | "purchase history" | Synonym | `/orders.html` | (nothing) | ❌ | `/orders.html`, `/account.html`, `/cart.html` | ✅ |
| Amazon | "where is my order" | Synonym | `/tracking.html` or `/orders.html` | `/orders.html`, `/account.html`, `/checkout.html` | ✅ | `/orders.html`, `/account.html`, `/checkout.html` | ✅ |
| Amazon | "contact support" | Synonym | `/help.html` | (nothing) | ❌ | `/help.html`, `/account.html`, `/orders.html` | ✅ |
| Amazon | "flight status" | Not on site | (nothing) | `/account.html`, `/tracking.html` | ❌ shows pages | `/account.html`, `/tracking.html` | ❌ shows pages |
| Amazon | "car rental" | Not on site | (nothing) | (nothing) | ✅ shows nothing | (nothing) | ✅ shows nothing |
| Expedia | "baggage fees" | Exact word | `/baggage-fees.html` | `/baggage-fees.html`, `/flights.html`, `/support.html` | ✅ | `/baggage-fees.html`, `/flights.html`, `/support.html` | ✅ |
| Expedia | "cancellation policy" | Exact word | `/cancellation.html` | `/cancellation.html`, `/hotel.html`, `/trip.html` | ✅ | `/cancellation.html`, `/support.html`, `/trip.html` | ✅ |
| Expedia | "luggage" | Synonym | `/baggage-fees.html` | (nothing) | ❌ | `/baggage-fees.html` | ✅ |
| Expedia | "get my money back" | Synonym | `/cancellation.html` | (nothing) | ❌ | (nothing) | ❌ |
| Expedia | "rent a vehicle" | Synonym | `/cars.html` | (nothing) | ❌ | `/cars.html`, `/checkout.html` | ✅ |
| Expedia | "place to stay" | Synonym | `/hotels.html` or `/hotel.html` or `/` | `/`, `/cars.html`, `/trip.html` | ✅ | `/`, `/trip.html`, `/hotel.html` | ✅ |
| Expedia | "my bookings" | Synonym | `/trips.html` | (nothing) | ❌ | `/checkout.html`, `/trips.html`, `/support.html` | 🟡 2nd/3rd |
| Expedia | "buy shoes" | Not on site | (nothing) | (nothing) | ✅ shows nothing | (nothing) | ✅ shows nothing |
| Expedia | "order pizza" | Not on site | (nothing) | (nothing) | ✅ shows nothing | (nothing) | ✅ shows nothing |
| Lululemon | "size guide" | Exact word | `/size-guide.html` | `/size-guide.html`, `/help.html`, `/product.html` | ✅ | `/size-guide.html`, `/help.html`, `/product.html` | ✅ |
| Lululemon | "State Street hours" | Exact word | `/stores.html` | `/stores.html` | ✅ | `/stores.html` | ✅ |
| Lululemon | "what size am I" | Synonym | `/size-guide.html` | `/size-guide.html`, `/help.html`, `/cart.html` | ✅ | `/size-guide.html`, `/help.html`, `/cart.html` | ✅ |
| Lululemon | "exchange" | Synonym | `/returns.html` | `/returns.html`, `/help.html` | ✅ | `/returns.html`, `/help.html` | ✅ |
| Lululemon | "store near me" | Synonym | `/stores.html` | `/stores.html`, `/`, `/men.html` | ✅ | `/stores.html`, `/`, `/men.html` | ✅ |
| Lululemon | "leggings" | Synonym | `/product.html` or `/women.html` | (nothing) | ❌ | `/women.html`, `/cart.html`, `/` | ✅ |
| Lululemon | "send back my order" | Synonym | `/returns.html` | `/checkout.html` | ❌ | `/checkout.html`, `/returns.html`, `/help.html` | 🟡 2nd/3rd |
| Lululemon | "book a flight" | Not on site | (nothing) | (nothing) | ✅ shows nothing | (nothing) | ✅ shows nothing |
| Lululemon | "car rental" | Not on site | (nothing) | (nothing) | ✅ shows nothing | (nothing) | ✅ shows nothing |

## Still not right with hybrid search

- **Miss:** "talk to someone" (Southwest), "flight status" (Amazon), "get my money back" (Expedia).
- **Right page only 2nd or 3rd:** "my bookings" (Expedia), "send back my order" (Lululemon).

"talk to someone" and "get my money back" use completely different words from their pages, and score below the cutoff (0.24 and 0.23). A possible follow-up is having a chat model reword the question before searching. "flight status" on Amazon is a keyword-search match on the word "status". It happens with and without hybrid search.
