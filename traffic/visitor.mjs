// One synthetic visit: a fresh browser context (so a new Faro session and a new fake user),
// a persona, some clicking around, then leave.
import { devices } from 'playwright';
import { FRONTEND_FAILURES, FRUSTRATED_FAILURES } from './profiles.mjs';

const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const weighted = (items) => {
  let r = Math.random() * items.reduce((n, i) => n + i.weight, 0);
  return items.find((i) => (r -= i.weight) < 0) ?? items[0];
};

const CHROME = 'Chrome/130.0.0.0 Safari/537.36';
// A spread of browsers and devices so the Faro browser / OS / mobile breakdowns have something in them.
const DEVICES = [
  { weight: 4, opts: { viewport: { width: 1440, height: 900 }, userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ${CHROME}` } },
  { weight: 3, opts: { viewport: { width: 1920, height: 1080 }, userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${CHROME}` } },
  { weight: 1, opts: { viewport: { width: 1366, height: 768 }, userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ${CHROME}` } },
  { weight: 3, opts: devices['iPhone 13'] },
  { weight: 2, opts: devices['Pixel 7'] },
];

const PERSONAS = [
  { name: 'browser', weight: 4 },
  { name: 'searcher', weight: 2 },
  { name: 'shopper', weight: 4 },
];
const SEARCHES = ['latte', 'espresso', 'cold', 'muffin', 'coffee', 'croissant', 'flat', 'tea'];
const CATEGORIES = ['coffee', 'cold', 'pastry'];

export async function visit(browser, phase, { baseUrl, stats }) {
  const device = weighted(DEVICES);
  const ctx = await browser.newContext({ ...device.opts, baseURL: baseUrl });
  const frustrated = chance(phase.frustratedShare);
  const failures = frustrated ? FRUSTRATED_FAILURES : chance(phase.frontendFailureShare) ? FRONTEND_FAILURES : null;
  if (failures) {
    await ctx.addInitScript(
      ({ key, value }) => localStorage.getItem(key) || localStorage.setItem(key, value),
      { key: 'frontendFailures', value: JSON.stringify(failures) },
    );
  }

  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  const think = () => page.waitForTimeout(rand(...phase.think));

  // A step that can fail (the app is sometimes broken on purpose). Like a real user, reload and carry on.
  const step = async (fn) => {
    try {
      await fn();
    } catch (err) {
      stats.stepErrors += 1;
      if (process.env.DEBUG_TRAFFIC) console.log(`  [step failed] ${device.opts.userAgent?.slice(25, 50)} ${err.message.split('\n')[0]}`);
      await page.reload().catch(() => {});
    }
    await think();
  };

  // Click a random match. Filtering and searching change how many cards there are.
  const clickAny = async (selector) => {
    const loc = page.locator(selector);
    await loc.first().waitFor();
    await loc.nth(Math.floor(rand(0, await loc.count()))).click();
  };
  const addFromMenu = async () => {
    await clickAny('.add-to-cart');
    stats.adds += 1;
  };
  const viewProduct = async () => {
    await clickAny('a[href^="#/product/"]');
    if (chance(0.6)) {
      await think();
      await page.click('#add');
      stats.adds += 1;
    }
  };
  const checkout = async () => {
    await page.click('a[href="#/cart"]');
    await page.waitForSelector('#checkout');
    await think();
    if (chance(0.3)) await page.locator('.qty').last().click();
    await page.click('#generate-name');
    await page.click('#checkout button[type=submit]');
    try {
      await page.waitForURL(/#\/order\//);
      stats.orders += 1;
    } catch {
      stats.orderFailures += 1;
      throw new Error('checkout did not complete');
    }
  };

  stats.visits += 1;
  try {
    await page.goto('/');
    await think();

    if (frustrated) {
      stats.frustrated += 1;
      await step(async () => {
        const button = page.locator('.add-to-cart').first();
        for (let i = 0; i < 5; i++) {
          await button.click();
          await page.waitForTimeout(120);
        }
      });
    } else {
      const persona = weighted(PERSONAS).name;
      if (persona === 'searcher') {
        await step(() => page.fill('#search', pick(SEARCHES)));
        await step(viewProduct);
      }
      if (persona === 'browser') {
        for (let i = 0; i < Math.floor(rand(1, 4)); i++) {
          await step(() => page.click(`#tabs li[data-category="${pick(CATEGORIES)}"]`));
        }
        await step(viewProduct);
        if (chance(0.3)) await step(viewProduct);
      }
      if (persona === 'shopper') {
        await step(() => page.click(`#tabs li[data-category="${pick(CATEGORIES)}"]`));
        for (let i = 0; i < Math.floor(rand(1, 4)); i++) await step(addFromMenu);
        if (chance(0.85)) await step(checkout); // the rest abandon their cart
      }
    }
    await page.waitForTimeout(1500); // let Faro flush its last batch before the page goes away
  } finally {
    await ctx.close().catch(() => {});
  }
}
