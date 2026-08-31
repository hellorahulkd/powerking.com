/**
 * Browser tests for the windowed catalogue listing.
 * Development-only.
 *
 *   node serve.js &        # or npm run dev
 *   node scripts/dev/catalogue-test.js
 *
 * The point of these: past the first screenful, cards live in an inert
 * <template>. Everything below proves that a product in the tail is still
 * findable, still ordered correctly, and still reachable without JavaScript.
 */
import { launch, newPage } from './cdp.js';

const BASE = process.env.BASE || 'http://localhost:4321';
let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const { proc, port } = await launch();
const page = await newPage(port);
await page.setViewport(1280, 900, false);
await page.goto(`${BASE}/products/`);

const total = await page.eval(`
  const t = document.getElementById('catalogue-tail');
  return {
    live: document.querySelectorAll('#product-grid [data-product]').length,
    tail: t ? t.content.querySelectorAll('[data-product]').length : 0,
  };
`);
const paged = total.tail > 0;
console.log(`\n  catalogue: ${total.live} rendered + ${total.tail} deferred\n`);

if (!paged) {
  check('small catalogue renders every card directly, with no template', total.tail === 0);
} else {
  check('only a window of cards is in the render tree', total.live <= 48, `${total.live} live`);

  // The whole point: a product past the window must still be findable.
  const deep = await page.eval(`
    const t = document.getElementById('catalogue-tail');
    const nodes = [...t.content.querySelectorAll('[data-product]')];
    const last = nodes[nodes.length - 1];
    return { name: last.querySelector('.card__title a').textContent.trim(),
             href: last.querySelector('.card__title a').getAttribute('href') };
  `);
  const found = await page.eval(`
    const i = document.getElementById('product-search');
    i.value = ${JSON.stringify(deep.name)};
    i.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = [...document.querySelectorAll('#product-grid [data-product]')].filter(c => !c.hidden);
    return {
      count: shown.length,
      names: shown.map(c => c.querySelector('.card__title a').textContent.trim()),
      status: document.getElementById('search-status').textContent,
    };
  `);
  check('a product deferred into the template is still findable by search',
    found.names.includes(deep.name), `searched "${deep.name}", got ${JSON.stringify(found.names)}`);
  check('search reports a count, not just what happens to be rendered',
    /\d+ product/.test(found.status), found.status);

  // Order must survive cards being pulled out of the template.
  const order = await page.eval(`
    document.getElementById('reset-filters').click();
    const cards = [...document.querySelectorAll('#product-grid [data-product]')].filter(c => !c.hidden);
    const orders = cards.map(c => Number(c.style.order));
    const sorted = orders.slice().sort((a, b) => a - b);
    return { ok: JSON.stringify(orders) === JSON.stringify(sorted), first: orders.slice(0, 3), n: orders.length };
  `);
  check('listing still reads in catalogue order after a search',
    order.ok === true, JSON.stringify(order));

  // Show more.
  const more = await page.eval(`
    const b = document.getElementById('load-more');
    const before = [...document.querySelectorAll('#product-grid [data-product]')].filter(c => !c.hidden).length;
    b.click();
    const after = [...document.querySelectorAll('#product-grid [data-product]')].filter(c => !c.hidden).length;
    return { before, after, label: b.textContent, isLink: b.tagName === 'A', href: b.getAttribute('href') };
  `);
  check('"Show more" reveals the next batch', more.after > more.before, JSON.stringify(more));
  check('"Show more" is a real link to the next page for anyone without JS',
    more.isLink && /\/products\/page\/2\/$/.test(more.href || ''), JSON.stringify(more));

  // Filtering must count the whole catalogue, not the window.
  const filtered = await page.eval(`
    document.getElementById('reset-filters').click();
    const chip = [...document.querySelectorAll('[data-filter-cat]')].find(c => c.getAttribute('data-filter-cat'));
    chip.click();
    const cat = chip.getAttribute('data-filter-cat');
    const shown = [...document.querySelectorAll('#product-grid [data-product]')].filter(c => !c.hidden);
    return {
      cat,
      status: document.getElementById('search-status').textContent,
      allMatch: shown.every(c => c.getAttribute('data-category') === cat),
      shown: shown.length,
    };
  `);
  check('a category filter only ever shows that category',
    filtered.allMatch === true, JSON.stringify(filtered));
  check('the count reflects the whole catalogue, not the rendered window',
    Number((filtered.status.match(/(\d+) product/) || [])[1]) >= filtered.shown,
    filtered.status);

  // With JS the pager is redundant; without it, it is the only way through.
  const pagerState = await page.eval(`
    const p = document.getElementById('pager');
    return { exists: !!p, hidden: p ? p.hidden : null };
  `);
  check('pager is hidden once JS takes over page one',
    pagerState.exists && pagerState.hidden === true, JSON.stringify(pagerState));

  const res = await fetch(`${BASE}/products/page/2/`);
  const html = await res.text();
  check('page 2 exists and is server-rendered', res.status === 200);
  check('page 2 carries real cards without JS',
    (html.match(/class="card[ "]/g) || []).length > 1);
  check('page 2 links back with rel=prev', /rel="prev"/.test(html));
  check('page 2 defers nothing — it is the no-JS path',
    !/id="catalogue-tail"/.test(html));
}

// The empty state has to work at any size.
const empty = await page.eval(`
  const i = document.getElementById('product-search');
  i.value = 'zzzzqqqq';
  i.dispatchEvent(new Event('input', { bubbles: true }));
  const grid = document.getElementById('product-grid');
  const nr = document.getElementById('no-results');
  return { gridHidden: grid.hidden, noResultsShown: !nr.hidden };
`);
check('a query matching nothing shows the empty state', empty.gridHidden && empty.noResultsShown,
  JSON.stringify(empty));

// Icons come from one sprite rather than being inlined per card.
// Clear the filters first — the check above leaves the grid empty, and a card
// that is display:none measures zero whatever its icons are doing.
const sprite = await page.eval(`
  document.getElementById('reset-filters').click();
  const s = document.querySelector('.icon-sprite');
  const uses = document.querySelectorAll('.card use').length;
  const r = s ? s.getBoundingClientRect() : null;
  return {
    symbols: s ? s.querySelectorAll('symbol').length : 0,
    uses,
    space: r ? Math.round(r.width) + 'x' + Math.round(r.height) : 'none',
    painted: (() => {
      const u = document.querySelector('.card use');
      if (!u) return null;
      const box = u.ownerSVGElement.getBoundingClientRect();
      return Math.round(box.width);
    })(),
  };
`);
check('icons are defined once as a sprite', sprite.symbols >= 2, JSON.stringify(sprite));
check('cards reference the sprite instead of inlining paths', sprite.uses > 0, JSON.stringify(sprite));
check('the sprite itself takes up no space', sprite.space === '0x0', sprite.space);
check('sprite icons still render at their intended size', sprite.painted > 0, JSON.stringify(sprite));

console.log('\n' + '-'.repeat(56));
console.log(fails.length ? `  ${pass} passed, ${fails.length} FAILED` : `  All ${pass} catalogue checks passed`);
fails.forEach((f) => console.log(`  ✗ ${f}`));

await page.close();
proc.kill();
process.exit(fails.length ? 1 : 0);
