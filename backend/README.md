# Backend implementations

The frontend talks to a small HTTP API and doesn't care what implements it. Each implementation lives in its own folder here and must follow the contract below, so the same frontend and the same demo script work against any of them.

| Folder | Stack | Status |
|---|---|---|
| [`nodejs/`](nodejs/) | Node.js, Express, OpenTelemetry JS SDK | Reference implementation |

Pick one with the `BACKEND` variable (default `nodejs`):

```sh
BACKEND=nodejs docker compose up --build
```

## Adding an implementation

1. Create `backend/<name>/` containing a `Dockerfile`. Compose uses that folder as the build context.
2. Listen on `PORT` (default `3000`), load the menu from `SEED_PRODUCTS_FILE`, and implement the API below.
3. Export traces, metrics and logs over OTLP/HTTP, configured by the standard `OTEL_*` environment variables.
4. Run it with `BACKEND=<name> docker compose up --build` and check the frontend still behaves, including every control on the Demo controls page.
5. Add a row to the table above.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `SEED_PRODUCTS_FILE` | Docker: `/seed/products.json`; natively: `backend/seed-products.json` | Path of the shared menu file |
| `CURRENCY` | `GBP` | ISO 4217 code returned with prices (labels only, no conversion) |
| `FRONTEND_ORIGIN` | `http://localhost:8080` | Allowed CORS origin(s), comma separated |
| `OTEL_SERVICE_NAME` | `coffee-cart-backend` | Service name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS` | | Standard OTLP settings |

## HTTP API

All bodies are JSON. Errors are `{ "error": "<message>" }` with the status noted below. Unknown `/api/*` paths return 404. Amounts are **integers in the currency's smallest unit** (`...CurrencyUnits`, e.g. `450` is £4.50 for GBP).

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/health` | | `200 {status:"ok"}` | |
| `GET /api/products?q=&category=` | `q` matches name or description, case-insensitive | `200 {currency, products[]}` | |
| `GET /api/products/:id` | | `200 {currency, product}` | 404 |
| `GET /api/cart/:cartId` | | `200 cart` (empty cart if unknown) | |
| `POST /api/cart/:cartId/items` | `{productId, quantity=1}` | `201 cart` | 404 unknown product, 400 quantity not an integer 1 to 20, 409 out of stock |
| `DELETE /api/cart/:cartId/items/:productId` | | `200 cart` | |
| `POST /api/checkout` | `{cartId, name}` | `201 order` | 400 missing fields or empty cart, 409 out of stock, 500 payment failure |
| `GET /api/orders/:id` | | `200 order` | 404 |
| `GET /api/chaos` | | `200 chaos state` | |
| `POST /api/chaos` | partial chaos state | `200 chaos state` | |
| `DELETE /api/chaos` | | `200` defaults | |

Shapes:

- **product:** `{id, name, category, priceCurrencyUnits, description, image, stock}`. Categories are `coffee`, `cold`, `pastry`. `image` is `/img/<id>.svg` (served by the frontend). The menu comes from [`seed-products.json`](seed-products.json), shared by every implementation (see below).
- **cart:** `{cartId, currency, items:[{product, quantity, lineTotalCurrencyUnits}], totalCurrencyUnits}`. Carts are in memory, keyed by the client-supplied id.
- **order:** `{id, name, items:[{productId, name, quantity, lineTotalCurrencyUnits}], totalCurrencyUnits, currency, createdAt}`. `id` looks like `ORD-1A2B3C`. A successful checkout decrements stock and deletes the cart.
- **chaos state:** see below.

State is in memory and resets on restart. No database.

### Seed data

[`seed-products.json`](seed-products.json) is the single source of truth for the menu: an array of products with exactly the product shape above, including each product's `image` path and starting `stock` (25). Edit prices or add products there once and every implementation picks it up. Load it at start-up, keep it in memory, and decrement `stock` on successful checkouts.

Docker Compose mounts the file read-only at `/seed/products.json` and sets `SEED_PRODUCTS_FILE` to that path, because each implementation's Docker build context is its own folder and can't reach files above it. A new implementation should read the path from `SEED_PRODUCTS_FILE` and fail loudly if the file is missing.

### CORS

Allow origins from `FRONTEND_ORIGIN`, methods `GET, POST, DELETE, OPTIONS`, and request headers `content-type, traceparent, tracestate, baggage`. If `traceparent` is missing from the allowed headers the browser rejects the preflight and frontend-to-backend traces break.

### Failure injection (`/api/chaos`)

| Field | Default | Behaviour |
|---|---|---|
| `baselineLatency` | `true` | Adds a random 5 to 60 ms delay (`5 + random² × 55`, skewed low) to every API call |
| `checkoutFailure` | `false` | The payment step throws, so checkout returns 500 (`Payment gateway error: upstream timeout`) |
| `slowCallLatencyMs` | `0` | When above 0, a fraction of calls get about this much extra delay (0 to 10000 ms, ±25% jitter), inside a `chaos.slow_call` span |
| `slowCallRate` | `0.25` | The fraction (0 to 1) of calls that are slowed |
| `outOfStockProductId` | `null` | That product reports as out of stock (409) on add-to-cart and checkout |
| `errorRate` | `0` | Fraction (0 to 1) of calls that fail with 503 `Service temporarily unavailable (injected)` |

`baselineLatency`, slow calls and `errorRate` apply to every `/api/*` request except `/api/health` and `/api/chaos`. Order of effects: baseline delay, then slow call, then random 503.

## Telemetry contract

What the demo relies on (names matter, because the README and any dashboards refer to them):

**Tracing**
- Extract W3C `traceparent` from incoming requests so server spans join the browser's trace.
- One server span per request; skip `/api/health` and CORS preflights.
- Manual child spans: `inventory.check` (attribute `inventory.lines`), `payment.process` (`payment.amount_currency_units`, `payment.currency`), `chaos.slow_call` (`chaos.latency_ms`).
- Attributes on the checkout server span: `checkout.item_count`, `checkout.total_currency_units`, and `order.id` on success.
- Errors: record the exception on the span and mark it as an error. Checkout normally takes about 180 to 380 ms (inventory 30 to 80 ms, payment 150 to 300 ms).

**Metrics**
- `coffee_cart.orders.placed`: counter.
- `coffee_cart.checkout.failures`: counter with attribute `reason` (`inventory` or `payment`).
- `coffee_cart.order.value`: histogram, unit `{currency_unit}`.

**Request log**
- One log line per API request, written when the response finishes (skip `/api/health` and CORS preflights). Message: `<METHOD> <path-and-query> <status> <duration>ms`, for example `GET /api/products 200 13.9ms`. Attributes: `method`, `path`, `status`, `durationMs`. Level: `info` below 400, `warn` for 4xx, `error` for 5xx.
- It must be written inside the request's trace context, so the line carries the trace ID.

**Logs**
- Every stdout JSON line should include `trace_id` and `span_id` when written inside a request, so `docker compose logs backend` can be searched by the trace ID shown in the frontend footer.
- Emit OTLP log records while the request span is active, so they carry `trace_id` and `span_id`. Also print JSON lines to stdout so `docker compose logs backend` is useful.
- Levels in use: `info` (listings, add to cart, order placed), `warn` (out of stock, slow call injected, chaos changed), `error` (checkout failed, unhandled error).
