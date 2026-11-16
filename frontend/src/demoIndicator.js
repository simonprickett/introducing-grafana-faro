// Puts a warning emoji in front of "Demo controls" in the navbar whenever any demo control is
// away from its default, and lists what's active in the link's tooltip.
//
// Backend settings live on the server, so we remember the last state we saw: fetched once at
// start-up and refreshed from every response on the Demo controls page (no polling, no extra
// request per navigation). Frontend failure settings are local and read directly.

import { api } from './api.js';
import * as failures from './failures.js';

let backend = null;

const pct = (n) => `${Math.round(n * 100)}%`;

function describeActive() {
  const active = [];
  if (backend) {
    if (!backend.baselineLatency) active.push('baseline latency off');
    if (backend.checkoutFailure) active.push('checkout fails');
    if (backend.slowCallLatencyMs > 0) active.push(`slow calls +${backend.slowCallLatencyMs} ms on ${pct(backend.slowCallRate)}`);
    if (backend.outOfStockProductId) active.push(`${backend.outOfStockProductId} out of stock`);
    if (backend.errorRate > 0) active.push(`${pct(backend.errorRate)} API errors`);
  }
  const labels = {
    uncaught: 'uncaught exceptions',
    rejection: 'unhandled rejections',
    handled: 'handled errors',
    image: 'broken images',
  };
  const settings = failures.getSettings();
  for (const type of failures.TYPES) {
    if (settings[type].enabled) active.push(`${labels[type]} ${pct(settings[type].rate)}`);
  }
  return active;
}

export function renderDemoIndicator() {
  const link = document.getElementById('demo-link');
  if (!link) return;
  const active = describeActive();
  link.textContent = active.length ? '⚠️ Demo controls' : 'Demo controls';
  link.title = active.length ? `Active: ${active.join(', ')}` : '';
}

export function setBackendState(state) {
  backend = state;
  renderDemoIndicator();
}

export async function initDemoIndicator() {
  renderDemoIndicator(); // frontend settings are known immediately
  try {
    setBackendState(await api.getChaos());
  } catch {
    /* backend unreachable: leave the indicator based on frontend settings only */
  }
}
