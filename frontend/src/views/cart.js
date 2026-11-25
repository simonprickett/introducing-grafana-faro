import { api, resetCartId } from '../api.js';
import { trackEvent, trackMeasurement, startUserAction } from '../faro.js';
import * as failures from '../failures.js';
import { randomName } from '../names.js';
import { esc, money, notification, showError, setCartCount, actionAttrs, addClearButton, preloadImages } from '../util.js';

const itemCount = (cart) => cart.items.reduce((n, i) => n + i.quantity, 0);

export async function cartView(root) {
  root.innerHTML = '<progress class="progress is-small is-primary" max="100"></progress>';

  let cart; // the cart currently on screen

  // Fetch the cart from the server, then draw it.
  async function render(message = '') {
    try {
      cart = await api.getCart();
    } catch (err) {
      showError(root, `Could not load your cart: ${err.message}`, () => cartView(root));
      return;
    }
    await draw(message);
  }

  // Draw a cart we already have (the quantity/remove calls return the updated cart, so no
  // extra GET is needed).
  let latestDraw = 0;
  async function draw(message = '') {
    const thisDraw = ++latestDraw;
    setCartCount(itemCount(cart));

    // Load the images first so the session replay can record them (see preloadImages).
    await preloadImages(cart.items.map((i) => i.product.image));
    if (thisDraw !== latestDraw) return; // a newer draw has taken over

    // The whole view is redrawn on every change, so keep what the user has typed.
    const typedName = root.querySelector('#name')?.value ?? '';

    if (cart.items.length === 0) {
      root.innerHTML = `${message}<h1 class="title">🛒 Your cart</h1><p>Your cart is empty. <a href="#/">Browse the menu</a>.</p>`;
      return;
    }

    root.innerHTML = `
      <h1 class="title">🛒 Your cart</h1>
      ${message}
      <table class="table is-fullwidth">
        <tbody>${cart.items
          .map(
            ({ product, quantity, lineTotalCurrencyUnits }) => `
          <tr>
            <td class="is-vcentered"><img class="cart-img" src="${esc(product.image)}" alt="" />${esc(product.name)}</td>
            <td class="is-vcentered">
              <div class="buttons has-addons are-small mb-0">
                <button class="button qty" data-id="${esc(product.id)}" data-quantity="${quantity - 1}"
                  aria-label="Decrease quantity of ${esc(product.name)}" ${actionAttrs('decrease-quantity')}>&minus;</button>
                <span class="button is-static qty-value">${quantity}</span>
                <button class="button qty" data-id="${esc(product.id)}" data-quantity="${quantity + 1}"
                  aria-label="Increase quantity of ${esc(product.name)}" ${actionAttrs('increase-quantity')}>+</button>
              </div>
            </td>
            <td class="is-vcentered">${money(lineTotalCurrencyUnits, cart.currency)}</td>
            <td class="is-vcentered"><button class="button is-small is-light remove" data-id="${esc(product.id)}" ${actionAttrs('remove-from-cart')}>Remove</button></td>
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

    const nameInput = root.querySelector('#name');
    addClearButton(nameInput);
    if (typedName) {
      nameInput.value = typedName;
      nameInput.dispatchEvent(new Event('input')); // shows the clear button
    }

    // + / - buttons. Going down to 0 removes the item (the server treats 0 as "remove").
    root.querySelectorAll('.qty').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('is-loading')) return; // a request is already in flight
        if (failures.unresponsive('quantity')) return;
        const productId = btn.dataset.id;
        const to = Number(btn.dataset.quantity);
        const from = cart.items.find((i) => i.product.id === productId).quantity;
        btn.classList.add('is-loading');
        try {
          cart = await api.setQuantity(productId, to);
          trackEvent('cart_quantity_changed', { productId, from, to });
          if (to === 0) trackEvent('remove_from_cart', { productId });
          draw();
        } catch (err) {
          draw(notification(err.message));
        }
      }),
    );

    root.querySelectorAll('.remove').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          cart = await api.removeFromCart(btn.dataset.id);
          trackEvent('remove_from_cart', { productId: btn.dataset.id });
          draw();
        } catch (err) {
          draw(notification(err.message));
        }
      }),
    );

    // Saves typing during a demo: fill in a random name from the hard-coded lists.
    root.querySelector('#generate-name').addEventListener('click', () => {
      const input = root.querySelector('#name');
      input.value = randomName();
      input.dispatchEvent(new Event('input')); // shows the clear button
      input.focus();
    });

    root.querySelector('#checkout').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.currentTarget.querySelector('button[type=submit]');
      if (btn.classList.contains('is-loading')) return; // already submitting
      if (failures.unresponsive('checkout')) return;
      // Programmatic (not a data attribute) so that pressing Enter in the name box counts too.
      startUserAction('place-order', { items: cart.items.length });
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
