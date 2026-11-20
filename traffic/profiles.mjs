// Traffic phases. A phase is "how many visitors at once, how fast they act, and what is broken".
//
//   visitors              concurrent browsers
//   think                 [min, max] ms pause between steps (a person reading and deciding)
//   backend               chaos settings POSTed to /api/chaos for the duration of the phase
//   flapCheckout          toggle backend checkoutFailure on and off every N seconds, so some
//                         orders succeed and some fail (a permanent failure means no orders at all)
//   frontendFailureShare  fraction of visitors whose browser has the frontend failure toggles on
//   frustratedShare       fraction of visitors who hammer an unresponsive button (rage clicks)

export const PHASES = {
  normal: {
    label: 'Normal load',
    visitors: 3,
    think: [1500, 5000],
    backend: {},
    flapCheckout: 0,
    frontendFailureShare: 0,
    frustratedShare: 0,
  },
  heavy: {
    label: 'Heavy load',
    visitors: 15,
    think: [200, 1200],
    backend: {},
    flapCheckout: 0,
    frontendFailureShare: 0,
    frustratedShare: 0,
  },
  errors: {
    label: 'Error states',
    visitors: 5,
    think: [1000, 3500],
    backend: { errorRate: 0.08, slowCallLatencyMs: 1500, slowCallRate: 0.15 },
    flapCheckout: 20,
    frontendFailureShare: 0.5,
    frustratedShare: 0.2,
  },
};

// Seconds per phase for `showcase`, which fills the dashboard with all three states.
export const SHOWCASE = [
  ['normal', 180],
  ['heavy', 120],
  ['errors', 180],
  ['normal', 120],
];

// Frontend failure toggles, as stored in the app's localStorage ("frontendFailures").
export const FRONTEND_FAILURES = {
  uncaught: { enabled: true, rate: 0.12 },
  rejection: { enabled: true, rate: 0.1 },
  handled: { enabled: true, rate: 0.2 },
  image: { enabled: true, rate: 0.1 },
  unresponsive: { enabled: true, rate: 0.15 },
};

// A visitor who always hits dead buttons, so repeat clicks become rage clicks.
export const FRUSTRATED_FAILURES = {
  ...Object.fromEntries(Object.keys(FRONTEND_FAILURES).map((k) => [k, { enabled: false, rate: 0.25 }])),
  unresponsive: { enabled: true, rate: 1 },
};
