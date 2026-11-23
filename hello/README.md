# Faro hello world

The smallest Faro demo: one HTML page, one JSON file, no build and no backend. Use it as the first thing you show, before the [coffee cart](../README.md).

Each button on the page sends one kind of thing to Faro:

| Button | What Faro captures |
|---|---|
| (page load) | session, page view, web vitals |
| Load products | a `fetch` span (a trace with just the browser side) |
| Load a file that isn't there | a failed request and a handled exception |
| Throw an error | an uncaught exception with its stack trace |
| Click me (I do nothing) | a dead click (click it several times fast for a rage click) |
| Send a log / Send an event | your own log line and event |

The Faro setup is the `initializeFaro` call at the top of `index.html`. Everything else is buttons.

## Run it

Start the [observability stack](../observability/README.md), then serve this folder on port 8081:

```sh
npx serve hello -l 8081        # or: python3 -m http.server 8081 --directory hello
```

Open http://localhost:8081 and click around. Then open the **Faro hello world** dashboard in Grafana: http://localhost:3001/d/faro-hello

Alloy only accepts browsers from allowed origins, and the default list includes `http://localhost:8081`. If you serve it elsewhere, add that origin to `FARO_ALLOWED_ORIGINS`.

## Files

- `index.html`: the page and the Faro setup.
- `data.json`: the fixture the page loads.
- `vendor/`: Faro 2.14.0's browser bundles (copied from `@grafana/faro-web-sdk` and `@grafana/faro-web-tracing`), so the page works offline.

To use Grafana Cloud instead, change `url` in `index.html` to the Cloud collector URL.
