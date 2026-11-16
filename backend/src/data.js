// Seed data and in-memory stores. Everything resets when the process restarts.
// Prices are integers in the currency's smallest unit (e.g. pence for GBP, whole yen for JPY)
// to avoid floating point rounding. Changing CURRENCY relabels prices; it does not convert them.

const CURRENCY = process.env.CURRENCY || 'GBP';

const products = [
  { id: 'espresso',     name: 'Espresso',        category: 'coffee', priceCurrencyUnits: 300, description: 'A short, intense shot.' },
  { id: 'americano',    name: 'Americano',       category: 'coffee', priceCurrencyUnits: 350, description: 'Espresso topped up with hot water.' },
  { id: 'latte',        name: 'Latte',           category: 'coffee', priceCurrencyUnits: 450, description: 'Espresso with plenty of steamed milk.' },
  { id: 'cappuccino',   name: 'Cappuccino',      category: 'coffee', priceCurrencyUnits: 425, description: 'Equal parts espresso, milk and foam.' },
  { id: 'flat-white',   name: 'Flat White',      category: 'coffee', priceCurrencyUnits: 450, description: 'Velvety microfoam over a double shot.' },
  { id: 'cold-brew',    name: 'Cold Brew',       category: 'cold',   priceCurrencyUnits: 475, description: 'Steeped for 18 hours, served over ice.' },
  { id: 'croissant',    name: 'Croissant',       category: 'pastry', priceCurrencyUnits: 375, description: 'Buttery and flaky, baked this morning.' },
  { id: 'blueberry-muffin', name: 'Blueberry Muffin', category: 'pastry', priceCurrencyUnits: 350, description: 'Packed with blueberries.' },
].map((p) => ({ ...p, image: `/img/${p.id}.svg`, stock: 25 }));

const productsById = new Map(products.map((p) => [p.id, p]));

// cartId -> Map(productId -> quantity)
const carts = new Map();

// orderId -> order
const orders = new Map();

module.exports = { CURRENCY, products, productsById, carts, orders };
