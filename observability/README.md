# Local observability stack

An open source LGTM stack for the coffee cart demo. It is **separate from the app**: it has its own compose project, so you start it once and leave it running while you rebuild and restart the app.

```
browser (Faro) ──► Alloy faro.receiver :12347 ──► Loki + Tempo ─┐
                                                                ├─► Grafana :3001
backend (OTel) ──► OTLP :4318 ──────────────────► Tempo/Loki/Mimir ┘
                                   (all inside the grafana/otel-lgtm container)
```

## Start and stop

From the repository root:

```sh
docker compose -f observability/docker-compose.yml up -d     # start
docker compose -f observability/docker-compose.yml logs -f   # watch the logs
docker compose -f observability/docker-compose.yml down      # stop, keep data
docker compose -f observability/docker-compose.yml down -v   # stop and wipe all data
```

Then start the app as normal (`docker compose up --build`). Its defaults already point here.

| What | URL |
|---|---|
| Grafana (no login needed on this image; `admin` / `admin` if asked) | http://localhost:3001 |
| Faro collector (what `FARO_URL` points at) | http://localhost:12347/collect |
| OTLP HTTP / gRPC (what the backend sends to) | `:4318` / `:4317` |
| Alloy UI (debugging the receiver pipeline) | http://localhost:12345 |

Grafana is on **3001** because the app's API uses 3000.

## The demo dashboard

