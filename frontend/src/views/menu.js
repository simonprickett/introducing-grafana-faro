import { api } from '../api.js';
import { trackEvent } from '../faro.js';
import * as failures from '../failures.js';
import { esc, money, notification, flashMessage, debounce, setCartCount } from '../util.js';

const CATEGORIES = [
  ['', 'All'],
  ['coffee', 'Coffee'],
  ['cold', 'Cold'],
  ['pastry', 'Pastries'],
];

export async function menuView(root) {
  let q = '';
  let category = '';

  root.innerHTML = `
    <h1 class="title">Menu</h1>
    <div id="fallback"></div>
    <div class="field has-addons">
      <div class="control is-expanded">
        <input id="search" class="input" type="search" placeholder="Search the menu..." />
      </div>
    </div>
    <div class="tabs is-toggle" id="tabs"><ul>${CATEGORIES.map(
      ([value, label]) =>
        `<li data-category="${value}"${value === '' ? ' class="is-active"' : ''}><a>${label}</a></li>`,
    ).join('')}</ul></div>
    <div id="results"><progress class="progress is-small is-primary" max="100"></progress></div>`;

  root.querySelector('#fallback').innerHTML = failures.handledFallback('menu');
  const results = root.querySelector('#results');

  async function load() {
    results.innerHTML = '<progress class="progress is-small is-primary" max="100"></progress>';
    try {
      const { currency, products } = await api.listProducts({ q, category });
      if (products.length === 0) {
        results.innerHTML = '<p class="has-text-grey">Nothing matches your search.</p>';
        return;
      }
      results.innerHTML = `<div class="columns is-multiline">${products
        .map(
          (p) => `
        <div class="column is-3">
          <div class="card product-card">
            <div class="card-image"><a href="#/product/${esc(p.id)}"><img src="${esc(failures.imageSrc(p, 'menu'))}" alt="${esc(p.name)}" /></a></div>
            <div class="card-content">
              <p class="title is-5"><a href="#/product/${esc(p.id)}">${esc(p.name)}</a></p>
              <div class="price-row">
                <p class="subtitle is-6 mb-0">${money(p.priceCurrencyUnits, currency)}</p>
                <div class="feedback"></div>
              </div>
            </div>
            <footer class="card-footer">
              <button class="button is-primary is-fullwidth add-to-cart" data-id="${esc(p.id)}">Add to cart</button>
            </footer>
          </div>
        </div>`,
        )
        .join('')}</div>`;
    } catch (err) {
      results.innerHTML = notification(`Could not load the menu: ${err.message}`);
    }
  }

  root.querySelector('#search').addEventListener(
    'input',
    debounce((e) => {
      q = e.target.value;
      trackEvent('search', { query: q });
      if (failures.beforeAction('search')) return;
      load();
    }, 300),
  );

  root.querySelector('#tabs').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-category]');
    if (!li) return;
    category = li.dataset.category;
    root.querySelectorAll('#tabs li').forEach((el) => el.classList.toggle('is-active', el === li));
    trackEvent('filter_category', { category: category || 'all' });
    load();
  });

  // Feedback is shown inside the card that was clicked, so it stays next to the product.
  function showFeedback(card, message, kind) {
    flashMessage(card.querySelector('.feedback'), message, kind, kind === 'success' ? 2500 : undefined);
  }

  results.addEventListener('click', async (e) => {
    const btn = e.target.closest('.add-to-cart');
    if (!btn) return;
    const card = btn.closest('.card');
    btn.classList.add('is-loading');
    if (failures.beforeAction('add-to-cart')) return;
    try {
      const cart = await api.addToCart(btn.dataset.id);
      trackEvent('add_to_cart', { productId: btn.dataset.id, source: 'menu' });
      if (failures.afterAction('add-to-cart')) return;
      setCartCount(cart.items.reduce((n, i) => n + i.quantity, 0));
      showFeedback(card, 'Added to cart', 'success');
    } catch (err) {
      showFeedback(card, err.status === 409 ? 'Out of stock' : "Couldn't add", 'danger');
    } finally {
      btn.classList.remove('is-loading');
    }
  });

  await load();
}
