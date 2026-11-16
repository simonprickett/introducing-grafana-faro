const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const { trace } = require('@opentelemetry/api');

const { CURRENCY, products, productsById, carts, orders } = require('./data');
const chaos = require('./chaos');
const { logger, withSpan, ordersPlaced, checkoutFailures, orderValue } = require('./telemetry');

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN || 'http://localhost:8080')
  .split(',')
  .map((s) => s.trim());

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = express();
app.use(express.json());

// The frontend is served from a different origin (different port), so the browser
// enforces CORS. `traceparent` (W3C Trace Context) must be an allowed request header,
// otherwise the browser will reject the preflight and front->back tracing breaks.
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'traceparent', 'tracestate', 'baggage'],
    maxAge: 600,
  }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCartView(cartId) {
  const cart = carts.get(cartId) ?? new Map();
  const items = [...cart].map(([productId, quantity]) => {
    const product = productsById.get(productId);
    return { product, quantity, lineTotalCurrencyUnits: product.priceCurrencyUnits * quantity };
  });
  const totalCurrencyUnits = items.reduce((sum, i) => sum + i.lineTotalCurrencyUnits, 0);
  return { cartId, currency: CURRENCY, items, totalCurrencyUnits };
}

const isOutOfStock = (product, quantity = 1) =>
  chaos.get().outOfStockProductId === product.id || product.stock < quantity;

// ---------------------------------------------------------------------------
// Baseline latency: a small random delay (5-60 ms, skewed towards the low end) on every
// API call, so request durations vary naturally. Toggled from the demo controls.
// ---------------------------------------------------------------------------
app.use('/api', async (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/chaos')) return next();
  if (chaos.get().baselineLatency) {
    await sleep(5 + Math.random() ** 2 * 55);
  }
  next();
});

// ---------------------------------------------------------------------------
// Chaos middleware: slow calls. A configurable fraction of requests are delayed, with
// jitter, inside a `chaos.slow_call` span so the delay is visible in the trace waterfall.
// ---------------------------------------------------------------------------
app.use('/api', async (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/chaos')) return next();
  const { slowCallLatencyMs, slowCallRate } = chaos.get();
  if (slowCallLatencyMs > 0 && Math.random() < slowCallRate) {
    const ms = Math.round(slowCallLatencyMs * (0.75 + Math.random() * 0.5));
    logger.warn('Injected slow call', { path: req.path, latencyMs: ms });
    await withSpan('chaos.slow_call', { 'chaos.latency_ms': ms }, () => sleep(ms));
  }
  next();
});

// ---------------------------------------------------------------------------
// Chaos middleware: random failures for everything except health + chaos control.
// ---------------------------------------------------------------------------
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/chaos')) return next();
  const { errorRate } = chaos.get();
  if (errorRate > 0 && Math.random() < errorRate) {
    return next(new HttpError(503, 'Service temporarily unavailable (injected)'));
  }
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/products', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const category = String(req.query.category ?? '').trim().toLowerCase();

  const result = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
  );

  logger.info('Listed products', { q, category, count: result.length });
  res.json({ currency: CURRENCY, products: result });
});

app.get('/api/products/:id', (req, res) => {
  const product = productsById.get(req.params.id);
  if (!product) throw new HttpError(404, `Product '${req.params.id}' not found`);
  res.json({ currency: CURRENCY, product });
});

app.get('/api/cart/:cartId', (req, res) => {
  res.json(buildCartView(req.params.cartId));
});

