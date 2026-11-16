import { api } from '../api.js';
import * as failures from '../failures.js';
import { esc, notification, flashMessage } from '../util.js';

export async function demoView(root) {
  let chaos;
  let products = [];
  try {
    [chaos, { products }] = await Promise.all([api.getChaos(), api.listProducts()]);
  } catch (err) {
    root.innerHTML = notification(`Could not load demo controls: ${err.message}`);
    return;
  }

  root.innerHTML = `
    <h1 class="title">Demo controls</h1>
    <p class="subtitle">Break things on purpose so there is something to look at in Grafana.</p>
    <div class="is-flex is-align-items-center mb-5" style="gap: 1rem">
      <button class="button is-danger" id="reset">Reset all</button>
      <div id="chaos-msg"></div>
    </div>

    <div class="columns">
      <div class="column box mr-3 mb-0">
        <h2 class="title is-5">Backend failures</h2>
        <div class="field">
          <label class="checkbox"><input type="checkbox" id="baselineLatency" ${chaos.baselineLatency ? 'checked' : ''} />
            Realistic baseline latency (random 5-60 ms on every call)</label>
        </div>
        <div class="field">
          <label class="checkbox"><input type="checkbox" id="checkoutFailure" ${chaos.checkoutFailure ? 'checked' : ''} />
            Checkout fails (500 from the payment step)</label>
        </div>
        <div class="field">
          <label class="label">Slow API calls (extra latency)</label>
          <div class="select"><select id="slowCallLatencyMs">
            ${[0, 500, 1000, 2000, 5000]
              .map((ms) => `<option value="${ms}" ${chaos.slowCallLatencyMs === ms ? 'selected' : ''}>${ms ? `+${ms} ms` : 'off'}</option>`)
              .join('')}
          </select></div>
        </div>
        <div class="field">
          <label class="label">...applied to this share of API calls</label>
          <div class="select"><select id="slowCallRate" ${chaos.slowCallLatencyMs ? '' : 'disabled'}>
            ${[0.1, 0.25, 0.5, 1]
              .map((r) => `<option value="${r}" ${chaos.slowCallRate === r ? 'selected' : ''}>${r * 100}%</option>`)
              .join('')}
          </select></div>
        </div>
        <div class="field">
          <label class="label">Out of stock product (409)</label>
          <div class="select"><select id="outOfStockProductId">
            <option value="">none</option>
            ${products
              .map((p) => `<option value="${esc(p.id)}" ${chaos.outOfStockProductId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`)
              .join('')}
          </select></div>
        </div>
        <div class="field">
          <label class="label">Random API errors (503)</label>
          <div class="select"><select id="errorRate">
            ${[0, 0.1, 0.25, 0.5]
              .map((r) => `<option value="${r}" ${chaos.errorRate === r ? 'selected' : ''}>${r ? `${r * 100}% of requests` : 'off'}</option>`)
              .join('')}
          </select></div>
        </div>
      </div>

      <div class="column box mb-0">
        <h2 class="title is-5">Frontend failures</h2>
        <p class="help mb-3">
          Applies to this browser only. When on, each failure fires at random as you use the coffee
          flow. Uncaught exceptions leave the action stuck (reload to recover).
        </p>
        <div id="frontend-panel"></div>
        <div id="fire-output" class="mt-3"></div>
      </div>
    </div>`;

  const msg = root.querySelector('#chaos-msg');

  const flash = (text, kind) => flashMessage(msg, text, kind);
  const read = () => ({
    baselineLatency: root.querySelector('#baselineLatency').checked,
    checkoutFailure: root.querySelector('#checkoutFailure').checked,
    slowCallLatencyMs: Number(root.querySelector('#slowCallLatencyMs').value),
    slowCallRate: Number(root.querySelector('#slowCallRate').value),
    outOfStockProductId: root.querySelector('#outOfStockProductId').value,
    errorRate: Number(root.querySelector('#errorRate').value),
  });

  root.querySelectorAll('#baselineLatency, #checkoutFailure, select').forEach((el) =>
    el.addEventListener('change', async () => {
      // The share-of-calls control only makes sense while slow calls are switched on.
      root.querySelector('#slowCallRate').disabled = Number(root.querySelector('#slowCallLatencyMs').value) === 0;
      try {
        await api.setChaos(read());
        flash('Saved');
      } catch (err) {
        flash(err.message, 'danger');
      }
    }),
  );

  root.querySelector('#reset').addEventListener('click', async () => {
    failures.resetFailures();
    await api.resetChaos();
    demoView(root);
  });

  // --- Frontend failures -------------------------------------------------------------
  const ROWS = [
    ['uncaught', 'Uncaught exceptions', 'Breaks the action: add to cart, search or checkout stops dead'],
    ['rejection', 'Unhandled promise rejections', 'Action succeeds but the UI never updates (stale cart badge)'],
    ['handled', 'Handled errors', 'Caught and reported to Faro; shows a warning fallback'],
    ['image', 'Broken images', 'Some product images 404'],
  ];
  const panel = root.querySelector('#frontend-panel');
  const output = root.querySelector('#fire-output');

  function renderPanel() {
    const settings = failures.getSettings();
    const stats = failures.getStats();
    panel.innerHTML = ROWS.map(([type, label, hint]) => {
      const last = stats[type].last;
      return `
        <div class="field mb-4">
          <label class="checkbox has-text-weight-semibold">
            <input type="checkbox" data-type="${type}" data-field="enabled" ${settings[type].enabled ? 'checked' : ''} /> ${label}
          </label>
          <p class="help">${hint}</p>
          <div class="is-flex is-align-items-center mt-1" style="gap:.5rem">
            <div class="select is-small"><select data-type="${type}" data-field="rate" ${settings[type].enabled ? '' : 'disabled'}>
              ${[0.1, 0.25, 0.5, 1]
                .map((r) => `<option value="${r}" ${settings[type].rate === r ? 'selected' : ''}>${r * 100}%</option>`)
                .join('')}
            </select></div>
            <button class="button is-small is-danger is-light" data-fire="${type}">Fire now</button>
            <span class="tag is-light">${stats[type].count} fired</span>
          </div>
          ${last ? `<p class="help">Last: ${esc(last.message)} <em>(${esc(last.where)}, ${esc(last.at)})</em></p>` : ''}
        </div>`;
    }).join('');
  }

  panel.addEventListener('change', (e) => {
    const { type, field } = e.target.dataset;
    if (!type) return;
    failures.updateSetting(type, {
      [field]: field === 'enabled' ? e.target.checked : Number(e.target.value),
    });
    if (field === 'enabled') renderPanel(); // re-render so the rate select enables/disables
    flash('Saved');
  });

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fire]');
    if (!btn) return;
    output.innerHTML = failures.fireNow(btn.dataset.fire);
    renderPanel();
  });

  renderPanel();
}
