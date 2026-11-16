import { api } from '../api.js';
import { trackEvent } from '../faro.js';
import { esc, money, notification, setCartCount } from '../util.js';

export async function productView(root, id) {
  root.innerHTML = '<progress class="progress is-small is-primary" max="100"></progress>';
  try {
    const { currency, product: p } = await api.getProduct(id);
    trackEvent('view_product', { productId: p.id });
    root.innerHTML = `
      <p class="mb-4"><a href="#/">&larr; Back to menu</a></p>
      <div class="columns product-detail">
        <div class="column is-4"><img src="${esc(p.image)}" alt="${esc(p.name)}" /></div>
        <div class="column">
          <h1 class="title">${esc(p.name)}</h1>
          <p class="subtitle">${money(p.priceCurrencyUnits, currency)}</p>
          <p class="mb-4">${esc(p.description)}</p>
          <button id="add" class="button is-primary">Add to cart</button>
          <div id="msg" class="mt-4"></div>
        </div>
      </div>`;

    root.querySelector('#add').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.classList.add('is-loading');
      try {
        const cart = await api.addToCart(p.id);
        trackEvent('add_to_cart', { productId: p.id, source: 'detail' });
        setCartCount(cart.items.reduce((n, i) => n + i.quantity, 0));
        root.querySelector('#msg').innerHTML = notification(`${p.name} added to your cart.`, 'success');
      } catch (err) {
        root.querySelector('#msg').innerHTML = notification(err.message);
      } finally {
        btn.classList.remove('is-loading');
      }
    });
  } catch (err) {
    root.innerHTML = notification(err.message);
  }
}
