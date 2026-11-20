// Helpers for the manual (non auto-instrumented) parts of our telemetry:
// a tracer, a few business metrics, and a logger that emits both to stdout and
// to OTel Logs. Log records written while a span is active automatically carry
// that span's trace_id/span_id, which is what enables log <-> trace correlation.

// The logs API ships inside @opentelemetry/api (1.10+). Importing it from the separate
// @opentelemetry/api-logs package gives a different global registry, and records are dropped.
const { trace, metrics, logs, SeverityNumber, SpanStatusCode, isSpanContextValid } = require('@opentelemetry/api');

const tracer = trace.getTracer('coffee-cart');
const meter = metrics.getMeter('coffee-cart');
const otelLogger = logs.getLogger('coffee-cart');

const ordersPlaced = meter.createCounter('coffee_cart.orders.placed', {
  description: 'Orders successfully placed',
});
const checkoutFailures = meter.createCounter('coffee_cart.checkout.failures', {
  description: 'Checkouts that failed',
});
const orderValue = meter.createHistogram('coffee_cart.order.value', {
  description: 'Order value in minor currency units',
  unit: '{currency_unit}',
});

const levels = {
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

function log(level, message, attributes = {}) {
  // Include the trace/span IDs in the stdout line too, so `docker compose logs backend` can be
  // searched by the trace ID shown in the frontend's footer. (The OTLP record gets them from
  // the active context automatically.)
  const spanContext = trace.getActiveSpan()?.spanContext();
  const ids = spanContext && isSpanContextValid(spanContext)
    ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
    : {};
  console.log(JSON.stringify({ level, message, ...ids, ...attributes }));
  otelLogger.emit({
    severityNumber: levels[level],
    severityText: level.toUpperCase(),
    body: message,
    attributes,
  });
}

const logger = {
  info: (m, a) => log('info', m, a),
  warn: (m, a) => log('warn', m, a),
  error: (m, a) => log('error', m, a),
};

// Run fn inside a new child span; record exceptions and set error status.
async function withSpan(name, attributes, fn) {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

module.exports = { tracer, logger, withSpan, ordersPlaced, checkoutFailures, orderValue };
