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

startFaro();

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

async function route() {
  const path = location.hash.slice(1) || '/';
  for (const r of routes) {
    const match = path.match(r.pattern);
    if (match) {
      setView(r.name); // tells Faro which "view" subsequent telemetry belongs to
      await r.render(root, ...match.slice(1).map(decodeURIComponent));
      return;
    }
  }
  setView('not-found');
  root.innerHTML = '<p>Page not found. <a href="#/">Back to the menu</a>.</p>';
}

window.addEventListener('hashchange', route);
route();

// Initial cart badge.
api.getCart().then((c) => setCartCount(c.items.reduce((n, i) => n + i.quantity, 0))).catch(() => {});
