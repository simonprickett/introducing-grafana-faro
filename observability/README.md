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

## Ports and networking

Both compose projects publish ports on the host and don't share a network. The app's backend reaches OTLP through `host.docker.internal:4318`, and the browser reaches Alloy on `localhost:12347`. So the stack and the app can be started, stopped and rebuilt independently.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FARO_ALLOWED_ORIGINS` | `http://localhost:8080` | Origin(s) allowed by Alloy's CORS check, comma separated. Set it if you serve the frontend from elsewhere. |

If the browser console shows a CORS error posting to `/collect`, this is the first thing to check.

## Files

- `docker-compose.yml`: the `lgtm` and `alloy` services.
- `alloy/config.alloy`: the Faro receiver and where it forwards to. A `loki.process` stage sets `service_name`, `deployment_environment` and `kind` labels from the Faro log line. Without it, Loki files all browser data under `service_name="unknown_service"`.
