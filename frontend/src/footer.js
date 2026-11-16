// A slim bar pinned to the bottom of the page showing the Faro session ID and the trace ID of
// the last API call, each with a copy button, so a presenter can paste them straight into
// Grafana (Tempo / Frontend Observability) instead of hunting for them.

import { getLastRequest, getSessionId, isFaroEnabled, onLastRequest } from './faro.js';
import { esc } from './util.js';

const KEY = 'showDemoFooter';
let bar;

export const isFooterVisible = () => {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
};

export function setFooterVisible(visible) {
  try {
    localStorage.setItem(KEY, String(visible));
  } catch {
    /* not persisted */
  }
  apply();
}

function apply() {
  const visible = isFooterVisible();
  bar.hidden = !visible;
  document.body.classList.toggle('has-demo-footer', visible);
}

function render() {
  if (!isFaroEnabled()) {
    bar.innerHTML = '<span>Faro is disabled &mdash; set <code>FARO_URL</code> to see session and trace IDs here.</span>';
    return;
  }
  const session = getSessionId();
  const last = getLastRequest();
  bar.innerHTML = `
    <span class="demo-footer-item">Session
      ${session ? `<code>${esc(session)}</code><button class="button is-small is-light" data-copy="${esc(session)}">Copy</button>` : '<em>none</em>'}
    </span>
    <span class="demo-footer-item">Last API call
      ${
        last
          ? `<code>${esc(last.method)} ${esc(last.path)}</code> <span class="tag">${esc(last.status)}</span>
             trace <code>${esc(last.traceId)}</code><button class="button is-small is-light" data-copy="${esc(last.traceId)}">Copy</button>`
          : '<em>none yet</em>'
      }
    </span>`;
}

export function initFooter() {
  bar = document.createElement('footer');
  bar.className = 'demo-footer';
  document.body.append(bar);

  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Copy failed';
    }
    setTimeout(() => (btn.textContent = 'Copy'), 1200);
  });

  render();
  apply();
  onLastRequest(render);
  window.addEventListener('hashchange', render); // the session ID can change over time
}
