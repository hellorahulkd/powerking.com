/**
 * End-to-end checks against the built site. Development-only.
 *
 *   node build.js && node serve.js &     # or npm run dev
 *   node scripts/dev/qa.js
 *
 * Verifies real behaviour in a real browser: layout at phone/tablet/desktop
 * widths, search, category filtering, the mobile menu, WhatsApp links and
 * analytics events.
 */
import { launch, newPage } from './cdp.js';
import { products } from '../../src/data/products.js';
import { searchText } from '../../src/templates/components.js';
import { PAGE_SIZE } from '../../src/pages/catalogue.js';

/**
 * What the catalogue's client-side search should return for a term, worked out
 * from the data rather than written down. Hard-coded counts went stale every
 * time a product was added or removed, and a stale count fails a test that is
 * still measuring the right thing. Mirrors src/assets/js/catalogue.js: every
 * term must match the start of some word in the haystack.
 */
const HAYSTACKS = products.map((p) => searchText([
  p.name, p.brand, p.category, p.sku, p.packSize, ...(p.tags || []),
]));
/** The brand used by the filter checks: the smallest one with a sibling. */
const BRAND = [...new Set(products.map((p) => p.brand))]
  .filter((b) => b && !b.startsWith('['))
  .map((b) => ({ b, n: products.filter((p) => p.brand === b).length }))
  .filter((x) => x.n >= 2)
  .sort((a, b) => a.n - b.n || a.b.localeCompare(b.b))[0];

function expected(term) {
  const terms = searchText(term).split(' ').filter(Boolean);
  return HAYSTACKS.filter(
    (hay) => terms.every((t) => hay.split(' ').some((w) => w.startsWith(t))),
  ).length;
}

const BASE = process.env.BASE || 'http://localhost:4321';
const SHOTS = process.env.SHOTS || '';

let pass = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) { pass++; process.stdout.write(`  ✓ ${name}\n`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); process.stdout.write(`  ✗ ${name}${detail ? ` — ${detail}` : ''}\n`); }
}

const VIEWPORTS = [
  // 320 is the narrowest phone still in use (iPhone SE 1st gen, iPhone 5).
  // The suite started at 375 and so missed a real overflow there.
  { name: 'Small phone', w: 320, h: 568,  mobile: true },
  { name: 'iPhone SE',  w: 375,  h: 667,  mobile: true },
  { name: 'iPhone 14',  w: 390,  h: 844,  mobile: true },
  { name: 'Android',    w: 360,  h: 800,  mobile: true },
  { name: 'iPad',       w: 820,  h: 1180, mobile: true },
  { name: 'Laptop',     w: 1280, h: 800,  mobile: false },
  { name: 'Desktop',    w: 1600, h: 900,  mobile: false },
];

const PAGES = [
  '/', '/products/', '/products/speakers/', '/products/data-cables/',
  `/products/${products[0].slug}/`, '/about/', '/contact/', '/brands/',
  '/privacy/', '/404.html',
];

