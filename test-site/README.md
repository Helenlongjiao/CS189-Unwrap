# Demo sites

Five sites with the Pulse embed. `docker compose up` from the repo root starts all of them. To run only the sites against an API you already started:

```bash
node test-site/serve-all.mjs
```

| Site | URL |
| --- | --- |
| Skyline Air | http://localhost:5173 |
| Northline | http://localhost:5174 |
| Harbor Credit Union | http://localhost:5175 |
| Westbridge University | http://localhost:5176 |
| Linden Clinic | http://localhost:5177 |

## Intentional breaks on Skyline Air

| Do this | What breaks | What the SDK catches |
| --- | --- | --- |
| Flights → **View seat map** on any flight | `/seat-map` returns a real 404 | Page error 404, with the route and the link that led there |
| Flights → **Select** → Checkout → **Complete booking** | `POST /api/book` returns 500, then the page's JS crashes | Failed request + script error right after the click |
| Checkout → **Apply** (promo code) | Button has no handler | Dead click; clicking it fast 3+ times is a rage click |
| Checkout → type in a field, then wait 30 s | Nothing; you just stop | Idle form abandonment |

Click the glowing orb (bottom right) at any time to open the help panel manually.
