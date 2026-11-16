import { api } from '../api.js';
import { esc, money, notification, showError } from '../util.js';

export async function orderView(root, id) {
  root.innerHTML = '<progress class="progress is-small is-primary" max="100"></progress>';
  try {
    const order = await api.getOrder(id);
    root.innerHTML = `
      <h1 class="title">Thanks, ${esc(order.name)}!</h1>
      <p class="subtitle">Order <strong>${esc(order.id)}</strong> is being prepared.</p>
      <ul class="mb-4">${order.items
        .map((i) => `<li>${i.quantity} × ${esc(i.name)} — ${money(i.lineTotalCurrencyUnits, order.currency)}</li>`)
        .join('')}</ul>
      <p class="mb-4"><strong>Total: ${money(order.totalCurrencyUnits, order.currency)}</strong></p>
      <a class="button is-primary" href="#/">Order something else</a>`;
  } catch (err) {
    if (err.status === 404) root.innerHTML = notification(err.message);
    else showError(root, err.message, () => orderView(root, id));
  }
}