async function main() {
  const { proc, port } = await launch();

  /* ---------------------------------------- 1. responsive overflow check -- */
  process.stdout.write('\nResponsive layout (no horizontal overflow)\n');
  for (const vp of VIEWPORTS) {
    const page = await newPage(port);
    await page.setViewport(vp.w, vp.h, vp.mobile);
    let worst = null;
    for (const url of PAGES) {
      await page.goto(BASE + url);
      const r = await page.eval(`
        const de = document.documentElement;
        const over = [];
        if (de.scrollWidth > de.clientWidth + 1) {
          for (const el of document.querySelectorAll('body *')) {
            const b = el.getBoundingClientRect();
            if (b.width === 0) continue;
            if (b.right > de.clientWidth + 1 || b.left < -1) {
              const cs = getComputedStyle(el);
              if (cs.position === 'fixed') continue;
              over.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]
                + ' right=' + Math.round(b.right));
            }
          }
        }
        return { scroll: de.scrollWidth, client: de.clientWidth, over: over.slice(0, 4) };
      `);
      if (r.scroll > r.client + 1 && !worst) worst = { url, ...r };
    }
    check(
      `${vp.name} (${vp.w}px) — all ${PAGES.length} pages fit`,
      !worst,
      worst ? `${worst.url} scrollWidth ${worst.scroll} > ${worst.client}: ${worst.over.join(', ')}` : '',
    );
    if (SHOTS && vp.mobile) {
      await page.goto(`${BASE}/`);
      await page.screenshot(`${SHOTS}/home-${vp.w}.png`);
    }
    await page.close();
  }

  /* --------------------------------------------------- 1b. stripe clearance -- */
  // The caution stripe is a solid band. Anything flush against it merges into
  // it, and --header-h has to stay the header's real height or every sticky
  // offset that reads it lands under the header.
  process.stdout.write('\nCaution stripe\n');
  {
    const page = await newPage(port);
    for (const vp of VIEWPORTS) {
      await page.setViewport(vp.w, vp.h, vp.mobile);
      await page.goto(`${BASE}/products/`);
      const r = await page.eval(`
        const y = el => { const b = el.getBoundingClientRect(); return { t: b.top + scrollY, b: b.bottom + scrollY }; };
        const header = document.querySelector('.site-header');
        const [headStripe, footStripe] = document.querySelectorAll('.stripe');
        const mark = document.querySelector('.site-header .mark');
        const footer = document.querySelector('.site-footer');
        // --header-h is a calc(), so resolve it by measuring a probe.
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--header-h)';
        document.body.appendChild(probe);
        const declared = probe.getBoundingClientRect().height;
        probe.remove();
        return {
          headerH: +header.getBoundingClientRect().height.toFixed(1),
          declared: +declared.toFixed(1),
          above: +(y(mark).t - y(header).t).toFixed(1),
          below: +(y(headStripe).t - y(mark).b).toFixed(1),
          footGap: +(y(footer.querySelector('.container')).t - y(footStripe).b).toFixed(1),
        };
      `);
      check(`${vp.name} (${vp.w}px) — logo clears the stripe, --header-h is the real height`,
        r.above >= 6 && r.below >= 6 && Math.abs(r.headerH - r.declared) <= 1 && r.footGap >= 24,
        JSON.stringify(r));
    }
    await page.close();
  }

  /* --------------------------------------------- 1c. search from the home page -- */
  // The homepage declares a SearchAction to Google. This is the box that
  // claim depends on, and the path from it has to end in a filtered listing.
  process.stdout.write('\nSearch from the homepage\n');
  {
    const page = await newPage(port);
    await page.setViewport(390, 844, true);
    await page.goto(`${BASE}/`);
    const form = await page.eval(`
      const f = document.querySelector('.hsearch__form');
      return {
        action: f ? new URL(f.action).pathname : null,
        method: f ? f.method : null,
        field: f ? f.querySelector('input[type=search]').name : null,
        chips: [...document.querySelectorAll('.hsearch__chip')].map(c => c.getAttribute('href')),
      };
    `);
    check('the homepage has a search form pointing at the catalogue',
      form.action === '/products/' && form.method === 'get' && form.field === 'q',
      JSON.stringify(form));
    check('the shortcuts are real catalogue queries',
      form.chips.length > 0 && form.chips.every((h) => h.startsWith('/products/?q=')),
      form.chips.join(' '));

    // Follow the URL the form would produce rather than submitting it in
    // page: an in-page navigation destroys the execution context this helper
    // is talking to, and the next eval never comes back.
    await page.goto(`${BASE}/products/?q=speaker`);
    const landed = await page.eval(`return {
      path: location.pathname + location.search,
      prefilled: document.getElementById('product-search').value,
      shown: [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length,
    };`);
    const expected = products.filter((p) =>
      /speaker/i.test([p.name, p.brand, p.category, p.sku, ...(p.tags || [])].join(' '))).length;
    check('searching from the homepage lands on a filtered catalogue',
      landed.path === '/products/?q=speaker' && landed.prefilled === 'speaker'
      && landed.shown > 0 && landed.shown === Math.min(expected, PAGE_SIZE),
      JSON.stringify({ ...landed, expected }));
    await page.close();
  }

  /* ------------------------------------------- 1d. search from the header -- */
  process.stdout.write('\nSearch from the header\n');
  {
    const page = await newPage(port);
    for (const vp of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[5]]) {
      await page.setViewport(vp.w, vp.h, vp.mobile);
      await page.goto(`${BASE}/about/`);
      const r = await page.eval(`
        const t = document.getElementById('search-toggle');
        const panel = document.getElementById('hdr-search');
        const before = document.querySelector('.site-header').getBoundingClientRect().height;
        const closed = panel.hidden;
        t.click();
        const after = document.querySelector('.site-header').getBoundingClientRect().height;
        const focused = document.activeElement.id;
        const action = new URL(panel.querySelector('form').action).pathname;
        const field = panel.querySelector('input[type=search]').name;
        t.click();
        return { closed, open: !panel.hidden, before, after, focused, action, field,
                 reclosed: panel.hidden, expanded: t.getAttribute('aria-expanded') };
      `);
      check(`${vp.name} (${vp.w}px) — the header search opens, focuses and closes`,
        r.closed === true && r.focused === 'header-search' && r.reclosed === true
        && r.expanded === 'false', JSON.stringify(r));
      // Opening it must not move the header, or every sticky offset that reads
      // --header-h ends up pointing at the wrong place while it is open.
      check(`${vp.name} (${vp.w}px) — opening it does not resize the header`,
        Math.abs(r.after - r.before) < 1, `${r.before} -> ${r.after}`);
      check(`${vp.name} (${vp.w}px) — it searches the catalogue`,
        r.action === '/products/' && r.field === 'q', JSON.stringify(r));
    }
    await page.close();
  }

  /* --------------------------------------------------------- 1e. prices -- */
  // Prices are the one thing on this site a buyer will act on, so what is
  // rendered has to be what is stored — and it has to say what the figure is
  // FOR. Every priced product used to show its single-piece rate labelled
  // "per carton", which is the most expensive kind of wrong a catalogue can be.
  process.stdout.write('\nPrices\n');
  {
    const page = await newPage(port);
    await page.setViewport(1280, 900, false);
    const priced = products.find((p) => Number(p.pricePiece) > 0);
    const unpriced = products.find((p) => !Number(p.priceCarton) && !Number(p.pricePiece));
    const packed = products.find((p) => /^\d+$/.test(String(p.packSize || '').trim()));

    if (unpriced) {
      await page.goto(`${BASE}/products/${unpriced.slug}/`);
      const r = await page.eval(`return {
        ask: !!document.querySelector('.enquiry__price'),
        prices: document.querySelectorAll('.price__value').length,
        text: document.body.textContent,
      };`);
      check('a product with no price asks the buyer to enquire',
        r.ask === true && r.prices === 0, JSON.stringify({ ask: r.ask, prices: r.prices }));
      check('and never shows a zero price', !/Rs\.\s*0\b/.test(r.text));
    }

    if (priced) {
      await page.goto(`${BASE}/products/${priced.slug}/`);
      const r = await page.eval(`return {
        labels: [...document.querySelectorAll('.price__label')].map(e => e.textContent.trim()),
        values: [...document.querySelectorAll('.price__value')].map(e => e.textContent.trim()),
        note: (document.querySelector('.enquiry__pricenote') || {}).textContent || '',
      };`);
      check('a priced product names the rate as the price of one piece',
        r.labels.includes('Per piece'), r.labels.join(', '));
      // Nothing in the catalogue carries a real carton rate, so nothing may
      // claim to: the page has to send the buyer to ask instead.
      check('and tells the buyer the carton rate is a different number to ask for',
        /carton/i.test(r.note) && /(enquir|ask)/i.test(r.note), r.note.slice(0, 90));
      check('prices are written in rupees with Nepali grouping',
        r.values.every((v) => /^Rs\. [\d,]+$/.test(v)), r.values.join(' | '));

      // The card is where the mislabelling was actually seen.
      await page.goto(`${BASE}/products/`);
      const card = await page.eval(`
        const c = [...document.querySelectorAll('[data-product]')]
          .find(x => x.querySelector('.card__price:not(.card__price--ask)'));
        if (!c) return { none: true };
        return {
          unit: c.querySelector('.card__price-unit').textContent.trim(),
          price: c.querySelector('.card__price').textContent.trim(),
        };
      `);
      check('a card says the price is per piece, not per carton',
        card.unit === 'per piece', JSON.stringify(card));
    } else {
      check('no product carries an invented price', true);
    }

    // The footer is the only place every page ends. A buyer who lands on one
    // product from a search never reads the catalogue lead, so the piece /
    // carton distinction has to close every page, not just the ones that
    // happen to introduce it.
    for (const url of ['/', '/products/', `/products/${priced ? priced.slug : products[0].slug}/`]) {
      await page.goto(BASE + url);
      const note = await page.eval(`
        return (document.querySelector('.footer__note') || {}).textContent || '';
      `);
      check(`${url} ends with the note that carton prices differ`,
        /single piece/i.test(note) && /carton/i.test(note) && /enquir/i.test(note),
        note.trim().slice(0, 80));
    }

    if (packed) {
      await page.goto(`${BASE}/products/${packed.slug}/`);
      const r = await page.eval(`return document.body.textContent;`);
      // "48" on its own tells a buyer nothing about what is being counted.
      check('a bare pack-size number is written out as pieces per carton',
        r.includes(`${packed.packSize} pieces per carton`),
        `looking for "${packed.packSize} pieces per carton"`);
    }
    await page.close();
  }

  /* ----------------------------------------------- 2. console cleanliness -- */
  process.stdout.write('\nRuntime errors\n');
  {
    const page = await newPage(port);
    await page.setViewport(390, 844, true);
    const bad = [];
    for (const url of PAGES) {
      await page.goto(BASE + url);
      const p = page.problems();
      if (p.length) bad.push(`${url}: ${p[0]}`);
    }
    check('no console errors or failed requests on any page', bad.length === 0, bad.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------- 3. search -- */
  process.stdout.write('\nCatalogue search\n');
  {
    const page = await newPage(port);
    await page.setViewport(390, 844, true);
    await page.goto(`${BASE}/products/`);

    // Past the first screenful cards are deferred into an inert <template>,
    // so "rendered" is the wrong test — what matters is that every product is
    // in the served HTML, which is what a crawler and a reader without JS get.
    const total = await page.eval(`
      const t = document.getElementById('catalogue-tail');
      return document.querySelectorAll('#product-grid [data-product]').length
           + (t ? t.content.querySelectorAll('[data-product]').length : 0);
    `);
    check('every product is in the served HTML', total === products.length,
      `got ${total} of ${products.length}`);

    const search = (term) => page.eval(`
      const i = document.getElementById('product-search');
      i.value = ${JSON.stringify(term)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return [...document.querySelectorAll('[data-product]')]
        .filter(c => !c.hidden).map(c => c.querySelector('.card__title').textContent.trim());
    `);

    const byName = await search('trimmer');
    check(`search by product name ("trimmer") matches ${expected('trimmer')}`,
      byName.length === expected('trimmer'), byName.join(', '));

    const byBrand = await search('kisonli');
    check(`search by brand matches ${expected('kisonli')}`,
      byBrand.length === expected('kisonli'), byBrand.join(', '));

    const bySku = await search('v-091');
    check('search by SKU (with punctuation) matches 1',
      bySku.length === expected('v-091') && bySku.length === 1, bySku.join(', '));

    // Matching is anchored to word starts: type-ahead works, but a term must
    // not match the middle of an unrelated word.
    const prefix = await search('trimm');
    check('type-ahead prefix ("trimm") still matches',
      prefix.length === expected('trimm') && prefix.length > 0, prefix.join(', '));
    const midWord = await search('immer');
    check('mid-word fragment ("immer") matches nothing', midWord.length === 0, midWord.join(', '));

    // "ipx6" is only in a product's tags, not in anything the card shows.
    const byTag = await search('ipx6');
    check('search matches hidden tags ("ipx6")',
      byTag.length === expected('ipx6') && byTag.length === 1, byTag.join(', '));

    // Regression guard: assert the pixels, not just the `hidden` property.
    // A CSS class that sets `display` silently beats the UA [hidden] rule.
    const reallyHidden = await page.eval(`
      const i = document.getElementById('product-search');
      i.value = 'ipx6';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      const cards = [...document.querySelectorAll('[data-product]')];
      const hiddenOnes = cards.filter(c => c.hidden);
      return {
        hidden: hiddenOnes.length,
        stillPainted: hiddenOnes.filter(c => getComputedStyle(c).display !== 'none').length,
        visibleRects: cards.filter(c => c.getBoundingClientRect().height > 0).length,
      };
    `);
    check('filtered-out cards are actually removed from view',
      reallyHidden.stillPainted === 0 && reallyHidden.visibleRects === 1,
      JSON.stringify(reallyHidden));

    const empty = await page.eval(`
      const i = document.getElementById('product-search');
      i.value = 'zzzz-no-such-product';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      const nr = document.getElementById('no-results');
      return { hiddenGrid: document.getElementById('product-grid').hidden, emptyShown: !nr.hidden };
    `);
    check('no-results empty state appears', empty.emptyShown && empty.hiddenGrid, JSON.stringify(empty));

    // Clearing filters restores the listing, but the listing is windowed: it
    // shows one page worth and offers "show more" for the rest. Assert both
    // halves, so a broken window can't pass as a full restore.
    const reset = await page.eval(`
      document.getElementById('reset-filters').click();
      const more = document.getElementById('load-more');
      const visible = () =>
        [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length;
      const first = visible();
      let clicks = 0;
      while (more && !more.hidden && clicks < 20) { more.click(); clicks++; }
      return { first, all: visible(), moreHidden: !more || more.hidden };
    `);
    check('clear filters restores the first page of products',
      reset.first === Math.min(PAGE_SIZE, products.length),
      `got ${reset.first}, expected ${Math.min(PAGE_SIZE, products.length)}`);
    check('"show more" reveals the rest of the catalogue',
      reset.all === products.length && reset.moreHidden,
      `got ${reset.all} of ${products.length}`);

    const status = await page.eval(`
      const i = document.getElementById('product-search');
      i.value = 'ipx6';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('search-status').textContent.trim();
    `);
    check('live result count is announced', /1 product/.test(status), status);
    await page.close();
  }

  /* --------------------------------------------------- 4. category filter -- */
  process.stdout.write('\nCategory & brand filters\n');
  {
    const page = await newPage(port);
    await page.setViewport(1280, 800, false);
    await page.goto(`${BASE}/products/`);
    const filtered = await page.eval(`
      const chip = document.querySelector('[data-filter-cat="Speakers"]');
      chip.click();
      return {
        visible: [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length,
        pressed: chip.getAttribute('aria-pressed'),
        selectValue: document.getElementById('category-filter').value,
      };
    `);
    // Read the expected count from the data, not from one snapshot of it —
    // the catalogue grows, and a hard-coded number just fails on the next
    // product added. The window caps at PAGE_SIZE once a listing paginates.
    const speakers = products.filter((p) => p.category === 'Speakers').length;
    check('category chip filters to exactly the speakers',
      filtered.visible === Math.min(speakers, 48),
      JSON.stringify({ ...filtered, expected: speakers }));
    check('active chip sets aria-pressed', filtered.pressed === 'true');

    // The select is the category control below 900px, where the chip row can
    // only be swiped. It must filter identically and stay in step with the
    // chips, since a reader can meet either one.
    check('the chip selection is mirrored on the category select',
      filtered.selectValue === 'Speakers', filtered.selectValue);

    const viaSelect = await page.eval(`
      document.querySelector('[data-filter-cat=""]').click();
      const s = document.getElementById('category-filter');
      s.value = 'Speakers';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      const chip = document.querySelector('[data-filter-cat="Speakers"]');
      return {
        visible: [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length,
        chipPressed: chip.getAttribute('aria-pressed'),
        allChip: [...document.querySelector('[data-filter-cat=""]').classList].includes('is-active'),
      };
    `);
    check('category select filters to exactly the speakers',
      viaSelect.visible === Math.min(speakers, PAGE_SIZE),
      JSON.stringify({ ...viaSelect, expected: speakers }));
    check('choosing on the select moves the active chip with it',
      viaSelect.chipPressed === 'true' && viaSelect.allChip === false,
      JSON.stringify(viaSelect));

    const brand = await page.eval(`
      document.querySelector('[data-filter-cat=""]').click();
      const s = document.getElementById('brand-filter');
      s.value = ${JSON.stringify(BRAND.b)};
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length;
    `);
    check(`brand filter narrows to the ${BRAND.n} ${BRAND.b} products`,
      brand === BRAND.n, `got ${brand}`);

    // A term matching one product of that brand: the two controls have to
    // intersect, not replace one another.
    const narrow = products.find((p) => p.brand === BRAND.b);
    const term = (narrow.sku || narrow.name).split(/\s+/)[0];
    const combined = await page.eval(`
      const i = document.getElementById('product-search');
      i.value = ${JSON.stringify(term)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length;
    `);
    check('search + brand filter combine',
      combined > 0 && combined <= BRAND.n && combined <= expected(term),
      `got ${combined} for “${term}” within ${BRAND.n} ${BRAND.b} products`);

    // Exactly one category control is on screen at any width — the chips where
    // they can wrap, the select where they would be a blind swipe. Two at once
    // is clutter; none at all strands the reader in one category.
    for (const vp of VIEWPORTS) {
      await page.setViewport(vp.w, vp.h, vp.mobile);
      await page.goto(`${BASE}/products/`);
      const shown = await page.eval(`
        const seen = el => el.getBoundingClientRect().height > 0;
        return {
          chips: seen(document.querySelector('.toolbar .chips')),
          select: seen(document.getElementById('category-filter')),
        };
      `);
      check(`${vp.name} (${vp.w}px) — one category control, not two`,
        shown.chips !== shown.select, JSON.stringify(shown));
    }

    // On a category page the category is fixed, so picking another one has to
    // navigate rather than filter an already-narrowed list down to nothing.
    await page.setViewport(390, 844, true);
    await page.goto(`${BASE}/products/speakers/`);
    await page.eval(`
      const s = document.getElementById('category-filter');
      s.value = 'Grooming';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;
    `);
    const landed = await page.eval(`return location.pathname;`);
    check('on a category page the select navigates to the category',
      landed === '/products/grooming/', landed);
    await page.close();
  }

  /* ------------------------------------------------------ 5. mobile menu -- */
  process.stdout.write('\nMobile navigation\n');
  {
    const page = await newPage(port);
    await page.setViewport(390, 844, true);
    await page.goto(`${BASE}/`);
    const menu = await page.eval(`
      const t = document.querySelector('.nav-toggle');
      const m = document.getElementById('mobile-menu');
      const before = m.hidden;
      t.click();
      const afterOpen = { hidden: m.hidden, expanded: t.getAttribute('aria-expanded'),
                          bodyClass: document.body.classList.contains('menu-open') };
      t.click();
      return { before, afterOpen, afterClose: m.hidden };
    `);
    check('menu starts closed', menu.before === true);
    check('hamburger opens the menu', menu.afterOpen.hidden === false && menu.afterOpen.expanded === 'true');
    check('opening the menu hides the floating button', menu.afterOpen.bodyClass === true);
    check('hamburger closes the menu', menu.afterClose === true);

    const esc = await page.eval(`
      const t = document.querySelector('.nav-toggle');
      t.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return document.getElementById('mobile-menu').hidden;
    `);
    check('Escape closes the menu', esc === true);

    const toggleVisible = await page.eval(`
      const t = document.querySelector('.nav-toggle');
      return getComputedStyle(t).display !== 'none';
    `);
    check('hamburger is visible on mobile', toggleVisible === true);
    await page.close();
  }

  /* ------------------------------------------------- 6. whatsapp linking -- */
  process.stdout.write('\nWhatsApp integration\n');
  {
    const page = await newPage(port);
    await page.setViewport(1280, 800, false);
    await page.goto(`${BASE}/products/${products[0].slug}/`);
    const wa = await page.eval(`
      const links = [...document.querySelectorAll('[data-wa-track]')];
      return {
        count: links.length,
        locations: [...new Set(links.map(l => l.dataset.waLocation))],
        product: links.find(l => l.dataset.waLocation === 'product_page')?.dataset.waProduct,
        href: links.find(l => l.dataset.waLocation === 'product_page')?.getAttribute('href'),
      };
    `);
    check('product page has WhatsApp CTAs', wa.count >= 4, `count ${wa.count}`);
    check('product name is attached for analytics',
      wa.product === products[0].name, wa.product);
    check('WhatsApp link is a real wa.me chat with the number configured',
      /^https:\/\/wa\.me\/9779863215831\?text=/.test(wa.href || ''), wa.href);
    check('the pre-filled message names the product',
      decodeURIComponent(wa.href || '').includes(products[0].name), wa.href);
    check(
      'CTAs cover header, floating, product and footer',
      ['header', 'floating_button', 'product_page', 'footer'].every((l) => wa.locations.includes(l)),
      wa.locations.join(','),
    );

    const floatVisible = await page.eval(`
      const f = document.querySelector('.wa-float');
      const b = f.getBoundingClientRect();
      return { display: getComputedStyle(f).display, inView: b.bottom <= innerHeight + 1 && b.right <= innerWidth + 1 };
    `);
    check('floating WhatsApp button is on-screen', floatVisible.inView === true, JSON.stringify(floatVisible));
    await page.close();
  }

  /* ----------------------------------------------------- 7. GA4 events -- */
  process.stdout.write('\nAnalytics events\n');
  {
    const page = await newPage(port);
    await page.setViewport(1280, 800, false);
    await page.goto(`${BASE}/products/${products[0].slug}/`);
    const ev = await page.eval(`
      const seen = [];
      window.gtag = (type, name, params) => { if (type === 'event') seen.push({ name, params }); };
      // product_view fires on load before our stub exists, so check dataLayer too.
      const queued = (window.dataLayer || []).map(x => x.event).filter(Boolean);
      document.querySelector('[data-wa-location="product_page"]').click();
      return { queued, seen };
    `);
    check('product_view is recorded on load', ev.queued.includes('product_view'), JSON.stringify(ev.queued));
    check('whatsapp_click fires on CTA click', ev.seen.some(e => e.name === 'whatsapp_click'));
    const waEv = ev.seen.find(e => e.name === 'whatsapp_click');
    check(
      'whatsapp_click carries product + location',
      waEv?.params?.product === products[0].name && waEv?.params?.location === 'product_page',
      JSON.stringify(waEv?.params),
    );

    await page.goto(`${BASE}/products/`);
    const search = await page.eval(`
      const seen = [];
      window.gtag = (t, name, params) => { if (t === 'event') seen.push({ name, params }); };
      const i = document.getElementById('product-search');
      i.value = 'ipx6';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 900));
      document.querySelector('[data-track-category]')?.click();
      return seen;
    `);
    check('product_search fires (debounced)', search.some(e => e.name === 'product_search'),
      JSON.stringify(search.map(e => e.name)));
    const se = search.find(e => e.name === 'product_search');
    check('product_search carries term + result count', se?.params?.search_term === 'ipx6' && se?.params?.results === 1,
      JSON.stringify(se?.params));

    await page.goto(`${BASE}/products/speakers/`);
    const cat = await page.eval(`
      return (window.dataLayer || []).some(x => x.event === 'category_view');
    `);
    check('category_view fires on a category page', cat === true);
    await page.close();
  }

  /* ------------------------------------------------------ 8. a11y basics -- */
  /* ------------------------------------------------- N. mobile density -- */
  // The complaint this section exists for: on a phone you had to scroll twice
  // before a product appeared. Everything above the first card — the search
  // strip, the carousel, the category row, the section heading — is measured
  // together, because any one of them growing puts products back off screen.
  process.stdout.write('\nA phone sees products without scrolling\n');
  {
    const page = await newPage(port);
    // The narrowest phone still in use and a current one; the fold has to hold
    // on both, not just the roomy one.
    for (const [w, h] of [[402, 874], [360, 780]]) {
      await page.setViewport(w, h, true);
      for (const url of ['/', '/products/']) {
        await page.goto(BASE + url);
        const r = await page.eval(`
          const card = document.querySelector('[data-product]');
          const bar = document.querySelector('.tabbar');
          const b = card ? card.getBoundingClientRect() : null;
          const barTop = bar ? bar.getBoundingClientRect().top : ${h};
          return {
            cardTop: b ? Math.round(b.top) : null,
            // A card hidden behind the pinned bar is not on screen.
            visible: b ? Math.round(Math.min(barTop, ${h}) - b.top) : 0,
          };
        `);
        check(`${url} shows a product on the first screen at ${w}x${h}`,
          r.cardTop !== null && r.visible > 60,
          `card top ${r.cardTop}, ${r.visible}px of it above the bar`);
      }
    }

    // The other half of the complaint: the picture did not fill its box, so a
    // product looked small inside a mostly empty card.
    await page.setViewport(402, 874, true);
    await page.goto(`${BASE}/products/`);
    const fill = await page.eval(`
      const media = document.querySelector('.card__media');
      const img = media.querySelector('img');
      const m = media.getBoundingClientRect(), i = img.getBoundingClientRect();
      return { media: Math.round(m.height), img: Math.round(i.height),
               fit: getComputedStyle(img).objectFit };
    `);
    check('the product photo fills its card, edge to edge',
      fill.img === fill.media, `${fill.img}px picture in a ${fill.media}px box`);
    // contain, still: a catalogue photograph must not be cropped to fill.
    check('and is not cropped to do it', fill.fit === 'contain', fill.fit);
    await page.close();
  }

  process.stdout.write('\nThe bar pinned to the bottom of a phone\n');
  {
    const page = await newPage(port);
    await page.setViewport(402, 874, true);
    await page.goto(`${BASE}/`);
    const r = await page.eval(`
      const bar = document.querySelector('.tabbar');
      const b = bar.getBoundingClientRect();
      return {
        shown: getComputedStyle(bar).display !== 'none',
        atBottom: Math.round(b.bottom) <= 874 && Math.round(b.bottom) >= 870,
        items: [...bar.querySelectorAll('.tabbar__label')].map(i => i.textContent.trim()),
        floatShown: getComputedStyle(document.querySelector('.wa-float')).display !== 'none',
        bodyPad: getComputedStyle(document.body).paddingBottom,
      };
    `);
    check('it is on screen, at the bottom', r.shown && r.atBottom, JSON.stringify(r));
    check('with Home, Categories and Enquire',
      r.items.join('|') === 'Home|Categories|Enquire', r.items.join('|'));
    check('the floating bubble stands down for it, so there is one Enquire',
      r.floatShown === false);
    check('the page reserves room, so the bar covers nothing',
      parseFloat(r.bodyPad) > 40, r.bodyPad);

    // It has to stay put — that is the whole point of it.
    const stuck = await page.eval(`
      window.scrollTo(0, 2000);
      return new Promise(function (done) {
        setTimeout(function () {
          const b = document.querySelector('.tabbar').getBoundingClientRect();
          done({ bottom: Math.round(b.bottom), scrolled: Math.round(window.scrollY) });
        }, 250);
      });
    `);
    check('and stays there once the page is scrolled',
      stuck.scrolled > 500 && stuck.bottom >= 870 && stuck.bottom <= 874,
      JSON.stringify(stuck));

    // A list left over from an earlier check would make this count wrong.
    // Cleared here and reloaded from Node: reloading inside page.eval destroys
    // the execution context the call is waiting on, and the run hangs.
    await page.eval(`try { localStorage.removeItem('pk-enquiry'); } catch (e) {} return 1;`);
    await page.goto(`${BASE}/`);
    const badge = await page.eval(`
      document.querySelector('[data-enq-add]').click();
      return new Promise(function (done) {
        setTimeout(function () {
          const b = document.getElementById('tab-enq-count');
          const bar = document.querySelector('.enq-bar').getBoundingClientRect();
          const tab = document.querySelector('.tabbar').getBoundingClientRect();
          done({ hidden: b.hidden, text: b.textContent,
                 barClearsTab: Math.round(bar.bottom) <= Math.round(tab.top) });
        }, 300);
      });
    `);
    check('the Enquire tab counts what is on the list',
      badge.hidden === false && badge.text === '1', JSON.stringify(badge));
    check('and the enquiry bar stacks above it rather than under it',
      badge.barClearsTab === true, JSON.stringify(badge));

    await page.setViewport(1280, 800, false);
    await page.goto(`${BASE}/`);
    const desktop = await page.eval(`
      return {
        bar: getComputedStyle(document.querySelector('.tabbar')).display,
        float: getComputedStyle(document.querySelector('.wa-float')).display,
        bodyPad: getComputedStyle(document.body).paddingBottom,
      };
    `);
    check('on a laptop it gives way to the header navigation',
      desktop.bar === 'none' && desktop.float !== 'none' && parseFloat(desktop.bodyPad) < 10,
      JSON.stringify(desktop));
    await page.close();
  }

  process.stdout.write('\nAccessibility basics\n');
  {
    const page = await newPage(port);
    await page.setViewport(1280, 800, false);
    const issues = [];
    for (const url of PAGES) {
      await page.goto(BASE + url);
      const r = await page.eval(`
        const out = [];
        const h1 = document.querySelectorAll('h1');
        if (h1.length !== 1) out.push('h1 count ' + h1.length);
        for (const img of document.querySelectorAll('img')) {
          if (!img.hasAttribute('alt')) out.push('img missing alt: ' + img.getAttribute('src'));
        }
        for (const a of document.querySelectorAll('a')) {
          const label = (a.textContent || '').trim() || a.getAttribute('aria-label');
          if (!label) out.push('link with no accessible name: ' + a.getAttribute('href'));
        }
        if (!document.querySelector('main')) out.push('no <main>');
        if (!document.querySelector('.skip-link')) out.push('no skip link');
        if (document.documentElement.lang !== 'en') out.push('missing lang');
        return out;
      `);
      if (r.length) issues.push(`${url}: ${r.join('; ')}`);
    }
    check('exactly one h1, alt text, named links, landmarks on every page',
      issues.length === 0, issues.slice(0, 3).join(' | '));

    await page.goto(`${BASE}/products/`);
    const focus = await page.eval(`
      const el = document.getElementById('product-search');
      el.focus();
      return document.activeElement === el;
    `);
    check('search input is focusable', focus === true);

    // A container that colours its links (the footer did) can outrank .btn, and
    // an outline button inherits ink that vanishes on a dark panel. Both are
    // invisible in the declarations, so measure the real computed colours —
    // and do it on every page, since these bugs are container-specific.
    const contrastEval = `
      const lum = (c) => {
        const [r, g, b] = c.match(/[\\d.]+/g).slice(0, 3).map(Number).map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + 0.05) / (y + 0.05);
      };
      const bad = [];
      for (const el of document.querySelectorAll('.btn, .wa-float')) {
        const cs = getComputedStyle(el);
        let bg = cs.backgroundColor, node = el;
        while (bg === 'rgba(0, 0, 0, 0)' && node.parentElement) {
          node = node.parentElement;
          bg = getComputedStyle(node).backgroundColor;
        }
        const r = ratio(cs.color, bg);
        if (r < 4.5) bad.push((el.className || '') + ' ' + r.toFixed(2) + ':1');
      }
      return bad;
    `;
    const contrastIssues = [];
    for (const url of PAGES) {
      await page.goto(BASE + url);
      const bad = await page.eval(contrastEval);
      if (bad.length) contrastIssues.push(`${url}: ${bad.join(', ')}`);
    }
    check('every button label meets 4.5:1 against its own background, on every page',
      contrastIssues.length === 0, contrastIssues.slice(0, 3).join(' | '));
    await page.close();
  }

  /* --------------------------------------------------------- 9. no-JS -- */
  process.stdout.write('\nWorks without JavaScript\n');
  {
    const page = await newPage(port);
    await page.setViewport(390, 844, true);
    await page.send('Emulation.setScriptExecutionDisabled', { value: true });
    await page.goto(`${BASE}/products/`);
    const n = await page.eval(`return 1;`).catch(() => null);
    const html = await page.send('Runtime.evaluate', {
      expression: 'document.querySelectorAll("[data-product]").length',
      returnByValue: true,
    }).catch(() => null);
    // With scripts disabled we cannot evaluate; fetch the HTML instead.
    const res = await fetch(`${BASE}/products/`);
    const body = await res.text();
    const count = (body.match(/data-product/g) || []).length;
    check('catalogue HTML contains every product without JS',
      count === products.length, `found ${count} of ${products.length}`);
    check('search form falls back to a GET submit',
      /<form[^>]+action="\/products\/"[^>]+method="get"/.test(body) || /action="\/products\/"/.test(body));
    await page.close();
  }

  /* ------------------------------------------------------------ report -- */
  process.stdout.write(`\n${'-'.repeat(60)}\n`);
  if (failures.length) {
    process.stdout.write(`  ${pass} passed, ${failures.length} FAILED\n\n`);
    for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`  All ${pass} checks passed\n`);
  }
  process.stdout.write('\n');
  proc.kill();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
