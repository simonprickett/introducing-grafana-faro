import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { config } from './config.js';

let faro = null;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function startFaro() {
  if (!config.faroUrl) {
    console.info('[faro] FARO_URL is empty - Faro is disabled');
    return;
  }

  faro = initializeFaro({
    url: config.faroUrl,
    app: {
      name: config.appName,
      version: config.appVersion,
      environment: config.appEnv,
    },
    instrumentations: [
      // Errors, console, web vitals, sessions, user interactions, navigation...
      ...getWebInstrumentations({ captureConsole: true }),

      // OpenTelemetry tracing for fetch/XHR. This is what creates the browser-side
      // spans and injects the W3C `traceparent` header on outgoing requests.
      new TracingInstrumentation({
        instrumentationOptions: {
          // The API is on a different origin, so we must opt in to header propagation
          // (and the backend must allow the header via CORS). Without this the trace
          // stops at the browser and never joins up with the backend.
          propagateTraceHeaderCorsUrls: [new RegExp(`^${escapeRegExp(config.apiUrl)}`)],
        },
      }),
    ],
  });
}

// Thin wrappers so the rest of the app works whether or not Faro is enabled.
const toStrings = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));

export const setUser = (user) => faro?.api.setUser(user);
export const setView = (name) => faro?.api.setView({ name });
export const trackEvent = (name, attributes) => faro?.api.pushEvent(name, toStrings(attributes));
export const trackMeasurement = (type, values) => faro?.api.pushMeasurement({ type, values });
export const reportError = (error, context) =>
  faro?.api.pushError(error, context ? { context: toStrings(context) } : undefined);
