import { api } from '../api.js';
import { trackEvent } from '../faro.js';
import { esc, money, notification, debounce, setCartCount } from '../util.js';

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
            <div class="card-image"><a href="#/product/${esc(p.id)}"><img src="${esc(p.image)}" alt="${esc(p.name)}" /></a></div>
            <div class="card-content">
              <p class="title is-5"><a href="#/product/${esc(p.id)}">${esc(p.name)}</a></p>
              <p class="subtitle is-6 mb-2">${money(p.priceCurrencyUnits, currency)}</p>
              <div class="feedback"></div>
            </div>
            <footer class="card-footer">
              <a class="card-footer-item add-to-cart" data-id="${esc(p.id)}">Add to cart</a>
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
    const el = card.querySelector('.feedback');
    clearTimeout(el._timer);
    el.innerHTML = notification(message, kind);
    el._timer = setTimeout(() => (el.innerHTML = ''), kind === 'success' ? 2500 : 6000);
  }

  results.addEventListener('click', async (e) => {
    const btn = e.target.closest('.add-to-cart');
    if (!btn) return;
    const card = btn.closest('.card');
    const name = card.querySelector('.title').textContent;
    btn.classList.add('is-loading');
    try {
      const cart = await api.addToCart(btn.dataset.id);
      trackEvent('add_to_cart', { productId: btn.dataset.id, source: 'menu' });
      setCartCount(cart.items.reduce((n, i) => n + i.quantity, 0));
      showFeedback(card, `${name} added to cart`, 'success');
    } catch (err) {
      showFeedback(card, err.message, 'danger');
    } finally {
      btn.classList.remove('is-loading');
    }
  });

  await load();
}
