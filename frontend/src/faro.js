import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { config } from './config.js';

let faro = null;

// --- Last API request, for the demo footer -----------------------------------------------
let lastRequest = null;
const listeners = new Set();

// The trace and span of each API call, keyed by the options object the caller passed to fetch.
// A failed call uses this to report its exception *with* the trace it belongs to, so the error
// can be opened as a trace. (Faro only attaches trace context to errors reported while a span is
// active, which is no longer true by the time we handle a response.)
const requestTraces = new WeakMap();
export const traceForRequest = (init) => requestTraces.get(init);

function recordApiRequest(span, request, result) {
  const attrs = span.attributes ?? {};
  const url = String(attrs['url.full'] ?? attrs['http.url'] ?? '');
  if (url && !url.startsWith(config.apiUrl)) return;
  if (request && typeof request === 'object') {
    const { traceId, spanId } = span.spanContext();
    requestTraces.set(request, { traceId, spanId });
  }
  if (url.includes('/api/chaos')) return; // demo control plane, not part of the shop flow
  lastRequest = {
    traceId: span.spanContext().traceId,
    method: String(attrs['http.request.method'] ?? attrs['http.method'] ?? request?.method ?? 'GET'),
    path: url ? url.slice(config.apiUrl.length) : '',
    status: result?.status || 'failed',
  };
  listeners.forEach((fn) => fn(lastRequest));
}

export const getLastRequest = () => lastRequest;
export const onLastRequest = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const isFaroEnabled = () => faro !== null;
export const getSessionId = () => faro?.metas.value.session?.id ?? null;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function startFaro() {
  if (!config.faroUrl) {
    console.info('[faro] FARO_URL is empty - Faro is disabled');
    return;
  }

  // Faro reads the build's bundle ID from this global and sends it with every event. Grafana
  // Cloud uses it to find the source maps uploaded for the same build.
  if (config.bundleId) window[`__faroBundleId_${config.appName}`] = config.bundleId;

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
          // Called when each fetch span ends. We use it to remember the trace ID of the last
          // API call, for the demo footer.
          fetchInstrumentationOptions: { applyCustomAttributesOnSpan: recordApiRequest },
          // The API is on a different origin, so we must opt in to header propagation
          // (and the backend must allow the header via CORS). Without this the trace
          // stops at the browser and never joins up with the backend.
          propagateTraceHeaderCorsUrls: [new RegExp(`^${escapeRegExp(config.apiUrl)}`)],
        },
      }),
    ],
  });

  if (config.replay) startReplay();
}

// Session replay records the page so a visitor's session can be watched back in Grafana Cloud.
// The recorder is large, so it is only downloaded when FARO_REPLAY=true.
async function startReplay() {
  try {
    const { ReplayInstrumentation } = await import('@grafana/faro-instrumentation-replay');
    faro.instrumentations.add(
      new ReplayInstrumentation({
        // The recorder masks all text and inputs by default. This demo has no real personal data,
        // so only elements marked with the class "grafana-mask" are masked. A real app should keep
        // the defaults, or mask whatever is sensitive.
        maskTextSelector: '.grafana-mask',
        maskAllInputs: false,
        // Put the page's CSS into the recording. Otherwise it only holds a link to
        // http://localhost:8080/assets/..., which the Grafana Cloud player doesn't load, and the
        // replay plays back unstyled.
        inlineStylesheet: true,
      }),
    );
    console.info('[faro] session replay is on');
  } catch (err) {
    console.warn('[faro] could not start session replay', err);
  }
}

// Thin wrappers so the rest of the app works whether or not Faro is enabled.
const toStrings = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));

// User actions group everything a click causes (API calls, DOM changes, errors, events) under
// one named action. Most are declared in the HTML with `data-faro-user-action-name` (see
// actionAttrs in util.js). Use this for ones that have no single element to tag, e.g. a
// debounced search or a form that can be submitted with the Enter key.
export const startUserAction = (name, attributes) =>
  faro?.api.startUserAction(name, toStrings(attributes), {
    triggerName: 'programmatic',
    initialActivityTimeout: 1000,
  });

export const setUser = (user) => faro?.api.setUser(user);
export const setView = (name) => faro?.api.setView({ name });
export const trackEvent = (name, attributes) => faro?.api.pushEvent(name, toStrings(attributes));
export const trackMeasurement = (type, values) => faro?.api.pushMeasurement({ type, values });
// spanContext ({ traceId, spanId }) links the exception to a trace. Optional: errors with no
// request behind them (a broken image, a bug in the UI code) have no trace to link to.
export const reportError = (error, context, spanContext) =>
  faro?.api.pushError(error, {
    ...(context && { context: toStrings(context) }),
    ...(spanContext && { spanContext }),
  });
