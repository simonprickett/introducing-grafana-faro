// Tiny static file server for the built frontend.
// It also generates /config.js from environment variables, so the same image can
// point at a local LGTM stack or Grafana Cloud without being rebuilt.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 8080;

// Identifies this build to Faro. It is the content hash in the main script's file name, so it
// changes with every build. Faro sends it with each event, and Grafana Cloud uses it to pick the
// source map uploaded for the same build (see observability/upload-sourcemaps-cloud.sh).
const bundleId = (() => {
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    return html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? '';
  } catch {
    return '';
  }
})();

const runtimeConfig = {
  // Where the *browser* reaches the API (not the docker-internal hostname).
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  // Faro collector URL (Alloy faro.receiver, or the Grafana Cloud Faro endpoint).
  // Leave empty to run the app with Faro disabled.
  faroUrl: process.env.FARO_URL ?? 'http://localhost:12347/collect',
  appName: process.env.FARO_APP_NAME || 'coffee-cart-frontend',
  appVersion: process.env.FARO_APP_VERSION || '1.0.0',
  appEnv: process.env.FARO_APP_ENV || 'local',
  bundleId,
  // Session replay: records what each visitor saw, to watch back in Grafana Cloud.
  replay: process.env.FARO_REPLAY === 'true',
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
