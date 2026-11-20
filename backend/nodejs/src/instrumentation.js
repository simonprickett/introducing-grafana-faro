// OpenTelemetry bootstrap. Loaded BEFORE the app via `node --require` so that
// http/express are patched before they are imported.
//
// Configuration is entirely through the standard OTel environment variables:
//   OTEL_SERVICE_NAME                 (default: coffee-cart-backend)
//   OTEL_EXPORTER_OTLP_ENDPOINT       (default: http://localhost:4318)
//   OTEL_EXPORTER_OTLP_HEADERS        (e.g. Authorization=Basic ... for Grafana Cloud)
//   OTEL_EXPORTER_OTLP_PROTOCOL       (http/protobuf is used here)
// See https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

process.env.OTEL_SERVICE_NAME ||= 'coffee-cart-backend';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 10_000,
    }),
  ],
  // Logs: no explicit setup. NodeSDK creates an OTLP log exporter from the OTEL_* variables.
  instrumentations: [
    new HttpInstrumentation({
      // Don't create spans for health checks or CORS preflights - they are noise.
      ignoreIncomingRequestHook: (req) =>
        req.url === '/api/health' || req.method === 'OPTIONS',
    }),
    new ExpressInstrumentation(),
  ],
});

sdk.start();

// Flush any buffered telemetry on shutdown.
const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
