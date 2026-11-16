import 'bulma/css/bulma.min.css';
import './style.css';

import { startFaro, setUser, setView, reportError } from './faro.js';
import { api } from './api.js';
import { setCartCount } from './util.js';
import { menuView } from './views/menu.js';
import { productView } from './views/product.js';
import { cartView } from './views/cart.js';
import { orderView } from './views/order.js';
import { demoView } from './views/demo.js';
import { initFooter } from './footer.js';
import { initDemoIndicator } from './demoIndicator.js';

startFaro();
initFooter();
initDemoIndicator();

// Give each browser a stable, made-up identity so sessions can be told apart.
const NAMES = ['alex', 'sam', 'jo', 'robin', 'casey', 'jamie', 'taylor', 'morgan'];
let user = JSON.parse(localStorage.getItem('demoUser') || 'null');
if (!user) {
  user = { id: crypto.randomUUID(), username: NAMES[Math.floor(Math.random() * NAMES.length)] };
  localStorage.setItem('demoUser', JSON.stringify(user));
}
setUser(user);

// Failed <img>/<script> loads fire an `error` event on the element that does NOT bubble
// to window.onerror, so Faro does not see them by default. A capturing listener does.
window.addEventListener(
  'error',
  (e) => {
    const target = e.target;
    if (target && target !== window && (target.src || target.href)) {
      reportError(new Error(`Failed to load resource: ${target.src || target.href}`), {
        tag: target.tagName,
      });
    }
  },
  true,
);

const routes = [
  { pattern: /^\/$/, name: 'menu', render: (root) => menuView(root) },
  { pattern: /^\/product\/([^/]+)$/, name: 'product', render: (root, id) => productView(root, id) },
  { pattern: /^\/cart$/, name: 'cart', render: (root) => cartView(root) },
  { pattern: /^\/order\/([^/]+)$/, name: 'order', render: (root, id) => orderView(root, id) },
  { pattern: /^\/demo$/, name: 'demo', render: (root) => demoView(root) },
];

const root = document.getElementById('app');

const canTransition = () =>
  typeof document.startViewTransition === 'function' &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches &&
  root.childElementCount > 0; // no transition for the very first render

async function route() {
  const path = location.hash.slice(1) || '/';
  const found = routes.find((r) => r.pattern.test(path));
  const render = found
    ? () => {
        setView(found.name); // tells Faro which "view" subsequent telemetry belongs to
        return found.render(root, ...path.match(found.pattern).slice(1).map(decodeURIComponent));
      }
    : () => {
        setView('not-found');
        root.innerHTML = '<p>Page not found. <a href="#/">Back to the menu</a>.</p>';
      };

  // A view paints its shell (title, progress bar) synchronously and fills in data after its
  // API calls return. The transition callback returns straight after the shell is painted, so
  // the crossfade is quick and a slow API call still shows its progress bar instead of freezing
  // the page.
  await new Promise((resolve, reject) => {
    const run = () => {
      try {
        resolve(render());
      } catch (err) {
        reject(err);
      }
    };
    if (canTransition()) document.startViewTransition(run);
    else run();
  });
}

window.addEventListener('hashchange', route);
route();

// Initial cart badge.
api.getCart().then((c) => setCartCount(c.items.reduce((n, i) => n + i.quantity, 0))).catch(() => {});
