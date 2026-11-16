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
  if (!el || el.textContent === String(n)) return;
  el.textContent = String(n);
  // Restart the "pop" animation so every change is noticeable, even off-screen.
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
};

// An error message with a Retry button, so a failed load isn't a dead end.
export function showError(el, message, onRetry) {
  el.innerHTML = `<div class="notification is-danger is-light">${esc(message)}
    <button class="button is-small is-danger ml-3 retry">Retry</button></div>`;
  el.querySelector('.retry').addEventListener('click', onRetry);
}

// A small status pill (e.g. "Saved", "Latte added to your cart") that fades out after a moment.
// Re-calling it on the same element restarts the timers rather than stacking messages.
export function flashMessage(el, text, kind = 'success', holdMs) {
  // The user may have navigated away while the request was in flight; nothing to show then.
  if (!el?.isConnected) return;
  (el._flashTimers ?? []).forEach(clearTimeout);
  const mark = kind === 'success' ? '&#10003; ' : '';
  el.innerHTML = `<span class="tag is-${kind} is-medium flash">${mark}${esc(text)}</span>`;
  const hold = holdMs ?? (kind === 'success' ? 1500 : 5000);
  el._flashTimers = [
    setTimeout(() => el.firstElementChild?.classList.add('is-fading'), hold),
    setTimeout(() => (el.innerHTML = ''), hold + 500),
  ];
}

// Marks an element as a Faro "user action". The action starts on pointerdown (or Enter/Space),
// which is *before* the click handler fires its API call, so we allow up to 1 s (the maximum)
// for the first request or DOM change instead of the 100 ms default.
export const actionAttrs = (name) => `data-faro-user-action-name="${name}" data-faro-user-action-timeout="1000"`;

// Adds a clear (x) button inside a text input's `.control`. It only shows while the input has
// text. After setting `input.value` from code, dispatch an `input` event to update it.
export function addClearButton(input, onClear) {
  const control = input.closest('.control');
  control.classList.add('has-clear');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'clear-btn';
  btn.setAttribute('aria-label', 'Clear');
  btn.innerHTML = '&times;';
  const sync = () => (btn.hidden = !input.value);
  sync();
  control.append(btn);
  input.addEventListener('input', sync);
  btn.addEventListener('click', () => {
    input.value = '';
    sync();
    input.focus();
    onClear?.();
  });
}
