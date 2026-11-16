export const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Amounts are integers in the currency's smallest unit (pence for GBP, cents for EUR/USD,
// whole yen for JPY). Intl knows how many decimal places each currency has, so we
// divide by 10^digits rather than assuming 100.
export const money = (currencyUnits, currency) => {
  const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  return formatter.format(currencyUnits / 10 ** digits);
};

export const notification = (message, kind = 'danger') =>
  `<div class="notification is-${kind} is-light">${esc(message)}</div>`;

export const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export const setCartCount = (n) => {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = String(n);
};
