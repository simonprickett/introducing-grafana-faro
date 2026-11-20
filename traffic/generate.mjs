#!/usr/bin/env node
// Synthetic traffic for the coffee cart. Drives real (headless) browsers, so Faro instruments
// the visits exactly as it would real users: sessions, views, user actions, web vitals, errors.
//
//   node generate.mjs normal    [--duration 10m]
//   node generate.mjs heavy     [--duration 5m]
//   node generate.mjs errors    [--duration 5m]
//   node generate.mjs showcase  [--scale 1]       normal -> heavy -> errors -> recovery
//
// Options: --url (frontend, default http://localhost:8080)  --api (default http://localhost:3000)
//          --visitors N (override concurrency)  --headed (show the browsers)
//          --grafana (default http://localhost:3001) where phase markers are posted as annotations
import { chromium } from 'playwright';
import { PHASES, SHOWCASE } from './profiles.mjs';
import { visit } from './visitor.mjs';

const args = process.argv.slice(2);
const profile = args.find((a) => !a.startsWith('--')) ?? 'normal';
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const baseUrl = opt('url', 'http://localhost:8080').replace(/\/$/, '');
const apiUrl = opt('api', 'http://localhost:3000').replace(/\/$/, '');
const scale = Number(opt('scale', 1));
const grafanaUrl = opt('grafana', 'http://localhost:3001').replace(/\/$/, '');
const visitorsOverride = opt('visitors') ? Number(opt('visitors')) : null;

const seconds = (text) => {
  const m = /^(\d+(?:\.\d+)?)(s|m|h)?$/.exec(String(text));
  if (!m) throw new Error(`Bad duration "${text}" (try 90s, 10m, 1h)`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600, undefined: 1 }[m[2]];
};

const plan = profile === 'showcase'
  ? SHOWCASE.map(([name, secs]) => [name, secs * scale])
  : PHASES[profile]
    ? [[profile, seconds(opt('duration', '10m'))]]
    : null;
if (!plan) {
  console.error(`Unknown profile "${profile}". Use: ${[...Object.keys(PHASES), 'showcase'].join(', ')}`);
  process.exit(1);
}

const stats = { visits: 0, orders: 0, orderFailures: 0, adds: 0, frustrated: 0, stepErrors: 0, active: 0 };
let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  console.log('\nStopping: letting current visits finish (Ctrl+C again to force)...');
});

const chaos = (method, body) =>
  fetch(`${apiUrl}/api/chaos`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

// Mark the start of each phase on the dashboard's charts. Best effort: if Grafana isn't there the
// run carries on without markers.
const annotate = (text) =>
  fetch(`${grafanaUrl}/api/annotations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ time: Date.now(), text, tags: ['coffee-cart-phase'] }),
  }).catch(() => {});

async function runPhase(browser, name, secs) {
  const phase = PHASES[name];
  const visitors = visitorsOverride ?? phase.visitors;
  const end = Date.now() + secs * 1000;
  const touchesBackend = Object.keys(phase.backend).length > 0 || phase.flapCheckout > 0;
  console.log(`\n== ${phase.label}: ${visitors} visitors for ${Math.round(secs)}s ==`);
  await annotate(phase.label);

  let flap;
  if (touchesBackend) {
    await chaos('POST', phase.backend);
    if (phase.flapCheckout) {
      let on = false;
      flap = setInterval(() => chaos('POST', { checkoutFailure: (on = !on) }).catch(() => {}), phase.flapCheckout * 1000);
    }
  }
  const ticker = setInterval(() => {
    const s = stats;
    console.log(`  visits ${s.visits} (active ${s.active})  adds ${s.adds}  orders ${s.orders}  failed orders ${s.orderFailures}  rage ${s.frustrated}  step errors ${s.stepErrors}`);
  }, 10_000);

  const worker = async (i) => {
    await new Promise((r) => setTimeout(r, i * 400)); // stagger so they don't all start at once
    while (Date.now() < end && !stopping) {
      stats.active += 1;
      try {
        await visit(browser, phase, { baseUrl, stats });
      } catch (err) {
        console.error('  visit failed:', err.message.split('\n')[0]);
      }
      stats.active -= 1;
    }
  };
  try {
    await Promise.all(Array.from({ length: visitors }, (_, i) => worker(i)));
  } finally {
    clearInterval(ticker);
    clearInterval(flap);
    if (touchesBackend) {
      await chaos('DELETE').catch(() => {});
      console.log('  backend chaos reset');
    }
  }
}

const health = await fetch(`${baseUrl}/config.js`).catch(() => null);
if (!health?.ok) {
  console.error(`Can't reach the app at ${baseUrl}. Is it running? (docker compose up)`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: !args.includes('--headed') });
try {
  for (const [name, secs] of plan) {
    if (stopping) break;
    await runPhase(browser, name, secs);
  }
} finally {
  await annotate('End of test run');
  await browser.close();
}
console.log('\nDone.', JSON.stringify(stats));
