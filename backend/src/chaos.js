// Failure injection. State is held in memory and controlled via /api/chaos.
// Each knob exists to produce a specific, recognisable signal in the telemetry.

const defaults = () => ({
  // Every checkout fails with a 500 from inside the payment.process span.
  checkoutFailure: false,
  // Extra latency (ms) added to GET /api/products.
  productsLatencyMs: 0,
  // A product id that reports as out of stock (409 on add-to-cart / checkout).
  outOfStockProductId: null,
  // Fraction (0..1) of all API requests that fail with a 503.
  errorRate: 0,
});

let state = defaults();

const get = () => ({ ...state });

function set(patch = {}) {
  const next = { ...state };
  if (typeof patch.checkoutFailure === 'boolean') next.checkoutFailure = patch.checkoutFailure;
  if (patch.productsLatencyMs !== undefined) {
    next.productsLatencyMs = Math.min(Math.max(Number(patch.productsLatencyMs) || 0, 0), 10_000);
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
