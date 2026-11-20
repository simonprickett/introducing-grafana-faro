// Seed data and in-memory stores. Everything resets when the process restarts.
// Prices are integers in the currency's smallest unit (e.g. pence for GBP, whole yen for JPY)
// to avoid floating point rounding. Changing CURRENCY relabels prices; it does not convert them.

const fs = require('node:fs');
const path = require('node:path');

const CURRENCY = process.env.CURRENCY || 'GBP';

// The menu is shared by every backend implementation: backend/seed-products.json.
// Docker mounts it and sets SEED_PRODUCTS_FILE; running natively falls back to the repo copy.
const SEED_FILE =
  process.env.SEED_PRODUCTS_FILE || path.join(__dirname, '..', '..', 'seed-products.json');

let products;
try {
  products = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
} catch (err) {
  throw new Error(`Cannot load seed products from ${SEED_FILE}: ${err.message}`);
}

// PRODUCT_STOCK overrides the stock of every product (default: the seed file's values). Raise it
// for load tests, because nothing restocks until the process restarts.
if (process.env.PRODUCT_STOCK) {
  const stock = Number(process.env.PRODUCT_STOCK);
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error(`PRODUCT_STOCK must be a non-negative integer, got "${process.env.PRODUCT_STOCK}"`);
  }
  for (const p of products) p.stock = stock;
}

const productsById = new Map(products.map((p) => [p.id, p]));

// cartId -> Map(productId -> quantity)
const carts = new Map();

// orderId -> order
const orders = new Map();

module.exports = { CURRENCY, products, productsById, carts, orders };