app.post('/api/cart/:cartId/items', (req, res) => {
  const { productId, quantity = 1 } = req.body ?? {};
  const product = productsById.get(productId);
  if (!product) throw new HttpError(404, `Product '${productId}' not found`);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    throw new HttpError(400, 'quantity must be an integer between 1 and 20');
  }
  if (isOutOfStock(product, quantity)) {
    logger.warn('Add to cart rejected: out of stock', { productId });
    throw new HttpError(409, `${product.name} is out of stock`);
  }

  const cart = carts.get(req.params.cartId) ?? new Map();
  cart.set(productId, (cart.get(productId) ?? 0) + quantity);
  carts.set(req.params.cartId, cart);

  logger.info('Added to cart', { cartId: req.params.cartId, productId, quantity });
  res.status(201).json(buildCartView(req.params.cartId));
});

app.delete('/api/cart/:cartId/items/:productId', (req, res) => {
  carts.get(req.params.cartId)?.delete(req.params.productId);
  res.json(buildCartView(req.params.cartId));
});

app.post('/api/checkout', async (req, res) => {
  const { cartId, name } = req.body ?? {};
  if (!cartId || typeof name !== 'string' || !name.trim()) {
    throw new HttpError(400, 'cartId and name are required');
  }
  const cart = buildCartView(cartId);
  if (cart.items.length === 0) throw new HttpError(400, 'Cart is empty');

  const span = trace.getActiveSpan();
  span?.setAttributes({
    'checkout.item_count': cart.items.length,
    'checkout.total_currency_units': cart.totalCurrencyUnits,
  });

  try {
    // 1. Check inventory
    await withSpan('inventory.check', { 'inventory.lines': cart.items.length }, async () => {
      await sleep(30 + Math.random() * 50);
      for (const { product, quantity } of cart.items) {
        if (isOutOfStock(product, quantity)) {
          throw new HttpError(409, `${product.name} is out of stock`);
        }
      }
    });

    // 2. Take payment (simulated - no real payment provider is involved)
    await withSpan(
      'payment.process',
      { 'payment.amount_currency_units': cart.totalCurrencyUnits, 'payment.currency': CURRENCY },
      async () => {
        await sleep(150 + Math.random() * 150);
        if (chaos.get().checkoutFailure) {
          throw new Error('Payment gateway error: upstream timeout');
        }
      },
    );
  } catch (err) {
    checkoutFailures.add(1, { reason: err instanceof HttpError ? 'inventory' : 'payment' });
    logger.error('Checkout failed', { cartId, error: err.message });
    throw err;
  }

  // 3. Create the order
  const order = {
    id: `ORD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    name: name.trim(),
    items: cart.items.map(({ product, quantity, lineTotalCurrencyUnits }) => ({
      productId: product.id,
      name: product.name,
      quantity,
      lineTotalCurrencyUnits,
    })),
    totalCurrencyUnits: cart.totalCurrencyUnits,
    currency: CURRENCY,
    createdAt: new Date().toISOString(),
  };
  for (const { product, quantity } of cart.items) product.stock -= quantity;
  orders.set(order.id, order);
  carts.delete(cartId);

  ordersPlaced.add(1);
  orderValue.record(order.totalCurrencyUnits);
  span?.setAttribute('order.id', order.id);
  logger.info('Order placed', { orderId: order.id, totalCurrencyUnits: order.totalCurrencyUnits });

  res.status(201).json(order);
});

app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) throw new HttpError(404, `Order '${req.params.id}' not found`);
  res.json(order);
});

// --- Chaos control ----------------------------------------------------------
app.get('/api/chaos', (req, res) => res.json(chaos.get()));

app.post('/api/chaos', (req, res) => {
  const state = chaos.set(req.body);
  logger.warn('Chaos settings changed', state);
  res.json(state);
});

app.delete('/api/chaos', (req, res) => {
  const state = chaos.reset();
  logger.info('Chaos settings reset', state);
  res.json(state);
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    // Attach the exception to the active (HTTP/express) span so it shows in the trace.
    trace.getActiveSpan()?.recordException(err);
    logger.error('Unhandled error', { path: req.path, status, error: err.message });
  }
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
  logger.info('coffee-cart backend listening', { port: PORT, allowedOrigins: ALLOWED_ORIGINS });
});
