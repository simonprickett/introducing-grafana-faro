import { api, resetCartId } from '../api.js';
import { trackEvent, trackMeasurement } from '../faro.js';
import * as failures from '../failures.js';
import { randomName } from '../names.js';
import { esc, money, notification, setCartCount } from '../util.js';

export async function cartView(root) {
  root.innerHTML = '<progress class="progress is-small is-primary" max="100"></progress>';

  async function render(message = '') {
    let cart;
    try {
      cart = await api.getCart();
    } catch (err) {
      root.innerHTML = notification(`Could not load your cart: ${err.message}`);
      return;
    }
    setCartCount(cart.items.reduce((n, i) => n + i.quantity, 0));

    if (cart.items.length === 0) {
      root.innerHTML = `${message}<h1 class="title">Your cart</h1><p>Your cart is empty. <a href="#/">Browse the menu</a>.</p>`;
      return;
    }

    root.innerHTML = `
      <h1 class="title">Your cart</h1>
      ${message}
      <table class="table is-fullwidth">
        <tbody>${cart.items
          .map(
            ({ product, quantity, lineTotalCurrencyUnits }) => `
          <tr>
            <td><img class="cart-img" src="${esc(product.image)}" alt="" />${esc(product.name)}</td>
            <td>× ${quantity}</td>
            <td>${money(lineTotalCurrencyUnits, cart.currency)}</td>
            <td><button class="button is-small is-light remove" data-id="${esc(product.id)}">Remove</button></td>
          </tr>`,
          )
          .join('')}</tbody>
        <tfoot><tr><th colspan="2">Total</th><th colspan="2">${money(cart.totalCurrencyUnits, cart.currency)}</th></tr></tfoot>
      </table>
      <form id="checkout" class="box">
        <div class="field">
          <label class="label" for="name">Name for the order</label>
          <div class="control"><input id="name" class="input" required placeholder="e.g. Alex" /></div>
        </div>
        <div class="buttons">
          <button class="button is-info" type="button" id="generate-name">Generate name</button>
          <button class="button is-primary" type="submit">Place order</button>
        </div>
        <p class="help mt-2">This is a demo - no real payment is taken.</p>
      </form>`;

    root.querySelectorAll('.remove').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await api.removeFromCart(btn.dataset.id);
          trackEvent('remove_from_cart', { productId: btn.dataset.id });
          render();
        } catch (err) {
          render(notification(err.message));
        }
      }),
    );

    // Saves typing during a demo: fill in a random name from the hard-coded lists.
    root.querySelector('#generate-name').addEventListener('click', () => {
      const input = root.querySelector('#name');
      input.value = randomName();
      input.focus();
    });

    root.querySelector('#checkout').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.currentTarget.querySelector('button[type=submit]');
      btn.classList.add('is-loading');
      trackEvent('checkout_started', { items: cart.items.length, totalCurrencyUnits: cart.totalCurrencyUnits });
      if (failures.beforeAction('checkout')) return;
      try {
        const order = await api.checkout(root.querySelector('#name').value);
        trackEvent('order_placed', { orderId: order.id });
        if (failures.afterAction('checkout')) return;
        trackMeasurement('order', { total_currency_units: order.totalCurrencyUnits, items: order.items.length });
        resetCartId();
        setCartCount(0);
        location.hash = `#/order/${order.id}`;
      } catch (err) {
        trackEvent('checkout_failed', { status: err.status, reason: err.message });
        render(notification(`Checkout failed: ${err.message}`));
      }
    });
  }

  await render();
}