Open **Coffee Cart: Faro and backend** in Grafana (Dashboards, or http://localhost:3001/d/coffee-cart-faro). It is provisioned automatically from `grafana/dashboards/coffee-cart.json`, so it is there after `up -d` with nothing to import. It reads top to bottom in demo order:

The dashboard tells one story: **the backend says all is well, but users are having a worse time than the server knows.** It reads top to bottom:

| Row | Shows | The point |
|---|---|---|
| The story | **What the server saw** (share of API requests that failed) next to **What users hit** (share of sessions with an error or a frustrated click), **Errors the backend never saw**, sessions and orders. Below, two charts over time: load, and "trouble per minute" with the server's errors against the users' errors. | The two headline numbers differ by roughly ten times, and the browser lines move when the backend line doesn't. |
| Where did the user-visible errors come from? | Backend call failed vs browser only, the top errors, where users get frustrated, and recent exceptions with resolved stack traces | Over half of what users hit never touched the backend: broken images, JavaScript errors, bad data, dead buttons. |
| Follow one visitor | Paste a session ID to see everything that visitor did, and their traces | Sessions tie events, errors and traces together. |
| Details (collapsed) | Web vitals, page views and user actions, browsers and OS, latency, status codes, orders, frustration over time, backend errors | Supporting evidence, if someone asks. |

The purple dashed lines on the charts mark where each phase of a [traffic generator](../traffic/README.md) run started (normal, heavy, errors, recovery). Hover one for its name. They are Grafana annotations tagged `coffee-cart-phase`, posted by the generator, and they only appear for runs on this Grafana.

### The hello world dashboard

**Faro hello world** (http://localhost:3001/d/faro-hello) goes with the [`hello/`](../hello/README.md) page, the simplest Faro demo. Its rows are named after the page's buttons: page load, requests, things going wrong, things you choose to send, and a timeline of everything received.

### The frontend dashboard

**Coffee Cart: Frontend (Faro)** (http://localhost:3001/d/coffee-cart-frontend) is for a talk about Faro. It is all about the browser, and links to and from the story dashboard.

| Row | Shows |
|---|---|
| Is the frontend healthy? | Sessions, share of sessions with no problems, exceptions, frustrated clicks, and Largest Contentful Paint and Interaction to Next Paint with good/poor colours |
| What users do | The shopping funnel (viewed a product, added to cart, started checkout, placed an order), page views by view, most used actions, and how long each action takes (p95) |
| What goes wrong | Exceptions over time by type, top exceptions, exceptions by page, by browser and OS, and frustration signals |
| From an exception to its trace | Recent exceptions with a **trace column you can click**, the **source-mapped stack traces** (file and line of each frame, with the page, user, session and trace), plus browser traces that had errors and the slowest browser traces |
| Follow one visitor | The same session timeline and traces as on the other dashboard |

**Exception to trace:** an exception from a failed API call carries the trace ID of that call. Click it in the table to open the trace in Explore: the browser span, flagged as an error, with the backend spans beneath it. Exceptions with no request behind them (a broken image, a bug in the UI code) have an empty trace cell, because there is nothing to trace.

This works because the app records each request's trace and span ID and passes them to Faro when it reports the failure (`traceForRequest` in `frontend/src/faro.js`, used in `frontend/src/api.js`). Faro only attaches trace context on its own when an error is reported while a span is active, and by the time a response is handled it no longer is.

### Follow one visitor

The last row of the dashboard has its own **Session ID** box in the row header, right above the panels it controls: the timeline of one session's events, errors and measurements, and their traces. Copy a session ID from the app's footer, or from a `session=...` value in the exceptions above, paste it in and **press Enter**. Leave it as `.+` to see every session mixed together.

Grafana's classic dashboards can only put variables at the top of the whole dashboard. This one uses the newer dashboard format (v2, "dynamic dashboards"), which allows a variable scoped to a row. It needs a recent Grafana, and the bundled `grafana/otel-lgtm` image has one. An older Grafana won't load it.

To fill the dashboard with data, run the [traffic generator](../traffic/README.md) (`npm run showcase`). Set the time range to cover the run, for example the last 30 minutes. Panels are slow to load while they scroll into view; give it a moment.

To change either dashboard: edit in Grafana, then use **Export** and replace `grafana/dashboards/coffee-cart.json`. Edits made only in the UI are lost when the stack is recreated. The file is the source of truth.

Some caveats:
- The web vitals come from headless browsers on localhost, so they are much faster than real users would see.
- The two headline percentages are deliberately not like for like: one is per request, one is per session. The point is that a user feels a problem even when most requests succeed.
- The percentages come from synthetic traffic with injected failures, so the shape is real but the exact ratios are not.
- Loki limits queries to 500 series, so panels count `session_start` events rather than distinct session IDs.

## Source maps

Stack traces in exceptions are minified unless Alloy has the build's source maps. Alloy can't download them (inside its container `localhost:8080` isn't the frontend), so copy them in:

```sh
observability/fetch-sourcemaps.sh
```

`./start.sh local` runs it for you after starting the app. Run it by hand after any other frontend rebuild, since the file names contain a content hash. No Alloy restart is needed. The maps are written to `observability/sourcemaps/` (git ignored). With them, a stack frame reads `failures.js:81` instead of `index-D0JEEeBm.js:20:180088`.

## Stack traces

Faro captures a stack trace with every browser exception. They are readable (original file names and line numbers) only if Alloy has the build's source maps; see **Source maps** above. You can see them in three places:
- The **Stack traces** panel on the frontend dashboard, under the exceptions table.
- The **Recent frontend exceptions** panel on the story dashboard: expand a line.
- Explore, with Loki: `{service_name="coffee-cart-frontend", kind="exception"}`, then expand a line and read its `stacktrace` field.

## Finding your data

Open Grafana at http://localhost:3001 and go to **Explore**. Data takes a few seconds to appear.

| Where | Query | What you get |
|---|---|---|
| Loki | `{service_name="coffee-cart-frontend"}` | Faro events, measurements, exceptions and logs from the browser |
| Loki | `{service_name="coffee-cart-frontend", kind="event"}` | Just events. `kind` is also `measurement`, `exception` or `log`. |
| Loki | `{service_name="coffee-cart-backend"}` | Backend logs. Add `\| trace_id="<id>"` to find the logs for one trace. |
| Tempo | `{resource.service.name="coffee-cart-frontend"}` (TraceQL) | Browser traces, each joined to its backend spans |
| Prometheus | `http_server_request_duration_seconds_count` | Backend metrics |

Tips:

- The trace ID and session ID are shown in the app's footer. Paste the trace ID into Tempo's TraceQL or ID lookup.
- Faro puts the session in each line as `session_id=...`, so `{service_name="coffee-cart-frontend"} |= "session_id=<id>"` follows one visitor.
- If the frontend streams are missing, check the Network tab for POSTs to `localhost:12347/collect`. A `202` means Alloy accepted them. Also look at http://localhost:12345.

## Watching data go through Alloy

The config turns on Alloy's **live debugging**. Open http://localhost:12345, click the `loki.process.faro` component, then its **Live debugging** tab. Every Faro log line shows up as it arrives (`[IN]`), and again after the labelling stage (`[OUT]`), where `service_name`, `deployment_environment` and `kind` have been added. Use the filter box to follow one app, for example `faro-hello`.

It only works for logs. The Faro receiver and the OTLP exporter don't support live debugging, so Alloy can't show spans. The closest it gets is the `faro.tracing.fetch` log lines, which carry a `traceID`. To see the traces themselves, use Tempo in Grafana.

## Ports and networking

Both compose projects publish ports on the host and don't share a network. The app's backend reaches OTLP through `host.docker.internal:4318`, and the browser reaches Alloy on `localhost:12347`. So the stack and the app can be started, stopped and rebuilt independently.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FARO_ALLOWED_ORIGINS` | `http://localhost:8080,http://localhost:8081` (coffee cart and hello world) | Origin(s) allowed by Alloy's CORS check, comma separated. Set it if you serve the frontend from elsewhere. |

If the browser console shows a CORS error posting to `/collect`, this is the first thing to check.

## Files

- `docker-compose.yml`: the `lgtm` and `alloy` services.
- `grafana/`: the provisioned dashboard (`dashboards/coffee-cart.json` and `coffee-cart-frontend.json`, in Grafana's v2 format) and the provider config that loads it.
- `fetch-sourcemaps.sh`: copies the frontend's source maps for Alloy (see above).
- `alloy/config.alloy`: the Faro receiver and where it forwards to. A `loki.process` stage sets `service_name`, `deployment_environment` and `kind` labels from the Faro log line. Without it, Loki files all browser data under `service_name="unknown_service"`.
