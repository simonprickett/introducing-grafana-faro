const c = window.__CONFIG__ ?? {};

export const config = {
  apiUrl: (c.apiUrl ?? 'http://localhost:3000').replace(/\/$/, ''),
  faroUrl: c.faroUrl ?? '',
  appName: c.appName ?? 'coffee-cart-frontend',
  appVersion: c.appVersion ?? '1.0.0',
  appEnv: c.appEnv ?? 'local',
};
