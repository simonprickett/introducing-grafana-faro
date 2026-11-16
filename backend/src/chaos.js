// Failure injection. State is held in memory and controlled via /api/chaos.
// Each knob exists to produce a specific, recognisable signal in the telemetry.

const defaults = () => ({
  // Not a failure: adds a small random delay to every API call so durations look like a
  // real service rather than a flat ~2 ms. On by default; switch off for a "perfect" baseline.
  baselineLatency: true,
  // Every checkout fails with a 500 from inside the payment.process span.
  checkoutFailure: false,
  // Slow calls: a fraction (slowCallRate, 0..1) of API requests get roughly
  // slowCallLatencyMs of extra delay (+/-25% jitter so durations vary). 0 ms = off.
  slowCallLatencyMs: 0,
  slowCallRate: 0.25,
  // A product id that reports as out of stock (409 on add-to-cart / checkout).
  outOfStockProductId: null,
  // Fraction (0..1) of all API requests that fail with a 503.
  errorRate: 0,
});

let state = defaults();

const get = () => ({ ...state });

function set(patch = {}) {
  const next = { ...state };
  if (typeof patch.baselineLatency === 'boolean') next.baselineLatency = patch.baselineLatency;
  if (typeof patch.checkoutFailure === 'boolean') next.checkoutFailure = patch.checkoutFailure;
  if (patch.slowCallLatencyMs !== undefined) {
    next.slowCallLatencyMs = Math.min(Math.max(Number(patch.slowCallLatencyMs) || 0, 0), 10_000);
  }
  if (patch.slowCallRate !== undefined) {
    next.slowCallRate = Math.min(Math.max(Number(patch.slowCallRate) || 0, 0), 1);
  }
  if (patch.outOfStockProductId !== undefined) {
    next.outOfStockProductId = patch.outOfStockProductId || null;
  }
  if (patch.errorRate !== undefined) {
    next.errorRate = Math.min(Math.max(Number(patch.errorRate) || 0, 0), 1);
  }
  state = next;
  return get();
}

const reset = () => {
  state = defaults();
  return get();
};

module.exports = { get, set, reset };
