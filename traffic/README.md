# Traffic generator

Synthetic visitors for the coffee cart. They drive **real headless browsers** (Playwright), so Faro instruments them exactly as it would real users: sessions, views, user actions, web vitals, errors and frustration signals. It exists so the dashboard has history and the demo has something to show on a quiet laptop.

Each visit is a fresh browser context, so it gets a new Faro session and a new fake user. Visitors use a spread of browsers and devices (Mac, Windows, Linux, iPhone, Android) and one of three personas: browsing, searching, or shopping (some abandon their cart).

## Run it

The app must be running (`docker compose up`), ideally with the observability stack too.

```sh
cd traffic
npm install
npm run setup          # downloads Chromium once

npm run normal         # 3 visitors at a relaxed pace, 10 minutes
npm run heavy          # 15 visitors, short think time, 10 minutes
npm run errors         # things go wrong, 10 minutes
npm run showcase       # normal -> heavy -> errors -> recovery, about 10 minutes
```

Each phase start is posted to Grafana as an annotation (tag `coffee-cart-phase`), so it shows as a marker on the dashboard charts. If Grafana isn't reachable the run carries on without markers. Options: `--grafana http://localhost:3001`, `--duration 5m` (single profiles), `--scale 2` (stretch `showcase`), `--visitors 8` (override concurrency), `--url`, `--api`, `--headed` (watch the browsers). `Ctrl+C` lets visits finish and tidies up.

## What each phase does

| Phase | Load | What's different |
|---|---|---|
| `normal` | 3 visitors, 1.5 to 5 s between steps | Nothing is broken. This is the baseline. |
| `heavy` | 15 visitors, 0.2 to 1.2 s between steps | Volume only. More requests, sessions and orders. |
| `errors` | 5 visitors | Backend: 8% of requests return 503, 15% are about 1.5 s slow, checkout alternates between failing and working every 20 s. Frontend: half the visitors have uncaught exceptions, rejections, handled errors, broken images and dead buttons switched on, and 1 in 5 hammers a dead button (rage clicks). |
| `showcase` | all of the above in order | 3 min normal, 2 min heavy, 3 min errors, 2 min recovery. |

Heavy load here means more traffic, not a struggling backend: the demo API has nothing to saturate. If you want latency to climb with load, run `heavy` while turning on **Slow API calls** in Demo controls.

## Things to know

- **Backend chaos is global.** The `errors` phase sets it through `/api/chaos` and resets it when the phase ends or you press Ctrl+C. Don't change Demo controls by hand while it runs.
- **Stock runs out.** Each product starts with 25 units, orders deplete them, and nothing restocks it until the backend restarts. Start the app with `PRODUCT_STOCK=100000 docker compose up -d` (or set it in `.env`) before generating traffic, otherwise you'll see 409 out of stock errors after a few minutes. Without it, `docker compose restart backend` restocks (and resets chaos and carts).
- **Headless Chromium** is used throughout. It reports web vitals normally, but treat the numbers as indicative, not as real-user performance.
- `DEBUG_TRAFFIC=1` prints why a visitor's step failed.
