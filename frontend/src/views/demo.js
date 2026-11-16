import { api } from '../api.js';
import { reportError } from '../faro.js';
import { esc, notification } from '../util.js';

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

    <div class="columns">
      <div class="column box mr-3">
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
          <div class="select"><select id="slowCallRate">
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
        <button class="button is-light" id="reset">Reset all</button>
        <div id="chaos-msg" class="mt-3"></div>
      </div>

      <div class="column box">
        <h2 class="title is-5">Frontend failures</h2>
        <div class="buttons is-flex-direction-column is-align-items-flex-start">
          <button class="button is-danger is-light" id="throw">Throw an uncaught exception</button>
          <button class="button is-danger is-light" id="reject">Unhandled promise rejection</button>
          <button class="button is-danger is-light" id="handled">Report a handled error</button>
          <button class="button is-danger is-light" id="image">Load a broken image</button>
        </div>
        <div id="broken-image"></div>
      </div>
    </div>`;

  const msg = root.querySelector('#chaos-msg');
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
      try {
        await api.setChaos(read());
        msg.innerHTML = notification('Saved.', 'success');
      } catch (err) {
        msg.innerHTML = notification(err.message);
      }
    }),
  );

  root.querySelector('#reset').addEventListener('click', async () => {
    await api.resetChaos();
    demoView(root);
  });

  // --- Frontend failures. Faro's error instrumentation catches the first two automatically.
  root.querySelector('#throw').addEventListener('click', () => {
    throw new Error('Demo: uncaught exception from the "Throw" button');
  });
  root.querySelector('#reject').addEventListener('click', () => {
    Promise.reject(new Error('Demo: unhandled promise rejection'));
  });
  root.querySelector('#handled').addEventListener('click', () => {
    try {
      JSON.parse('{ not valid json');
    } catch (err) {
      reportError(err, { where: 'demo-handled-error' });
    }
  });
  root.querySelector('#image').addEventListener('click', () => {
    root.querySelector('#broken-image').innerHTML = `<img src="/img/does-not-exist.svg?${Date.now()}" alt="broken" />`;
  });
}
