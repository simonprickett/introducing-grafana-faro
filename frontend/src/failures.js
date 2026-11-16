// Frontend failure injection, controlled from the Demo controls page.
//
// Each failure type can be toggled on with a rate (the chance it fires on a qualifying user
// action). Settings live in localStorage (per browser) so they survive reloads; counters live
// in sessionStorage so you can still see them after reloading to recover from a broken page.
//
//   uncaught   - an uncaught exception that BREAKS the action (spinner never stops, nothing
//                happens). Recover by reloading.
//   rejection  - an unhandled promise rejection AFTER the action succeeds, so the UI never
//                updates (e.g. item added on the server but the cart badge is stale).
//   handled    - an error that is caught and reported to Faro, with a visible fallback notice.
//   image      - a product image that 404s.

import { reportError } from './faro.js';
import { notification } from './util.js';

export const TYPES = ['uncaught', 'rejection', 'handled', 'image'];
const DEFAULT_RATE = 0.25;

const SETTINGS_KEY = 'frontendFailures';
const STATS_KEY = 'frontendFailureStats';

const read = (storage, key) => {
  try {
    return JSON.parse(storage.getItem(key)) ?? null;
  } catch {
    return null;
  }
};
const write = (storage, key, value) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable - settings just won't persist */
  }
};

const defaultSettings = () => Object.fromEntries(TYPES.map((t) => [t, { enabled: false, rate: DEFAULT_RATE }]));
const defaultStats = () => Object.fromEntries(TYPES.map((t) => [t, { count: 0, last: null }]));

let settings = { ...defaultSettings(), ...read(localStorage, SETTINGS_KEY) };
let stats = { ...defaultStats(), ...read(sessionStorage, STATS_KEY) };

export const getSettings = () => settings;
export const getStats = () => stats;

export function updateSetting(type, patch) {
  settings = { ...settings, [type]: { ...settings[type], ...patch } };
  write(localStorage, SETTINGS_KEY, settings);
}

export function resetFailures() {
  settings = defaultSettings();
  stats = defaultStats();
  write(localStorage, SETTINGS_KEY, settings);
  write(sessionStorage, STATS_KEY, stats);
}

const roll = (type) => settings[type].enabled && Math.random() < settings[type].rate;

function record(type, where, message) {
  stats[type].count += 1;
  stats[type].last = { where, message, at: new Date().toLocaleTimeString() };
  write(sessionStorage, STATS_KEY, stats);
}

// --- Realistic bugs ------------------------------------------------------------------
// A genuine TypeError ("Cannot read properties of undefined (reading 'x')") from a real code
// path, so the stack trace and source map resolve to something that looks like a normal bug.
const missingItems = new Map();
const PROPS = {
  'add-to-cart': 'priceCurrencyUnits',
  search: 'toLowerCase',
  checkout: 'totalCurrencyUnits',
  'demo-page': 'quantity',
};

function readMissingProperty(prop) {
  return missingItems.get('item')[prop];
}

function makeError(where) {
  try {
    readMissingProperty(PROPS[where] ?? 'id');
  } catch (err) {
    return err;
  }
}

// --- Injection points (called from the views) ----------------------------------------

/**
 * Call at the START of a user action. If it returns true the caller must stop: an uncaught
 * exception has been scheduled and the action is deliberately left broken.
 */
export function beforeAction(where) {
  if (!roll('uncaught')) return false;
  const err = makeError(where);
  record('uncaught', where, err.message);
  // Thrown from a timer so it is a true *uncaught* exception (window.onerror), not a rejection.
  setTimeout(() => {
    throw err;
  }, 0);
  return true;
}

/**
 * Call AFTER an action has succeeded but before the UI is updated. If it returns true the
 * caller must stop: an unhandled promise rejection has occurred and the UI is left stale.
 */
export function afterAction(where) {
  if (!roll('rejection')) return false;
  const err = makeError(where);
  record('rejection', where, err.message);
  Promise.reject(err); // deliberately not caught
  return true;
}

const FALLBACKS = {
  menu: "We couldn't restore your saved filters, so you're seeing the full menu.",
  product: 'Customer reviews are unavailable right now.',
  'demo-page': 'Something went wrong, but the app recovered (handled error reported to Faro).',
};

/** Returns HTML for a visible warning if a handled error fired, otherwise ''. */
export function handledFallback(where, force = false) {
  if (!force && !roll('handled')) return '';
  try {
    JSON.parse('{"saved":['); // a realistic parse failure of corrupted cached data
  } catch (err) {
    reportError(err, { where, handled: 'true' });
    record('handled', where, err.message);
  }
  return notification(FALLBACKS[where] ?? FALLBACKS['demo-page'], 'warning');
}

/** The image URL to use for a product - occasionally one that does not exist. */
export function imageSrc(product, where = 'menu') {
  if (!roll('image')) return product.image;
  const missing = `/img/${product.id}-missing.svg`;
  record('image', where, `404 ${missing}`);
  return missing;
}

/** "Fire now" from the demo controls. Returns HTML to show in the demo page. */
export function fireNow(type) {
  if (type === 'uncaught') {
    const err = makeError('demo-page');
    record('uncaught', 'demo-page', err.message);
    setTimeout(() => {
      throw err;
    }, 0);
    return notification('Uncaught exception thrown. Check the browser console and Faro.', 'info');
  }
  if (type === 'rejection') {
    const err = makeError('demo-page');
    record('rejection', 'demo-page', err.message);
    Promise.reject(err);
    return notification('Unhandled promise rejection raised. Check the browser console and Faro.', 'info');
  }
  if (type === 'handled') return handledFallback('demo-page', true);
  if (type === 'image') {
    const src = `/img/does-not-exist-${Date.now()}.svg`;
    record('image', 'demo-page', `404 ${src}`);
    return `<img src="${src}" alt="a broken product image" />`;
  }
  return '';
}
