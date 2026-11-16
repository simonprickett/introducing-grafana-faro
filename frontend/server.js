// Tiny static file server for the built frontend.
// It also generates /config.js from environment variables, so the same image can
// point at a local LGTM stack or Grafana Cloud without being rebuilt.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 8080;

const runtimeConfig = {
  // Where the *browser* reaches the API (not the docker-internal hostname).
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  // Faro collector URL (Alloy faro.receiver, or the Grafana Cloud Faro endpoint).
  // Leave empty to run the app with Faro disabled.
  faroUrl: process.env.FARO_URL ?? 'http://localhost:12347/collect',
  appName: process.env.FARO_APP_NAME || 'coffee-cart-frontend',
  appVersion: process.env.FARO_APP_VERSION || '1.0.0',
  appEnv: process.env.FARO_APP_ENV || 'local',
};

const app = express();

app.get('/config.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-store');
  res.send(`window.__CONFIG__ = ${JSON.stringify(runtimeConfig)};\n`);
});

app.use(express.static(dist));

app.listen(port, () => {
  console.log(`frontend listening on :${port}`, runtimeConfig);
});
