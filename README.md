# Introducing Grafana Faro — Coffee Cart demo

A deliberately small demo app for showing [Grafana Faro](https://grafana.com/oss/faro/) (frontend observability) alongside backend OpenTelemetry, so you can follow a single user action from the browser through to the API as one distributed trace.

It is a coffee cart: browse a menu, add things to a cart, check out. There is no real payment and no database. Data is in memory and resets when the backend restarts.

```
Browser (Faro Web SDK + tracing)  ──fetch + traceparent──▶  Backend (Node/Express + OpenTelemetry)
        │                                                          │
        └── Faro collector URL (FARO_URL)                          └── OTLP (OTEL_EXPORTER_OTLP_ENDPOINT)
```

Everything is self-contained: Bulma, Faro and the product illustrations are bundled or served locally, so the app itself works offline.

## Quick start

Requires Docker.

```sh
cp .env.example .env     # optional - defaults suit a local LGTM stack
docker compose up --build
```

- Frontend: http://localhost:8080
- API: http://localhost:3000/api/products

Faro and OTLP telemetry is sent to wherever you point it (see below). If nothing is listening, the app still works; the telemetry is just dropped. Set `FARO_URL=` (empty) to disable Faro completely.

## Configuration

All configuration is by environment variable (see [`.env.example`](.env.example)). The frontend container generates `/config.js` from these at start-up, so **the same image works against a local stack or Grafana Cloud without a rebuild.**

| Variable | Used by | Purpose |
|---|---|---|
| `FARO_URL` | frontend | Faro collector URL, reachable from the **browser** |
| `FARO_APP_NAME` / `_VERSION` / `_ENV` | frontend | Faro `app` metadata |
| `API_URL` | frontend | Where the browser reaches the API |
| `FRONTEND_ORIGIN` | backend | Origin(s) allowed by CORS |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | backend | OTLP/HTTP endpoint (default `http://host.docker.internal:4318`) |
| `OTEL_EXPORTER_OTLP_HEADERS` | backend | Auth headers, e.g. for Grafana Cloud |
| `OTEL_SERVICE_NAME` | backend | Service name |
| `CURRENCY` | backend | ISO currency code for prices (default `GBP`; see the note on yen below) |

Typical targets:

- **Local LGTM stack:** `FARO_URL=http://localhost:12347/collect` (an Alloy `faro.receiver`) and OTLP on `:4318`.
- **Grafana Cloud:** use the collector URL from *Frontend Observability → Web SDK configuration*, and the OTLP gateway endpoint plus token from your stack's connection details.

## Currency

The currency is set with `CURRENCY` (an ISO 4217 code, default `GBP`). It relabels prices; it does **not** convert them. Prices in [`backend/src/data.js`](backend/src/data.js) are integers in the currency's smallest unit (`priceCurrencyUnits`), so `450` is £4.50 for GBP.

The frontend ([`money()` in `frontend/src/util.js`](frontend/src/util.js)) asks `Intl.NumberFormat` how many decimal places the currency has, so zero-decimal currencies work too. With `CURRENCY=JPY` the same `450` is shown as **¥450**, not ¥4.50. Symbols and separators follow the browser's locale.

## What to show

| In the app | Telemetry |
|---|---|
| Page navigation | Faro views (`menu`, `product`, `cart`, `order`, `demo`) |
| Search / filter / add to cart / checkout | Faro events (`search`, `add_to_cart`, `checkout_started`, `order_placed`…) and a custom `order` measurement |
| Every API call | Browser span → backend span (same trace id), plus `inventory.check` and `payment.process` child spans on checkout |
| Backend logs | OTel logs carrying the trace id, for log ↔ trace correlation |
| Orders | Metrics: `coffee_cart.orders.placed`, `coffee_cart.checkout.failures`, `coffee_cart.order.value` |
| Random user identity | Faro `setUser` — each browser gets a stable fake username |

## Breaking things on purpose

Open **Demo controls** in the app (`/#/demo`).

| Control | Signal |
|---|---|
| Checkout fails | 500 from `payment.process`: error span, error log, Faro error and `checkout_failed` event |
| Slow menu | Visible latency in the trace waterfall |
| Out of stock product | 409 on add-to-cart / checkout — a business error rather than a crash |
| Random API errors | A percentage of all requests return 503 — shows up as an error rate |
| Uncaught exception | Faro exception with stack trace (source maps are generated at build time) |
| Unhandled promise rejection | Faro error from a different source |
| Handled error | Reported manually with `faro.api.pushError` |
| Broken image | Resource failure, reported via a capturing `error` listener |

The same controls are available over HTTP: `GET/POST/DELETE /api/chaos`.

## Why is CORS configured?

The frontend (`:8080`) and API (`:3000`) are different origins on purpose. Two things must be true for the trace to join up, and forgetting either is a common gotcha:

1. **Frontend:** `propagateTraceHeaderCorsUrls` in the `TracingInstrumentation` config must include the API origin ([`frontend/src/faro.js`](frontend/src/faro.js)), otherwise the browser SDK will not add the `traceparent` header to cross-origin requests.
2. **Backend:** CORS must list `traceparent` (and `tracestate`, `baggage`) in the allowed headers ([`backend/src/server.js`](backend/src/server.js)), otherwise the browser rejects the preflight.

## Project layout

```
backend/     Express API, OpenTelemetry setup (src/instrumentation.js), chaos controls
frontend/    Vanilla JS + Bulma, built with Vite; server.js is a tiny static server
docker-compose.yml
.env.example
```

## Running without Docker

```sh
# backend
cd backend && npm install && npm run dev
# frontend (Vite dev server on :5173; edit public/config.js for URLs)
cd frontend && npm install && npm run dev
```

When using the Vite dev server, set the backend's `FRONTEND_ORIGIN=http://localhost:5173`.
