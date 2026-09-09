/**
 * Browser tests for the product-page comparison table.
 * Development-only.
 *
 *   node serve.js &        # or npm run dev
 *   node scripts/dev/compare-test.js
 */
import { launch, newPage } from './cdp.js';
import { products } from '../../src/data/products.js';
import { packSizeLabel } from '../../src/lib/html.js';

const BASE = process.env.BASE || 'http://localhost:4321';
let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/**
 * Slugs are picked from the catalogue by category size rather than written
 * down: the comparison table's whole behaviour turns on how many siblings a
 * product has, and a hard-coded slug goes stale the moment the range changes.
 */
function bySiblings(predicate) {
  const sizes = new Map();
  for (const p of products) sizes.set(p.category, (sizes.get(p.category) || 0) + 1);
  const hit = products.find((p) => predicate(sizes.get(p.category)));
  if (!hit) throw new Error('no product in a category of the required size');
  return hit.slug;
}
const PAIRED = bySiblings((n) => n === 2);
const CROWDED = bySiblings((n) => n >= 3);
const LONE = bySiblings((n) => n === 1);

const { proc, port } = await launch();
const page = await newPage(port);
await page.setViewport(1280, 900, false);

// A category with exactly two products: the table is this one plus one sibling.
await page.goto(`${BASE}/products/${PAIRED}/`);

const shape = await page.eval(`
  const t = document.querySelector('table.compare');
  if (!t) return { missing: true };
  return {
    cols: t.querySelectorAll('thead th').length,
    rowHeaders: [...t.querySelectorAll('tbody th[scope="row"]')].map(x => x.textContent.trim()),
    colScoped: [...t.querySelectorAll('thead th')].every(x => x.getAttribute('scope') === 'col'),
    caption: !!t.querySelector('caption'),
    current: t.querySelectorAll('.is-current').length,
    flag: (t.querySelector('.compare__flag') || {}).textContent || '',
  };
`);
check('comparison table renders', !shape.missing);
check('this product plus its category siblings appear', shape.cols === 2, `${shape.cols} columns`);
check('rows compare the specs that matter',
  ['Brand', 'Carton price', 'Piece price', 'Pack size', 'SKU', 'Availability', 'Enquire']
    .every((r) => shape.rowHeaders.includes(r)), shape.rowHeaders.join(', '));
check('column headers are scoped for screen readers', shape.colScoped === true);
check('table has a caption', shape.caption === true);
check('the current product is marked', /This product/.test(shape.flag), shape.flag);

const scrollRegion = await page.eval(`
  const r = document.querySelector('.compare__scroll');
  return { role: r.getAttribute('role'), label: !!r.getAttribute('aria-label'), tabbable: r.tabIndex === 0 };
`);
check('scroll container is reachable by keyboard and labelled',
  scrollRegion.role === 'region' && scrollRegion.label && scrollRegion.tabbable,
  JSON.stringify(scrollRegion));

const stickiness = await page.eval(`
  const th = document.querySelector('.compare tbody th[scope="row"]');
  return getComputedStyle(th).position;
`);
check('attribute column is pinned while products scroll', stickiness === 'sticky', stickiness);

// A category with three or more products exercises the toggles.
await page.goto(`${BASE}/products/${CROWDED}/`);
const toggle = await page.eval(`
  const boxes = document.querySelectorAll('[data-compare-toggle]');
  if (!boxes.length) return { none: true };
  const col = boxes[0].getAttribute('data-compare-toggle');
  const before = [...document.querySelectorAll('[data-compare-col="' + col + '"]')]
    .filter(c => getComputedStyle(c).display !== 'none').length;
  boxes[0].checked = false;
  boxes[0].dispatchEvent(new Event('change', { bubbles: true }));
  const after = [...document.querySelectorAll('[data-compare-col="' + col + '"]')]
    .filter(c => getComputedStyle(c).display !== 'none').length;
  boxes[0].checked = true;
  boxes[0].dispatchEvent(new Event('change', { bubbles: true }));
  const restored = [...document.querySelectorAll('[data-compare-col="' + col + '"]')]
    .filter(c => getComputedStyle(c).display !== 'none').length;
  return { before, after, restored };
`);
check('unchecking a product hides its whole column',
  !toggle.none && toggle.before > 0 && toggle.after === 0, JSON.stringify(toggle));
check('re-checking brings the column back',
  !toggle.none && toggle.restored === toggle.before, JSON.stringify(toggle));

const wa = await page.eval(`
  const links = [...document.querySelectorAll('.compare [data-wa-location="compare_table"]')];
  return {
    count: links.length,
    products: links.map(l => l.getAttribute('data-wa-product')),
    distinct: new Set(links.map(l => l.getAttribute('data-wa-product'))).size,
  };
`);
check('every compared product has its own enquiry button',
  wa.count >= 2 && wa.distinct === wa.count, JSON.stringify(wa));

// A category with a single product has nothing to compare against.
await page.goto(`${BASE}/products/${LONE}/`);
const lone = await page.eval(`return !!document.querySelector('table.compare');`);
check('a product with no siblings shows no comparison table', lone === false);

// Cards should now be lean.
await page.goto(`${BASE}/products/`);
// Pack size is optional — several real products ship on boxes that do not
// state one — so check the card of a product that actually has one.
const packed = products.find((p) => p.packSize);
const card = await page.eval(`
  const c = document.querySelector('[data-product]');
  // Past the first page the cards sit inside an inert <template>, which
  // document.querySelector does not descend into — look in both.
  const t = document.getElementById('catalogue-tail');
  const sel = 'a[href="/products/${packed.slug}/"]';
  const link = document.querySelector(sel) || (t && t.content.querySelector(sel));
  const withPack = link.closest('[data-product]');
  return {
    desc: !!c.querySelector('.card__desc'),
    price: !!c.querySelector('.card__price'),
    sku: /SKU/.test(c.textContent),
    title: !!c.querySelector('.card__title'),
    meta: (withPack.querySelector('.card__meta') || {}).textContent.trim(),
  };
`);
check('card no longer repeats the description', card.desc === false);
check('the card shows a price line', card.price === true);
check('card no longer shows the SKU', card.sku === false);
// A bare "48" on a card told a buyer nothing — the card now spells out what
// the number counts, so the expectation is the written label, not the field.
check('card keeps the name, and the pack size written out when there is one',
  card.title === true && card.meta === packSizeLabel(packed.packSize),
  JSON.stringify({ ...card, expected: packSizeLabel(packed.packSize) }));

console.log('\n' + '-'.repeat(56));
console.log(fails.length ? `  ${pass} passed, ${fails.length} FAILED` : `  All ${pass} compare checks passed`);
fails.forEach((f) => console.log(`  ✗ ${f}`));

await page.close();
proc.kill();
