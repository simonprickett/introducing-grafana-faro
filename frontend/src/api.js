import { config } from './config.js';
import { reportError } from './faro.js';
import { busyStart, busyEnd } from './busy.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(method, path, body) {
  busyStart();
  try {
    return await doRequest(method, path, body);
  } finally {
    busyEnd();
  }
}

async function doRequest(method, path, body) {
  const url = `${config.apiUrl}/api${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Network failure / CORS failure / backend down.
    reportError(err, { method, path });
    throw new ApiError('Could not reach the server', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new ApiError(data.error || `Request failed (${res.status})`, res.status);
    // Tell Faro about failed API calls, with enough context to find the trace.
    reportError(error, { method, path, status: res.status });
    throw error;
  }
  return data;
}

// The cart lives on the server, keyed by an id we keep in localStorage.
export function cartId() {
  let id = localStorage.getItem('cartId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('cartId', id);
  }
  return id;
}
export const resetCartId = () => localStorage.removeItem('cartId');

export const api = {
  listProducts: ({ q = '', category = '' } = {}) =>
    request('GET', `/products?${new URLSearchParams({ q, category })}`),
  getProduct: (id) => request('GET', `/products/${encodeURIComponent(id)}`),
  getCart: () => request('GET', `/cart/${cartId()}`),
  addToCart: (productId, quantity = 1) =>
    request('POST', `/cart/${cartId()}/items`, { productId, quantity }),
  // Set an exact quantity for an item in the cart. 0 removes it.
  setQuantity: (productId, quantity) =>
    request('PATCH', `/cart/${cartId()}/items/${encodeURIComponent(productId)}`, { quantity }),
  removeFromCart: (productId) =>
    request('DELETE', `/cart/${cartId()}/items/${encodeURIComponent(productId)}`),
  checkout: (name) => request('POST', '/checkout', { cartId: cartId(), name }),
  getOrder: (id) => request('GET', `/orders/${encodeURIComponent(id)}`),
  getChaos: () => request('GET', '/chaos'),
  setChaos: (patch) => request('POST', '/chaos', patch),
  resetChaos: () => request('DELETE', '/chaos'),
};
