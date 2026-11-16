import { api } from '../api.js';
import { trackEvent } from '../faro.js';
import * as failures from '../failures.js';
import { esc, money, notification, flashMessage, showError, setCartCount, actionAttrs } from '../util.js';

export async function productView(root, id) {
  root.innerHTML = '<progress class="progress is-small is-primary" max="100"></progress>';
  try {
    const { currency, product: p } = await api.getProduct(id);
    trackEvent('view_product', { productId: p.id });
    root.innerHTML = `
      <p class="mb-4"><a href="#/" ${actionAttrs('back-to-menu')}>&larr; Back to menu</a></p>
      ${failures.handledFallback('product')}
      <div class="columns product-detail">
        <div class="column is-4"><img src="${esc(failures.imageSrc(p, 'product'))}" alt="${esc(p.name)}" /></div>
        <div class="column">
          <h1 class="title">${esc(p.name)}</h1>
          <p class="subtitle">${money(p.priceCurrencyUnits, currency)}</p>
          <p class="mb-4">${esc(p.description)}</p>
          <button id="add" class="button is-primary" ${actionAttrs('add-to-cart')}>Add to cart</button>
          <div id="msg" class="mt-4"></div>
        </div>
      </div>`;

    root.querySelector('#add').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.classList.add('is-loading');
      if (failures.beforeAction('add-to-cart')) return;
      try {
        const cart = await api.addToCart(p.id);
        trackEvent('add_to_cart', { productId: p.id, source: 'detail' });
        if (failures.afterAction('add-to-cart')) return;
        setCartCount(cart.items.reduce((n, i) => n + i.quantity, 0));
        flashMessage(root.querySelector('#msg'), 'Added to cart', 'success', 2500);
      } catch (err) {
        flashMessage(root.querySelector('#msg'), err.message, 'danger');
      } finally {
        btn.classList.remove('is-loading');
      }
    });
  } catch (err) {
    if (err.status === 404) root.innerHTML = notification(err.message);
    else showError(root, err.message, () => productView(root, id));
  }
}
