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
  '/products/sample-tws-wireless-earbuds/', '/about/', '/contact/', '/brands/',
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

    const byName = await search('earbuds');
    check('search by product name/category ("earbuds") matches 2',
      byName.length === 2, byName.join(', '));

    const byBrand = await search('samplelink');
    check('search by brand matches 2', byBrand.length === 2, byBrand.join(', '));

    const bySku = await search('pk-cbl-001');
    check('search by SKU (with punctuation) matches 1', bySku.length === 1, bySku.join(', '));

    // Matching is anchored to word starts: type-ahead works, but a term must
    // not match the middle of an unrelated word.
    const prefix = await search('earbu');
    check('type-ahead prefix ("earbu") still matches', prefix.length === 2, prefix.join(', '));
    const midWord = await search('buds');
    check('mid-word fragment ("buds") matches nothing', midWord.length === 0, midWord.join(', '));

    const byTag = await search('powerbank');
    check('search matches hidden tags ("powerbank")', byTag.length === 1, byTag.join(', '));

    // Regression guard: assert the pixels, not just the `hidden` property.
    // A CSS class that sets `display` silently beats the UA [hidden] rule.
    const reallyHidden = await page.eval(`
      const i = document.getElementById('product-search');
      i.value = 'powerbank';
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

    const reset = await page.eval(`
      document.getElementById('reset-filters').click();
      return [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length;
    `);
    check('clear filters restores all products',
      reset === products.length, `got ${reset} of ${products.length}`);

    const status = await page.eval(`
      const i = document.getElementById('product-search');
      i.value = 'neckband';
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
      };
    `);
    check('category chip filters to 2 speakers', filtered.visible === 2, JSON.stringify(filtered));
    check('active chip sets aria-pressed', filtered.pressed === 'true');

    const brand = await page.eval(`
      document.querySelector('[data-filter-cat=""]').click();
      const s = document.getElementById('brand-filter');
      s.value = 'SampleLink';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length;
    `);
    check('brand filter narrows to 2', brand === 2, `got ${brand}`);

    const combined = await page.eval(`
      const i = document.getElementById('product-search');
      i.value = 'lightning';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return [...document.querySelectorAll('[data-product]')].filter(c => !c.hidden).length;
    `);
    check('search + brand filter combine', combined === 1, `got ${combined}`);
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
    await page.goto(`${BASE}/products/sample-tws-wireless-earbuds/`);
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
      wa.product === 'Sample TWS Wireless Earbuds', wa.product);
    check('WhatsApp link is a real wa.me chat with the number configured',
      /^https:\/\/wa\.me\/9779863215831\?text=/.test(wa.href || ''), wa.href);
    check('the pre-filled message names the product',
      decodeURIComponent(wa.href || '').includes('Sample TWS Wireless Earbuds'), wa.href);
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
    await page.goto(`${BASE}/products/sample-tws-wireless-earbuds/`);
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
      waEv?.params?.product === 'Sample TWS Wireless Earbuds' && waEv?.params?.location === 'product_page',
      JSON.stringify(waEv?.params),
    );

    await page.goto(`${BASE}/products/`);
    const search = await page.eval(`
      const seen = [];
      window.gtag = (t, name, params) => { if (t === 'event') seen.push({ name, params }); };
      const i = document.getElementById('product-search');
      i.value = 'powerbank';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 900));
      document.querySelector('[data-track-category]')?.click();
      return seen;
    `);
    check('product_search fires (debounced)', search.some(e => e.name === 'product_search'),
      JSON.stringify(search.map(e => e.name)));
    const se = search.find(e => e.name === 'product_search');
    check('product_search carries term + result count', se?.params?.search_term === 'powerbank' && se?.params?.results === 1,
      JSON.stringify(se?.params));

    await page.goto(`${BASE}/products/speakers/`);
    const cat = await page.eval(`
      return (window.dataLayer || []).some(x => x.event === 'category_view');
    `);
    check('category_view fires on a category page', cat === true);
    await page.close();
  }

  /* ------------------------------------------------------ 8. a11y basics -- */
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
