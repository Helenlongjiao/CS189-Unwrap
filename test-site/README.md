# Demo sites

Four deep lookalike sites with the Pulse embed. `docker compose up` from the repo root starts all of them. To run only the sites against an API you already started:

```bash
node test-site/serve-all.mjs
```

| Site | URL |
| --- | --- |
| Southwest | http://localhost:5173 |
| Amazon | http://localhost:5174 |
| Expedia | http://localhost:5175 |
| Lululemon | http://localhost:5176 |

Original HTML/CSS demos for UCSB × Unwrap testing. Not affiliated with Southwest Airlines, Amazon, Expedia Group, or lululemon athletica.

## Friction hooks

| Site | Do this | What breaks |
| --- | --- | --- |
| Southwest | Flights → **View seat map** | Real 404 |
| Southwest | Checkout → **Complete booking** | `POST /api/book` returns 500 |
| Southwest | Checkout → **Apply** promo | Dead click |
| Amazon | Product → **Buy now** | Disabled control |
| Amazon | Search → **Prime only** filter | Dead click |
| Expedia | Flights → **Seat map** | Real 404 |
| Lululemon | Product → size **6** | No-op control |
| Lululemon | Checkout → type, then wait 30s | Idle form abandonment |

Click the glowing orb (bottom right) at any time to open help. Try “State Street hours” on Lululemon for the lost-user guide.
