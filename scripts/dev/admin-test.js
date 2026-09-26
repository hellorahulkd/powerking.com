#!/usr/bin/env node
/**
 * End-to-end checks for the catalogue admin at /admin/. Development-only.
 *
 *   node build.js && node serve.js &
 *   node scripts/dev/admin-test.js
 *
 * GitHub is stubbed rather than called: window.fetch is replaced before the
 * page's own scripts run, so every request the panel makes is captured and
 * every response is ours. That means these checks assert the exact payloads
 * sent to the API — the branch, the blob sha, the commit message, the JSON
 * body — without a token, a network round trip, or a commit to anyone's
 * repository.
 *
 * The one thing it deliberately cannot check is GitHub's own authorisation.
 * That is the point of the design: the panel does not decide who may write,
 * so there is no local rule here to get wrong.
 */
import { launch, newPage } from './cdp.js';
import { products } from '../../src/data/products.js';
import { categories } from '../../src/data/categories.js';
import { siteConfig } from '../../src/config/site.config.js';

const BASE = process.env.BASE || 'http://localhost:4321';
const { owner, name: repo, branch } = siteConfig.repo;

let pass = 0;
const fails = [];
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fails.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

/** The fake GitHub, installed before admin.js runs. */
const stub = `
// A previous run may have left a token — or a photo-reading key — in this
// origin's storage, and the panel would pick either back up. Start clean,
// always.
// __keep survives the reload the offline check makes, and nothing else, so
// that one scenario can seed a signed-in device without every other load
// inheriting it.
try {
  if (!sessionStorage.getItem('__keep')) {
    ['pk-admin-token', 'pk-vision-provider', 'pk-vision-model', 'pk-vision-key',
     'pk-price-book']
      .forEach(function (k) { localStorage.removeItem(k); });
  }
} catch (e) {}
// Set by the offline check, so every request fails the way a lost connection
// fails: a rejected fetch with no status, not an HTTP error.
try { window.__offline = !!sessionStorage.getItem('__offline'); } catch (e) {}
// Headless Chrome will not hand out the real clipboard without a permission
// prompt, so the price book's copy is captured here instead of granted.
window.__copied = [];
try {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: function (t) { window.__copied.push(String(t)); return Promise.resolve(); } },
  });
} catch (e) {}
window.__gh = {
  calls: [],
  nextStatus: null,          // force one response to fail, for the conflict path
  head: 'head-1', blobs: {}, trees: {}, commits: {},
  files: {
    'data/products.json':   { sha: 'products-sha-1',   text: ${JSON.stringify(JSON.stringify(products, null, 2) + '\n')} },
    'data/categories.json': { sha: 'categories-sha-1', text: ${JSON.stringify(JSON.stringify(categories, null, 2) + '\n')} },
  },
};
(function () {
  function b64(text) {
    var bytes = new TextEncoder().encode(text), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function reply(status, data) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      json: function () { return Promise.resolve(data); },
    });
  }
  window.fetch = function (url, opts) {
    if (window.__offline) return Promise.reject(new TypeError('Failed to fetch'));
    opts = opts || {};
    var method = opts.method || 'GET';
    window.__gh.calls.push({
      url: String(url), method: method,
      auth: (opts.headers || {}).Authorization || '',
      body: opts.body ? JSON.parse(opts.body) : null,
    });

    if (window.__gh.nextStatus) {
      var s = window.__gh.nextStatus; window.__gh.nextStatus = null;
      return reply(s, { message: 'stubbed failure ' + s });
    }

    var u = new URL(String(url));
    var p = u.pathname;
    if (p === '/user') return reply(200, { login: 'testuser' });
    if (p === '/repos/${owner}/${repo}') return reply(200, { permissions: { push: true } });

    // Category changes stage blobs, then publish a single tree/commit.
    var gitPath = p.split('/git/')[1];
    if (gitPath) {
      var body = opts.body ? JSON.parse(opts.body) : {};
      var key = 'git-' + window.__gh.calls.length;
      if (gitPath.indexOf('ref/heads/') === 0) return reply(200, { object: { sha: window.__gh.head } });
      if (method === 'GET' && gitPath.indexOf('commits/') === 0) return reply(200, { tree: { sha: 'base-tree' } });
      if (gitPath === 'blobs') {
        window.__gh.blobs[key] = new TextDecoder().decode(
          Uint8Array.from(atob(body.content), function (c) { return c.charCodeAt(0); }));
        return reply(201, { sha: key });
      }
      if (gitPath === 'trees') { window.__gh.trees[key] = body.tree; return reply(201, { sha: key }); }
      if (gitPath === 'commits') { window.__gh.commits[key] = body; return reply(201, { sha: key }); }
      if (method === 'PATCH' && gitPath.indexOf('refs/heads/') === 0) {
        var commit = window.__gh.commits[body.sha];
        if (body.force || commit.parents[0] !== window.__gh.head) return reply(422, { message: 'Not a fast forward' });
        window.__gh.trees[commit.tree].forEach(function (entry) {
          window.__gh.files[entry.path] = { sha: entry.sha, text: window.__gh.blobs[entry.sha] };
        });
        window.__gh.head = body.sha;
        return reply(200, { object: { sha: body.sha } });
      }
    }

    var m = p.match(/^\\/repos\\/${owner}\\/${repo}\\/contents\\/(.+)$/);
    if (m) {
      var file = decodeURIComponent(m[1]);
      if (method === 'GET') {
        var f = window.__gh.files[file];
        if (!f) return reply(404, { message: 'Not Found' });
        return reply(200, { content: b64(f.text), sha: f.sha });
      }
      if (method === 'PUT') {
        var body = JSON.parse(opts.body);
        var known = window.__gh.files[file];
        if (known && body.sha !== known.sha) return reply(409, { message: 'sha mismatch' });
        var sha = file + '-sha-' + Date.now();
        window.__gh.files[file] = {
          sha: sha,
          text: file.endsWith('.json') ? new TextDecoder().decode(
            Uint8Array.from(atob(body.content), function (c) { return c.charCodeAt(0); })) : '(binary)',
        };
        return reply(200, { content: { sha: sha } });
      }
    }
    return reply(404, { message: 'unstubbed ' + p });
  };
}());
`;

const { proc, port } = await launch();
const page = await newPage(port);
await page.setViewport(1280, 900, false);
await page.preload(stub);
await page.goto(`${BASE}/admin/`);

console.log('\nLoads without a token');
{
  const r = await page.eval(`return {
    auth: !document.getElementById('pane-auth').hidden,
    work: !document.getElementById('pane-work').hidden,
    edit: !document.getElementById('pane-edit').hidden,
    calls: window.__gh.calls.length,
  };`);
  check('the sign-in pane is what an anonymous visitor gets',
    r.auth && !r.work && !r.edit, JSON.stringify(r));
  check('nothing is requested from GitHub before a token is given',
    r.calls === 0, `${r.calls} calls`);
  check('no console errors on load', page.problems().length === 0, page.problems().join(' | '));
}

console.log('\nThe page carries no credential of its own');
{
  const src = await (await fetch(`${BASE}/assets/admin.js`)).text();
  const doc = await (await fetch(`${BASE}/admin/`)).text();
  // A password compared in the browser would have to be in one of these two
  // files. The whole design rests on there being nothing here to find.
  const suspicious = /(?:github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}|["'](?:password|passcode|secret)["']\s*[:=]\s*["'][^"']+["']/i;
  check('the admin script contains no token or password', !suspicious.test(src),
    (src.match(suspicious) || [''])[0]);
  check('the admin page contains no token or password', !suspicious.test(doc),
    (doc.match(suspicious) || [''])[0]);
}

console.log('\nSigning in');
{
  const empty = await page.eval(`
    document.getElementById('auth-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { calls: window.__gh.calls.length, msg: document.getElementById('auth-msg').textContent };
  `);
  check('an empty token is refused without asking GitHub',
    empty.calls === 0 && /token/i.test(empty.msg), JSON.stringify(empty));

  await page.eval(`
    document.getElementById('token').value = 'github_pat_TESTTOKEN';
    document.getElementById('auth-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return 1;
  `);
  await page.eval(`return new Promise(r => setTimeout(r, 300));`);

  const after = await page.eval(`return {
    work: !document.getElementById('pane-work').hidden,
    who: document.getElementById('who-name').textContent,
    rows: document.querySelectorAll('#list .admin__row').length,
    count: document.getElementById('count').textContent,
    calls: window.__gh.calls.map(c => c.method + ' ' + new URL(c.url).pathname),
    authHeaders: window.__gh.calls.map(c => c.auth),
    urls: window.__gh.calls.map(c => c.url),
  };`);
  check('a valid token opens the workspace', after.work, JSON.stringify(after.who));
  check('the signed-in GitHub account is shown', /testuser/.test(after.who), after.who);
  check('permission is verified against the repository, not assumed',
    after.calls.includes(`GET /repos/${owner}/${repo}`), after.calls.join(', '));
  check('every product is listed', after.rows === products.length,
    `${after.rows} of ${products.length}`);
  check('the token travels in the Authorization header',
    after.authHeaders.every((h) => h === 'Bearer github_pat_TESTTOKEN'),
    JSON.stringify(after.authHeaders.slice(0, 2)));
  check('the token never appears in a URL',
    after.urls.every((u) => !u.includes('TESTTOKEN')), after.urls.join(' '));
  check('requests go to api.github.com and nowhere else',
    after.urls.every((u) => u.startsWith('https://api.github.com/')), after.urls.join(' '));
}

console.log('\nThe price book');
{
  // The rates are stripped out of every published page (PUBLIC_PRICES is
  // off), so this pane is the only place in the whole site they appear — and
  // only for a browser holding a token GitHub accepts.
  const priced = products.filter((p) => Number(p.pricePiece) > 0 && Number(p.priceCarton) > 0
    && /^\d+$/.test(String(p.packSize)));
  const sample = priced[0];
  const noCarton = products.find((p) => !(Number(p.priceCarton) > 0));
  const money = (n) => {
    const digits = String(Math.round(n));
    let head = digits.slice(0, -3);
    let out = digits.slice(-3);
    while (head.length > 2) { out = head.slice(-2) + ',' + out; head = head.slice(0, -2); }
    if (head) out = head + ',' + out;
    return 'Rs. ' + out;
  };

  const landing = await page.eval(`return {
    tab: document.querySelector('.admin__tab.is-active').id,
    open: !document.getElementById('view-prices').hidden,
    products: document.getElementById('view-products').hidden,
    rows: document.querySelectorAll('#price-list .pb').length,
    count: document.getElementById('price-count').textContent,
  };`);
  check('signing in lands on the price book, not the editor',
    landing.tab === 'tab-prices' && landing.open && landing.products,
    JSON.stringify(landing));
  check('every product is in the book', landing.rows === products.length,
    `${landing.rows} of ${products.length}`);
  check('and it says how many', landing.count === `${products.length} products`, landing.count);

  const row = await page.eval(`
    const li = document.querySelector('[data-price-id="${Number(sample.id)}"]');
    if (!li) return null;
    const slot = (k) => {
      const el = li.querySelector('.pb__rate--' + k);
      return el ? { money: (el.querySelector('.pb__money') || {}).textContent || '',
                    label: (el.querySelector('.pb__for') || {}).textContent || '' } : null;
    };
    return { piece: slot('piece'), carton: slot('carton'), total: slot('total') };
  `);
  check('a product shows what one loose piece costs',
    !!row && row.piece.money === money(sample.pricePiece),
    JSON.stringify(row && row.piece));
  check('and the lower rate a carton buys, said to be per piece',
    !!row && row.carton.money === money(sample.priceCarton)
      && /piece/i.test(row.carton.label) && /carton/i.test(row.carton.label),
    JSON.stringify(row && row.carton));
  // The mistake this exists to prevent: quoting a per-piece rate as if it
  // were what a whole carton costs.
  check('and works the full carton out, so nobody multiplies it by hand',
    !!row && row.total.money === money(sample.priceCarton * Number(sample.packSize)),
    `${row && row.total.money} — expected ${money(sample.priceCarton * Number(sample.packSize))}`);

  const bare = await page.eval(`
    const li = document.querySelector('[data-price-id="${Number(noCarton.id)}"]');
    if (!li) return null;
    return {
      carton: li.querySelector('.pb__rate--carton').textContent.trim(),
      total: li.querySelector('.pb__rate--total').textContent.trim(),
      note: (li.querySelector('.pb__note') || {}).textContent || '',
      piece: (li.querySelector('.pb__rate--piece .pb__money') || {}).textContent || '',
    };
  `);
  check('a product with no carton rate shows no carton figure at all',
    !!bare && bare.carton === '' && bare.total === '', JSON.stringify(bare));
  check('and says so, rather than leaving a blank to guess at',
    !!bare && /no carton rate/i.test(bare.note), bare && bare.note);
  check('its piece rate is still there', !!bare && bare.piece === money(noCarton.pricePiece),
    bare && bare.piece);

  const found = await page.eval(`
    const f = document.getElementById('price-find');
    const run = (term) => {
      f.value = term;
      f.dispatchEvent(new Event('input', { bubbles: true }));
      return [...document.querySelectorAll('#price-list .pb')]
        .map((li) => li.getAttribute('data-price-id'));
    };
    const out = {
      sku: run(${JSON.stringify(String(sample.sku || ''))}),
      brand: run(${JSON.stringify(String(sample.brand || ''))}),
      nowhere: run('zzzznotathing').filter(Boolean),
    };
    // The empty state is a .pb too, so it is read before the search is
    // cleared and counted apart from the rows it stands in for.
    out.saidSo = !!document.querySelector('#price-list .pb--empty');
    f.value = '';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    out.empty = document.querySelectorAll('#price-list .pb').length;
    return out;
  `);
  check('searching a model number finds it',
    found.sku.includes(String(sample.id)), found.sku.join(','));
  check('searching a brand finds it', found.brand.includes(String(sample.id)),
    found.brand.slice(0, 5).join(','));
  check('a term that matches nothing says so instead of showing an empty page',
    found.nowhere.length === 0 && found.saidSo,
    `${found.nowhere.length} rows, empty state ${found.saidSo}`);
  check('clearing the search brings the whole book back',
    found.empty === products.length, String(found.empty));

  const copied = await page.eval(`
    window.__copied.length = 0;
    const li = document.querySelector('[data-price-id="${Number(sample.id)}"]');
    li.querySelector('[data-price-copy]').click();
    await new Promise((r) => setTimeout(r, 60));
    return { text: window.__copied[0] || '', label: li.querySelector('[data-price-copy]').textContent };
  `);
  check('"Copy reply" puts a sendable line on the clipboard',
    copied.text.includes(sample.name) && copied.text.includes(money(sample.pricePiece))
      && copied.text.includes(money(sample.priceCarton)),
    JSON.stringify(copied.text));
  check('and the button says it did', /copied/i.test(copied.label), copied.label);

  const kept = await page.eval(`
    const raw = localStorage.getItem('pk-price-book');
    const saved = raw ? JSON.parse(raw) : null;
    return { rows: saved ? saved.rows.length : 0, at: saved ? !!saved.at : false };
  `);
  // Bad signal at the counter is exactly when a rate is asked for.
  check('the rates are kept on this device so the book answers offline',
    kept.rows === products.length && kept.at, JSON.stringify(kept));

  const doc = await (await fetch(`${BASE}/admin/`)).text();
  const js = await (await fetch(`${BASE}/assets/admin.js`)).text();
  check('no rate is baked into the page or its script — they come from GitHub',
    !doc.includes(sample.name) && !js.includes(sample.name)
      && !doc.includes(String(sample.pricePiece) + '"'),
    'a price or product name was served with the page');
}

console.log('\nA price sheet to send someone');
{
  // The point of this pane: a trusted buyer gets a document, not an account.
  const money = (n) => {
    const digits = String(Math.round(n));
    let head = digits.slice(0, -3);
    let out = digits.slice(-3);
    while (head.length > 2) { out = head.slice(-2) + ',' + out; head = head.slice(0, -2); }
    if (head) out = head + ',' + out;
    return 'Rs. ' + out;
  };
  const priced = products.filter((p) => Number(p.pricePiece) > 0 && Number(p.priceCarton) > 0
    && /^\d+$/.test(String(p.packSize)));
  const sample = priced[0];
  const longSku = products.find((p) => String(p.sku || '').length > 24);
  const catOf = sample.category;
  const inCat = products.filter((p) => p.category === catOf).length;

  const opened = await page.eval(`
    document.getElementById('sheet-open').click();
    await new Promise((r) => setTimeout(r, 120));
    return {
      pane: !document.getElementById('pane-sheet').hidden,
      rows: document.querySelectorAll('#sheet-list .sp').length,
      ticked: [...document.querySelectorAll('[data-sheet-pick]')].filter((b) => b.checked).length,
      count: document.getElementById('sheet-count').textContent,
      prices: document.getElementById('sheet-prices').checked,
      photos: document.getElementById('sheet-photos').checked,
    };
  `);
  check('the sheet builder opens from the price book', opened.pane, JSON.stringify(opened).slice(0, 120));
  check('with every product ticked, because sending the lot is the common case',
    opened.ticked === products.length && opened.rows === products.length,
    `${opened.ticked} ticked of ${opened.rows}`);
  check('and the rates and photos in by default',
    opened.prices && opened.photos, JSON.stringify(opened));

  const scoped = await page.eval(`
    document.getElementById('sheet-none').click();
    const sel = document.getElementById('sheet-category');
    sel.value = ${JSON.stringify(catOf)};
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const shown = document.querySelectorAll('#sheet-list .sp').length;
    document.getElementById('sheet-all').click();
    return { shown, count: document.getElementById('sheet-count').textContent };
  `);
  check('a category can be picked out on its own', scoped.shown === inCat,
    `${scoped.shown} of ${inCat}`);
  check('and ticking what is shown ticks only those',
    scoped.count.indexOf(`${inCat} products ticked`) === 0, scoped.count);

  const made = await page.eval(`
    document.getElementById('sheet-for').value = 'Ram Traders, Birgunj';
    document.getElementById('sheet-valid').value = '15 Kartik 2082';
    document.getElementById('sheet-note').value = 'Stock confirmed on the day of order.';
    document.getElementById('sheet-make').click();
    await new Promise((r) => setTimeout(r, 200));
    const s = document.getElementById('sheet');
    const item = s.querySelector('[class="sheet__item"], .sheet__item');
    return {
      print: !document.getElementById('pane-print').hidden,
      items: s.querySelectorAll('.sheet__item').length,
      bands: [...s.querySelectorAll('.sheet__cat')].map((h) => h.textContent),
      title: (s.querySelector('h1') || {}).textContent || '',
      who: (s.querySelector('.sheet__for') || {}).textContent || '',
      when: (s.querySelector('.sheet__when') || {}).textContent || '',
      note: (s.querySelector('.sheet__note') || {}).textContent || '',
      running: (s.querySelector('.sheet__running') || {}).textContent || '',
      editable: [...s.querySelectorAll('[contenteditable="true"]')].length,
      text: s.textContent,
    };
  `);
  check('the preview holds exactly the products that were ticked',
    made.print && made.items === inCat, `${made.items} of ${inCat}`);
  check('grouped under their category, not in one run',
    made.bands.length === 1 && made.bands[0] === catOf, made.bands.join(','));
  check('it is titled as a price list when the rates are in',
    /price list/i.test(made.title), made.title);
  check('it names the buyer it was written for', made.who === 'Prepared for Ram Traders, Birgunj', made.who);
  check('and carries the date, the count and how long the rates hold',
    /Issued /.test(made.when) && made.when.includes(`${inCat} products`)
      && /15 Kartik 2082/.test(made.when), made.when);
  check('your own line is printed as you typed it',
    made.note === 'Stock confirmed on the day of order.', made.note);
  // A sheet gets forwarded. It should still say who it was sent to.
  check('the buyer is named again along the foot, which prints on every page',
    made.running.includes('Ram Traders, Birgunj'), made.running);
  check('and the lines that are your own words can be re-typed on the preview',
    made.editable >= 3, String(made.editable));
  check('a carton total is the carton rate times the pieces in a carton',
    made.text.includes(money(sample.priceCarton * Number(sample.packSize))),
    `expected ${money(sample.priceCarton * Number(sample.packSize))}`);
  if (longSku && longSku.category === catOf) {
    check('a model number that is really the whole product name is left off',
      !made.text.includes('Model ' + longSku.sku), longSku.sku);
  }

  const noPrices = await page.eval(`
    document.getElementById('print-back').click();
    document.getElementById('sheet-prices').checked = false;
    document.getElementById('sheet-photos').checked = false;
    document.getElementById('sheet-make').click();
    await new Promise((r) => setTimeout(r, 200));
    const s = document.getElementById('sheet');
    return {
      title: (s.querySelector('h1') || {}).textContent || '',
      rates: s.querySelectorAll('.sheet__rate').length,
      shots: s.querySelectorAll('.sheet__shot').length,
      items: s.querySelectorAll('.sheet__item').length,
      rupees: /Rs\\./.test(s.textContent),
    };
  `);
  // The same builder makes the thing you send a buyer you do not quote to.
  check('with the rates off it is a picture catalogue, not a price list',
    /product list/i.test(noPrices.title) && noPrices.rates === 0 && !noPrices.rupees,
    JSON.stringify(noPrices));
  check('the products are all still there', noPrices.items === inCat, String(noPrices.items));
  check('and with the photos off there are no images to send',
    noPrices.shots === 0, String(noPrices.shots));

  await page.send('Emulation.setEmulatedMedia', { media: 'print' });
  const printed = await page.eval(`
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const gone = (sel) => {
      const el = document.querySelector(sel);
      return !el || getComputedStyle(el).display === 'none';
    };
    return {
      bar: gone('.admin__bar'),
      printbar: gone('.printbar'),
      work: gone('#pane-work'),
      sheet: getComputedStyle(document.getElementById('sheet')).display,
      footFixed: getComputedStyle(document.querySelector('.sheet__running')).position,
    };
  `);
  await page.send('Emulation.setEmulatedMedia', { media: '' });
  check('on paper the panel itself does not print — only the sheet',
    printed.bar && printed.printbar && printed.work && printed.sheet !== 'none',
    JSON.stringify(printed));
  check('and the foot is fixed, so it repeats on every page',
    printed.footFixed === 'fixed', printed.footFixed);

  await page.eval(`
    document.getElementById('print-back').click();
    document.getElementById('sheet-prices').checked = true;
    document.getElementById('sheet-photos').checked = true;
    document.getElementById('sheet-back').click();
    return 1;
  `);
}

console.log('\nWhat the browser prints around the edge');
{
  // Chrome puts the document title and the page address in the paper margins,
  // and no stylesheet can stop it — printed at zero margin it draws them over
  // the content instead. What they SAY is this page's to set, and a customer
  // should not be reading the name of an internal tool or a link to it.
  const before = await page.eval(`return {
    title: document.title,
    path: location.pathname,
  };`);
  check('off paper, the page is still the admin panel',
    /admin/i.test(before.title) && before.path === '/admin/', JSON.stringify(before));

  const printing = await page.eval(`
    window.dispatchEvent(new Event('beforeprint'));
    return { title: document.title, path: location.pathname };
  `);
  check('on paper the header reads as the business, not "Catalogue admin"',
    printing.title === siteConfig.businessName, printing.title);
  check('and the footer address carries no /admin',
    printing.path === '/' && !/admin/.test(printing.path), printing.path);

  const after = await page.eval(`
    window.dispatchEvent(new Event('afterprint'));
    return { title: document.title, path: location.pathname };
  `);
  check('and the panel is itself again once the print box closes',
    after.title === before.title && after.path === before.path, JSON.stringify(after));

  const tip = await page.eval(`
    const el = document.querySelector('.printbar__tip');
    return el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
  `);
  // The complete fix is a tick box only the person can reach.
  check('and the print bar says how to take them off altogether',
    /headers and footers/i.test(tip) && /more settings/i.test(tip), tip.slice(0, 80));
}

console.log('\nSearching and opening a product');
{
  const r = await page.eval(`
    document.getElementById('tab-products').click();
    const f = document.getElementById('filter');
    f.value = 'kisonli';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = document.querySelectorAll('#list .admin__row').length;
    document.querySelector('#list [data-edit]').click();
    return {
      shown,
      editing: !document.getElementById('pane-edit').hidden,
      name: document.getElementById('f-name').value,
      category: document.getElementById('f-category').value,
      categories: document.querySelectorAll('#f-category option').length,
      deleteShown: !document.getElementById('delete').hidden,
    };
  `);
  const expected = products.filter((p) => /kisonli/i.test(
    [p.name, p.brand, p.category, p.sku].join(' '))).length;
  check('the list filters', r.shown === expected, `${r.shown} of ${expected}`);
  check('a product opens in the form with its values', r.editing && r.name.length > 0, r.name);
  check('the category select offers every category',
    r.categories === categories.length, `${r.categories} of ${categories.length}`);
  check('an existing product can be deleted, a new one cannot', r.deleteShown === true);
}

console.log('\nValidation happens before anything is committed');
{
  const r = await page.eval(`
    const before = window.__gh.calls.length;
    document.getElementById('f-description').value = '';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('edit-msg').textContent };
  `);
  check('an empty description blocks the save', r.calls === 0 && /description/i.test(r.msg),
    JSON.stringify(r));

  const clash = await page.eval(`
    const before = window.__gh.calls.length;
    document.getElementById('f-description').value = 'Restored.';
    document.getElementById('f-slug').value = ${JSON.stringify(categories[0].slug)};
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('edit-msg').textContent };
  `);
  check('a web address that collides with a category page is refused',
    clash.calls === 0 && /category page/i.test(clash.msg), JSON.stringify(clash));
}

console.log('\nEvery field the build insists on');
{
  // The build refuses a product with an empty brand, and that refusal lands
  // after the commit: the panel says "Saved" and the site stops updating.
  // One product reached the live catalogue that way and stopped every deploy
  // until it was fixed by hand.
  const r = await page.eval(`
    document.getElementById('edit-back').click();
    document.getElementById('new-product').click();
    document.getElementById('f-name').value = 'A Speaker With No Brand On The Box';
    document.getElementById('f-brand').value = '';
    document.getElementById('f-description').value =
      'A speaker whose carton carries no brand mark anywhere on it at all.';
    const before = window.__gh.calls.length;
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('edit-msg').textContent };
  `);
  check('an empty brand is refused before committing', r.calls === 0, JSON.stringify(r));
  check('and the message offers the placeholder rather than a guess',
    /\[CONFIRM BRAND\]/.test(r.msg), r.msg);
}

console.log('\nA product that already exists');
{
  // Straight off what happened in practice: the same speaker typed in twice,
  // once as it is printed on the box and once with different spacing.
  const existing = products[0];
  const r = await page.eval(`
    document.getElementById('edit-back').click();
    document.getElementById('new-product').click();
    document.getElementById('f-name').value = ${JSON.stringify(existing.name.toUpperCase())};
    document.getElementById('f-description').value = 'A second copy of one we already list.';
    const before = window.__gh.calls.length;
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('edit-msg').textContent };
  `);
  check('a duplicate name is refused before anything is committed', r.calls === 0, JSON.stringify(r));
  check('and the message names the product that already exists',
    r.msg.includes(existing.name) && /already exists/i.test(r.msg), r.msg);

  const spaced = await page.eval(`
    document.getElementById('f-name').value = ${JSON.stringify('  ' + existing.name.replace(/\s+/g, '  ') + ' ')};
    const before = window.__gh.calls.length;
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('edit-msg').textContent };
  `);
  check('spacing and case do not get a duplicate past the check',
    spaced.calls === 0 && /already exists/i.test(spaced.msg), JSON.stringify(spaced));
}

console.log('\nPhotos');
{
  const r = await page.eval(`
    document.getElementById('edit-back').click();
    const row = document.querySelector('.admin__row');
    row.click();                                   // the whole row, not the button
    const open = !document.getElementById('pane-edit').hidden;
    const box = document.getElementById('f-image-drop');
    return {
      open: open,
      isLabel: box.tagName.toLowerCase() === 'label' && box.getAttribute('for') === 'f-image',
      accepts: document.getElementById('f-image').getAttribute('accept'),
    };
  `);
  check('clicking anywhere on a row opens that product', r.open === true);
  check('the photo box is itself the file picker', r.isLabel === true, JSON.stringify(r));
  check('the picker requests JPEG/PNG/WebP so Safari can convert phone photos',
    r.accepts === 'image/jpeg,image/png,image/webp', r.accepts);

  // A file the browser cannot decode, labelled as an iPhone photo. Chrome
  // cannot read HEIC, so this is the message a real one produces there.
  const heic = await page.eval(`
    const f = new File([new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99])],
                       'IMG_4021.HEIC', { type: 'image/heic' });
    const dt = new DataTransfer();
    dt.items.add(f);
    const input = document.getElementById('f-image');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return new Promise(function (done) {
      setTimeout(function () { done(document.getElementById('edit-msg').textContent); }, 400);
    });
  `);
  check('a HEIC photo Chrome cannot open says so, and how to fix it',
    /HEIC/.test(heic) && /Convert Image|Most Compatible/.test(heic), heic);

  // Dropping onto the box has to work as well as clicking it, and must not
  // navigate the page away from a half-filled form.
  const dropped = await page.eval(`
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(png), function (c) { return c.charCodeAt(0); });
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'photo.png', { type: 'image/png' }));
    const box = document.getElementById('f-image-drop');
    box.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    // Waited for, not slept on: a photo is decoded, scanned and re-encoded
    // before it reaches the strip, and how long that takes depends on the
    // machine running the test.
    //
    // Specifically the DROPPED one. The product open in the form already has
    // a photo in the strip, so "a thumbnail exists" is true on the first
    // frame and would pass while the drop was still being prepared.
    const dropped = () => [...document.querySelectorAll('#f-shots .shots__img')]
      .find((i) => i.src.startsWith('data:image/jpeg'));
    for (let i = 0; i < 60; i++) {
      if (dropped()) break;
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    return {
      msg: document.getElementById('edit-msg').textContent,
      shown: !!dropped(),
      here: location.pathname,
    };
  `);
  check('a photo dropped on the box is accepted', /Photo ready/i.test(dropped.msg), JSON.stringify(dropped));
  check('and is shown straight away, already redrawn as a tile', dropped.shown === true);
  check('dropping does not navigate away from the form', dropped.here === '/admin/', dropped.here);

  // The site publishes a minute behind the commit, so a just-saved photo 404s
  // for a while. That must not look like a failed upload.
  const missing = await page.eval(`
    document.getElementById('edit-back').click();
    const img = document.querySelector('.admin__thumb');
    img.dispatchEvent(new Event('error'));
    return { cls: img.className, src: img.getAttribute('src'), title: img.title };
  `);
  check('a photo that has not published yet shows a placeholder, not a broken icon',
    /is-missing/.test(missing.cls) && missing.src === null, JSON.stringify(missing));
  check('and says why', /publishing/i.test(missing.title || ''), missing.title);
}

console.log('\nSaving an edit');
{
  const r = await page.eval(`
    document.getElementById('edit-back').click();
    document.querySelector('#list [data-edit]').click();
    document.getElementById('f-packsize').value = '12 pcs per carton';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const put = window.__gh.calls.filter(c => c.method === 'PUT').pop();
    if (!put) return { blocked: document.getElementById('edit-msg').textContent };
    return {
      msg: document.getElementById('work-msg').textContent,
      onList: !document.getElementById('pane-work').hidden,
      path: new URL(put.url).pathname,
      branch: put.body.branch,
      sha: put.body.sha,
      message: put.body.message,
      saved: JSON.parse(new TextDecoder().decode(
        Uint8Array.from(atob(put.body.content), c => c.charCodeAt(0)))),
    };
  `);
  check('the save was not blocked', !r.blocked, r.blocked || '');
  check('the save writes data/products.json',
    r.path === `/repos/${owner}/${repo}/contents/data/products.json`, r.path);
  check('the save targets the configured branch', r.branch === branch, r.branch);
  check('the save carries the sha it read, so a concurrent edit cannot be clobbered',
    r.sha === 'products-sha-1', r.sha);
  check('the commit message names the product', /Update /.test(r.message), r.message);
  check('the committed file is the whole catalogue, not a fragment',
    Array.isArray(r.saved) && r.saved.length === products.length,
    `${r.saved && r.saved.length}`);
  check('the edited field is in the committed file',
    r.saved.some((p) => p.packSize === '12 pcs per carton'));
  const edited = r.saved.find((p) => p.packSize === '12 pcs per carton');
  const others = r.saved.filter((p) => p.id !== edited.id);
  check('every other product is byte-identical to before the save',
    JSON.stringify(others)
      === JSON.stringify(products.filter((p) => p.id !== edited.id)));
  check('the editor returns to the list and says what happens next',
    r.onList && /minute/i.test(r.msg), r.msg);
}

console.log('\nA second save uses the new sha');
{
  const r = await page.eval(`
    document.querySelector('#list [data-edit]').click();
    document.getElementById('f-sku').value = 'EDITED-SKU';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const put = window.__gh.calls.filter(c => c.method === 'PUT').pop();
    return { sha: put.body.sha, msg: document.getElementById('work-msg').textContent };
  `);
  check('the sha advances after a save rather than going stale',
    r.sha !== 'products-sha-1' && /data\/products\.json-sha-/.test(r.sha), r.sha);
  check('the second save succeeds', /Saved/i.test(r.msg), r.msg);
}

console.log('\nPrices');
{
  const r = await page.eval(`
    document.getElementById('edit-back').click();
    document.querySelector('#list [data-edit]').click();
    document.getElementById('f-price-carton').value = '12500';
    document.getElementById('f-price-piece').value = '650';
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const put = window.__gh.calls.filter(c => c.method === 'PUT').pop();
    const saved = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(put.body.content), c => c.charCodeAt(0))));
    return { edited: saved.find(p => p.priceCarton === 12500) || null,
             msg: document.getElementById('work-msg').textContent };
  `);
  check('both prices are saved as numbers, not text',
    r.edited && r.edited.priceCarton === 12500 && r.edited.pricePiece === 650,
    JSON.stringify(r.edited && { c: r.edited.priceCarton, p: r.edited.pricePiece }));

  const junk = await page.eval(`
    document.querySelector('#list [data-edit]').click();
    const out = {};
    for (const bad of ['0', '-5', 'abc', '0.4', '']) {
      document.getElementById('f-price-carton').value = bad;
      document.getElementById('f-price-piece').value = '650';
      document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const put = window.__gh.calls.filter(c => c.method === 'PUT').pop();
      const saved = JSON.parse(new TextDecoder().decode(
        Uint8Array.from(atob(put.body.content), c => c.charCodeAt(0))));
      out[bad || '(empty)'] = saved.find(p => p.pricePiece === 650).priceCarton;
      document.querySelector('#list [data-edit]').click();
    }
    document.getElementById('edit-back').click();
    return out;
  `);
  // "Rs. 0" on a live product is a quote nobody gave; anything that is not a
  // usable number has to land as "price on enquiry" instead.
  check('zero, negative, non-numeric and sub-rupee prices save as no price',
    ['0', '-5', 'abc', '0.4', '(empty)'].every((k) => junk[k] === ''),
    JSON.stringify(junk));
}

console.log('\nSaving a product nobody changed');
{
  const r = await page.eval(`
    document.querySelector('#list [data-edit]').click();
    const before = window.__gh.calls.filter(c => c.method === 'PUT').length;
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return {
      puts: window.__gh.calls.filter(c => c.method === 'PUT').length - before,
      msg: document.getElementById('work-msg').textContent,
    };
  `);
  check('an unchanged product is not committed at all', r.puts === 0, JSON.stringify(r));
  check('and the panel says why nothing happened',
    /nothing changed/i.test(r.msg), r.msg);
}

console.log('\nSomeone else saving first');
{
  const r = await page.eval(`
    document.querySelector('#list [data-edit]').click();
    document.getElementById('f-sku').value = 'CONFLICT-SKU';
    window.__gh.nextStatus = 409;
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    return {
      msg: document.getElementById('edit-msg').textContent + ' '
         + document.getElementById('work-msg').textContent,
      products: window.__gh.files['data/products.json'].text.length > 0,
    };
  `);
  check('a conflicting save is reported rather than forced',
    /someone else/i.test(r.msg), r.msg);
  check('the catalogue on GitHub is left intact after a conflict', r.products);
}

console.log('\nCategories');
{
  const held = await page.eval(`
    document.getElementById('tab-categories').click();
    const rows = document.querySelectorAll('#cat-list .admin__row').length;
    const before = window.__gh.calls.length;
    document.querySelector('[data-cat-del]').click();
    return { rows, calls: window.__gh.calls.length - before,
             msg: document.getElementById('work-msg').textContent };
  `);
  check('every category is listed', held.rows === categories.length,
    `${held.rows} of ${categories.length}`);
  check('a category holding products cannot be deleted',
    held.calls === 0 && /move them/i.test(held.msg), JSON.stringify(held));

  const renamed = await page.eval(`
    window.prompt = (label, value) => label.toLowerCase().indexOf('description') === 0
      ? 'Renamed for the test.' : 'Loudspeakers';
    document.querySelector('[data-cat-edit="Speakers"]').click();
    await new Promise(r => setTimeout(r, 400));
    const tree = window.__gh.calls.filter(c => c.url.endsWith('/git/trees')).slice(-1)[0];
    return {
      paths: tree.body.tree.map(entry => entry.path),
      cats: JSON.parse(window.__gh.files['data/categories.json'].text),
      prods: JSON.parse(window.__gh.files['data/products.json'].text),
    };
  `);
  check('a rename writes both the categories and the products',
    renamed.paths.join(',') === 'data/categories.json,data/products.json',
    renamed.paths.join(','));
  check('the renamed category gets a new slug',
    renamed.cats.some((c) => c.name === 'Loudspeakers' && c.slug === 'loudspeakers'),
    JSON.stringify(renamed.cats.find((c) => c.name === 'Loudspeakers')));
  check('no product is left pointing at the old category name',
    renamed.prods.every((p) => p.category !== 'Speakers')
    && renamed.prods.some((p) => p.category === 'Loudspeakers'));
}

console.log('\nWhat the build demands of a description');
{
  const r = await page.eval(`
    document.getElementById('edit-back').click();
    document.getElementById('new-product').click();
    document.getElementById('f-name').value = 'A Speaker Nobody Has Listed Yet';
    document.getElementById('f-description').value = 'Too short.';
    const before = window.__gh.calls.length;
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('edit-msg').textContent };
  `);
  // check.js rejects a page whose meta description is 40 characters or fewer,
  // and that rejection lands after the commit, where it silently stops the
  // site updating. It has to be caught here instead.
  check('a description the build would reject is refused before committing',
    r.calls === 0 && /40 characters/.test(r.msg), JSON.stringify(r));

  const dupe = await page.eval(`
    document.getElementById('f-description').value = ${JSON.stringify(products[0].description)};
    const before = window.__gh.calls.length;
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('edit-msg').textContent };
  `);
  check('a description copied from another product is refused, and names it',
    dupe.calls === 0 && dupe.msg.includes(products[0].name), JSON.stringify(dupe));
}

console.log('\nA new category, without leaving the product');
{
  const made = await page.eval(`
    window.prompt = (function () {
      const answers = ['Trolley Speakers',
        'Wheeled party speakers with a handle, a microphone and a rechargeable battery.'];
      let i = 0;
      return function () { return answers[i++]; };
    }());
    const before = window.__gh.calls.length;
    document.getElementById('f-category-new').click();
    const sel = document.getElementById('f-category');
    return {
      calls: window.__gh.calls.length - before,
      value: sel.value,
      listed: [...sel.options].map(o => o.value).includes('Trolley Speakers'),
      msg: document.getElementById('edit-msg').textContent,
    };
  `);
  check('a category added in the form appears and is selected',
    made.listed && made.value === 'Trolley Speakers', JSON.stringify(made));
  check('nothing is committed for it yet', made.calls === 0, `${made.calls} calls`);
  check('and the form says when it will be created',
    /when you save/i.test(made.msg), made.msg);

  const saved = await page.eval(`
    document.getElementById('f-brand').value = '[CONFIRM BRAND]';
    document.getElementById('f-description').value =
      'A wheeled trolley speaker with a microphone, tested only as far as the box states.';
    // A product without a photo is refused, which would make this measure
    // nothing at all.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'trolley.png', { type: 'image/png' }));
    document.getElementById('f-image-drop').dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 400));
    const before = window.__gh.calls.length;
    document.getElementById('edit-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return new Promise(function (done) {
      setTimeout(function () {
        const writes = window.__gh.calls.slice(before).filter(c => c.method === 'PUT');
        done({
          paths: writes.map(c => c.url.split('/contents/')[1].split('?')[0]),
          messages: writes.map(c => c.body.message),
          msg: document.getElementById('edit-msg').textContent
               + ' / ' + document.getElementById('work-msg').textContent,
          categories: JSON.parse(atob(
            (writes.find(c => c.url.includes('categories.json')) || { body: { content: btoa('[]') } }).body.content
          )).map(c => c.name),
        });
      }, 900);
    });
  `);
  check('the category file is written before the catalogue',
    saved.paths.indexOf('data/categories.json') === 0
    && saved.paths.indexOf('data/products.json') === saved.paths.length - 1,
    `${saved.paths.join(' → ')} :: ${saved.msg}`);
  check('the new category is in what was written',
    saved.categories.includes('Trolley Speakers'), saved.categories.join(', '));
}

console.log('\nAdding many products at once');
{
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const staged = await page.eval(`
    document.getElementById('bulk-open').click();
    const bytes = Uint8Array.from(atob(${JSON.stringify(png)}), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'Kisonli_K33-portable_speaker.png', { type: 'image/png' }));
    dt.items.add(new File([bytes], 'IMG_LP V90 trolley.png', { type: 'image/png' }));
    const box = document.getElementById('bulk-drop');
    box.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return new Promise(function (done) {
      setTimeout(function () {
        done({
          rows: document.querySelectorAll('.bulk__row').length,
          names: [...document.querySelectorAll('[data-bk="name"]')].map(i => i.value),
          thumbs: [...document.querySelectorAll('.bulk__thumb')].map(i => i.src.slice(0, 15)),
          bulkPane: !document.getElementById('pane-bulk').hidden,
        });
      }, 700);
    });
  `);
  check('dropped photos become one row each', staged.rows === 2, JSON.stringify(staged));
  check('each row is named from its file, with the noise stripped',
    staged.names[0] === 'Kisonli K33 portable speaker' && staged.names[1] === 'LP V90 trolley',
    staged.names.join(' | '));
  check('each row shows its photo, already redrawn as a tile',
    staged.thumbs.every(t => t === 'data:image/jpeg'), staged.thumbs.join(', '));

  const incomplete = await page.eval(`
    const before = window.__gh.calls.length;
    document.getElementById('bulk-save').click();
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('bulk-msg').textContent };
  `);
  check('rows missing a category and description commit nothing',
    incomplete.calls === 0 && /not ready/.test(incomplete.msg), JSON.stringify(incomplete));

  // The failure mode particular to bulk entry: the same sentence in both.
  const shared = await page.eval(`
    // Read the category off the page: an earlier block in this file renames
    // one, so the names in data/categories.json are no longer what is live.
    const cat = document.getElementById('bulk-category').options[1].value;
    document.querySelectorAll('[data-bk="category"]').forEach(s => { s.value = cat; });
    document.querySelectorAll('[data-bk="description"]').forEach(t => {
      t.value = 'A portable speaker with a rechargeable battery, exactly as the carton states.';
    });
    const before = window.__gh.calls.length;
    document.getElementById('bulk-save').click();
    return { calls: window.__gh.calls.length - before, msg: document.getElementById('bulk-msg').textContent };
  `);
  check('two rows sharing one description are caught before committing',
    shared.calls === 0 && /description/i.test(shared.msg), JSON.stringify(shared));

  const done = await page.eval(`
    // However many products the stub holds by now — earlier blocks in this
    // file have added some, and hard-coding the number here measured those
    // instead of these.
    const startedWith = JSON.parse(window.__gh.files['data/products.json'].text).length;
    const descs = [
      'A portable Bluetooth speaker with a rechargeable battery, as the carton states.',
      'A wheeled trolley speaker supplied with one microphone, as the carton states.',
    ];
    document.querySelectorAll('[data-bk="description"]').forEach((t, i) => { t.value = descs[i]; });
    const before = window.__gh.calls.length;
    document.getElementById('bulk-save').click();
    return new Promise(function (resolve) {
      setTimeout(function () {
        const writes = window.__gh.calls.slice(before).filter(c => c.method === 'PUT');
        const cat = writes.find(c => c.url.includes('products.json'));
        const saved = cat ? JSON.parse(atob(cat.body.content)) : [];
        resolve({
          paths: writes.map(c => c.url.split('/contents/')[1].split('?')[0]),
          added: saved.length - startedWith,
          last2: saved.slice(-2).map(p => ({ name: p.name, image: p.image, category: p.category })),
          ids: saved.slice(-2).map(p => p.id),
          msg: document.getElementById('work-msg').textContent,
          bulkMsg: document.getElementById('bulk-msg').textContent,
          rowsLeft: document.querySelectorAll('.bulk__row').length,
        });
      }, 1200);
    });
  `);
  check('both photos are uploaded, then the catalogue once',
    done.paths.filter(p => p.startsWith('public/images/')).length === 2
    && done.paths[done.paths.length - 1] === 'data/products.json',
    `${done.paths.join(' → ')} :: ${done.bulkMsg}`);
  check('both products are added in that single catalogue write',
    done.added === 2, `${done.added} added`);
  check('each points at its own photo',
    done.last2[0].image !== done.last2[1].image
    && done.last2.every(p => /^\/images\/products\/.+\.jpg$/.test(p.image)),
    JSON.stringify(done.last2));
  check('they get distinct ids', done.ids[0] !== done.ids[1], done.ids.join(','));
  check('the pane empties and says how many were saved',
    done.rowsLeft === 0 && /2 products saved/.test(done.msg), JSON.stringify(done));
}

console.log('\nReading what is printed on the box');
{
  // The vision provider is stubbed the same way GitHub is: the panel's own
  // fetch is intercepted, so these assert the exact request sent to the model
  // and the exact handling of what comes back — with no key and no network.
  await page.eval(`
    window.__vision = { calls: [], reply: null, status: 200 };
    const realFetch = window.fetch;
    window.fetch = function (url, opts) {
      const u = String(url);
      if (/anthropic|googleapis|openai/.test(u)) {
        window.__vision.calls.push({ url: u, opts: opts, body: JSON.parse(opts.body) });
        return Promise.resolve({
          ok: window.__vision.status < 300,
          status: window.__vision.status,
          json: () => Promise.resolve(window.__vision.reply),
        });
      }
      return realFetch(url, opts);
    };
    return 1;
  `);

  const off = await page.eval(`
    document.getElementById('edit-back') && document.getElementById('edit-back').click();
    document.getElementById('bulk-open').click();
    return {
      summary: document.getElementById('vision-summary').textContent,
      readButtonHidden: document.getElementById('f-read').hidden,
    };
  `);
  check('with no key set up, the panel says so and offers no read button',
    /not set up/.test(off.summary) && off.readButtonHidden === true, JSON.stringify(off));

  const saved = await page.eval(`
    document.getElementById('vision-provider').value = 'anthropic';
    document.getElementById('vision-provider').dispatchEvent(new Event('change', { bubbles: true }));
    const model = document.getElementById('vision-model').value;
    document.getElementById('vision-key').value = 'test-key-123';
    document.getElementById('vision-save').click();
    return {
      model: model,
      summary: document.getElementById('vision-summary').textContent,
      // The key must be in this browser and nowhere else.
      stored: localStorage.getItem('pk-vision-key'),
      keyFieldCleared: document.getElementById('vision-key').value,
    };
  `);
  check('picking a provider fills in a current model id by default',
    saved.model === 'claude-opus-5', saved.model);
  check('saving a key switches reading on', /on, using Claude/.test(saved.summary), saved.summary);
  check('the key is kept in this browser only',
    saved.stored === 'test-key-123' && saved.keyFieldCleared === '', JSON.stringify(saved));

  const src = await (await fetch(`${BASE}/assets/admin.js`)).text();
  check('no API key of any kind is in the shipped script',
    !/sk-ant-[A-Za-z0-9]|sk-proj-[A-Za-z0-9]|AIza[0-9A-Za-z_-]{10}/.test(src));

  // Dropping photos with reading switched on.
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const read = await page.eval(`
    window.__vision.reply = { content: [{ type: 'text', text: JSON.stringify({
      name: 'Kisonli K33 Portable Speaker',
      brand: 'Kisonli',
      sku: 'K-33',
      packSize: '40 pcs per carton',
      description: 'Bluetooth 5.3 portable speaker, 1200mAh battery, 5W output, TF card and AUX input as printed on the carton.',
    }) }] };
    const bytes = Uint8Array.from(atob(${JSON.stringify(png)}), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'IMG_2201.png', { type: 'image/png' }));
    document.getElementById('bulk-drop').dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return new Promise(function (done) {
      setTimeout(function () {
        const call = window.__vision.calls[0] || {};
        const row = document.querySelector('.bulk__row');
        done({
          url: call.url,
          headers: call.opts ? call.opts.headers : {},
          model: call.body ? call.body.model : '',
          prompt: call.body ? call.body.messages[0].content.find(c => c.type === 'text').text : '',
          imageBytes: call.body
            ? call.body.messages[0].content.find(c => c.type === 'image').source.data.length : 0,
          tileBytes: row.querySelector('.bulk__thumb').src.length,
          name: row.querySelector('[data-bk="name"]').value,
          brand: row.querySelector('[data-bk="brand"]').value,
          sku: row.querySelector('[data-bk="sku"]').value,
          packSize: row.querySelector('[data-bk="packSize"]').value,
          description: row.querySelector('[data-bk="description"]').value.slice(0, 30),
          marked: [...row.querySelectorAll('[data-suggested]')].map(e => e.getAttribute('data-suggested')).sort(),
          note: (row.querySelector('.bulk__note') || {}).textContent || '',
        });
      }, 1200);
    });
  `);
  check('the photo goes to the provider the key was saved for',
    /api\.anthropic\.com/.test(read.url), read.url);
  check('the browser-access header Anthropic requires is sent',
    read.headers['anthropic-dangerous-direct-browser-access'] === 'true',
    JSON.stringify(read.headers));
  check('the key travels in a header, never in the URL',
    read.headers['x-api-key'] === 'test-key-123' && !read.url.includes('test-key-123'),
    read.url);

  // §36 lives or dies on this prompt.
  check('the prompt forbids guessing and demands null for anything illegible',
    /Never guess/.test(read.prompt) && /null/.test(read.prompt)
    && /does not say it/.test(read.prompt), read.prompt.slice(0, 120));
  check('the prompt forbids using outside knowledge of the product',
    /know\s+about this product from elsewhere/.test(read.prompt), read.prompt.slice(0, 200));

  // A 600x600 tile loses the small print, so the reader gets its own, larger
  // rendering. Measured in pixels on a photo-shaped image, because on the 1x1
  // used above both renderings are dominated by the tile's white ground.
  const sized = await page.eval(`
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 800;
    const g = c.getContext('2d');
    g.fillStyle = '#ccc'; g.fillRect(0, 0, 1200, 800);
    g.fillStyle = '#000'; g.font = '40px sans-serif';
    g.fillText('MODEL K-33', 60, 300);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'carton.png', { type: 'image/png' }));
    document.getElementById('bulk-drop').dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 1200));

    const call = window.__vision.calls[window.__vision.calls.length - 1];
    const sent = call.body.messages[0].content.find(c => c.type === 'image').source.data;
    const rows = document.querySelectorAll('.bulk__row');
    const tileSrc = rows[rows.length - 1].querySelector('.bulk__thumb').src;
    const measure = (src) => new Promise(res => {
      const im = new Image();
      im.onload = () => res({ w: im.width, h: im.height });
      im.src = src;
    });
    return {
      sent: await measure('data:image/jpeg;base64,' + sent),
      tile: await measure(tileSrc),
    };
  `);
  check('the catalogue tile is still the square 600px one',
    sized.tile.w === 600 && sized.tile.h === 600, JSON.stringify(sized.tile));
  check('but the model is sent a bigger image, at the photo\'s own shape',
    sized.sent.w === 1200 && sized.sent.h === 800, JSON.stringify(sized.sent));

  check('what was legible is filled in', read.name === 'Kisonli K33 Portable Speaker'
    && read.brand === 'Kisonli' && read.sku === 'K-33'
    && read.packSize === '40 pcs per carton', JSON.stringify(read));
  check('every filled field is marked as unchecked',
    read.marked.join(',') === 'brand,description,name,packSize,sku', read.marked.join(','));
  check('and the row says to check it against the box',
    /Check it against the box/.test(read.note), read.note);

  // The other half of §36: a model that cannot read the box must say nothing.
  const blank = await page.eval(`
    window.__vision.reply = { content: [{ type: 'text', text: JSON.stringify({
      name: 'Portable Bluetooth Speaker',
      brand: null, sku: 'N/A', packSize: 'not visible', description: null,
    }) }] };
    document.querySelectorAll('[data-bk-read]')[0].click();
    return new Promise(function (done) {
      setTimeout(function () {
        const row = document.querySelector('.bulk__row');
        done({
          brand: row.querySelector('[data-bk="brand"]').value,
          sku: row.querySelector('[data-bk="sku"]').value,
          packSize: row.querySelector('[data-bk="packSize"]').value,
        });
      }, 900);
    });
  `);
  check('null, "N/A" and "not visible" are all left blank, never written in',
    blank.brand === 'Kisonli' && blank.sku === 'K-33' && blank.packSize === '40 pcs per carton',
    JSON.stringify(blank));

  const errored = await page.eval(`
    window.__vision.status = 401;
    window.__vision.reply = { error: { message: 'invalid x-api-key' } };
    document.querySelectorAll('[data-bk-read]')[0].click();
    return new Promise(function (done) {
      setTimeout(function () { done(document.getElementById('bulk-msg').textContent); }, 900);
    });
  `);
  check('a refused key is reported in words, not swallowed',
    /refused/.test(errored) && /invalid x-api-key/.test(errored), errored);

  // The other two providers, so a wrong URL or a key in the query string
  // cannot ship unnoticed.
  const others = await page.eval(`
    const out = {};
    for (const provider of ['gemini', 'openai']) {
      localStorage.setItem('pk-vision-provider', provider);
      localStorage.setItem('pk-vision-model', '');
      localStorage.setItem('pk-vision-key', 'KEY-' + provider);
      window.__vision.calls.length = 0;
      window.__vision.reply = provider === 'gemini'
        ? { candidates: [{ content: { parts: [{ text: '{\"sku\":\"G-1\"}' }] } }] }
        : { choices: [{ message: { content: '{\"sku\":\"O-1\"}' } }] };
      document.querySelectorAll('[data-bk-read]')[0].click();
      await new Promise(r => setTimeout(r, 900));
      const call = window.__vision.calls[0] || {};
      out[provider] = {
        url: call.url,
        headers: call.opts ? call.opts.headers : {},
        model: call.body ? call.body.model : '',
        keyInUrl: (call.url || '').includes('KEY-' + provider),
      };
    }
    return out;
  `);
  check('Gemini is called on its own endpoint with the key in a header',
    /generativelanguage\.googleapis\.com/.test(others.gemini.url)
    && others.gemini.headers['x-goog-api-key'] === 'KEY-gemini'
    && others.gemini.keyInUrl === false,
    JSON.stringify(others.gemini));
  check('OpenAI is called with a bearer token, not a key in the URL',
    /api\.openai\.com/.test(others.openai.url)
    && others.openai.headers.Authorization === 'Bearer KEY-openai'
    && others.openai.keyInUrl === false,
    JSON.stringify(others.openai));

  const forgotten = await page.eval(`
    window.__vision.status = 200;
    document.getElementById('vision-forget').click();
    return {
      stored: localStorage.getItem('pk-vision-key'),
      provider: localStorage.getItem('pk-vision-provider'),
      summary: document.getElementById('vision-summary').textContent,
      readButtons: document.querySelectorAll('[data-bk-read]').length,
    };
  `);
  check('"Forget" deletes the key and switches reading back off',
    forgotten.stored === null && forgotten.provider === null
    && /not set up/.test(forgotten.summary) && forgotten.readButtons === 0,
    JSON.stringify(forgotten));

  await page.eval(`
    state = null;
    document.getElementById('bulk-clear') && (window.confirm = () => true);
    document.getElementById('bulk-clear').click();
    return 1;
  `);
}

console.log('\nSeveral photos on one product');
{
  // The product page has rendered a gallery since long before anything could
  // fill it: `image` is the main photo, `gallery` the rest. This is what fills
  // them, so what reaches the commit is what matters.
  const tile = (n) => `(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    const g = c.getContext('2d');
    g.fillStyle = ['#c00', '#0a0', '#00c'][${n} % 3];
    g.fillRect(0, 0, 40, 40);
    return new Promise((done) => c.toBlob((b) =>
      done(new File([b], 'shot-${n}.jpg', { type: 'image/jpeg' })), 'image/jpeg'));
  })()`;

  const added = await page.eval(`
    document.getElementById('edit-back').click();
    document.querySelector('#list [data-edit]').click();
    const before = document.querySelectorAll('#f-shots .shots__item').length;
    const dt = new DataTransfer();
    dt.items.add(await ${tile(1)});
    dt.items.add(await ${tile(2)});
    const input = document.getElementById('f-image');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 80; i++) {
      if (document.querySelectorAll('#f-shots .shots__item').length >= before + 2) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return {
      before,
      after: document.querySelectorAll('#f-shots .shots__item').length,
      mains: document.querySelectorAll('#f-shots .shots__item.is-main').length,
      msg: document.getElementById('edit-msg').textContent,
    };
  `);
  check('two photos chosen at once both land on the product',
    added.after === added.before + 2, JSON.stringify(added));
  check('and exactly one of them is the main photo', added.mains === 1, JSON.stringify(added));
  check('the message counts what was added', /2 photos ready/i.test(added.msg), added.msg);

  // What the save actually commits: each new photo to its own path, none of
  // them over a path this product already uses, and the order of the strip
  // carried into image + gallery.
  const saved = await page.eval(`
    window.__gh.calls.length = 0;
    document.getElementById('edit-form')
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    for (let i = 0; i < 80; i++) {
      if (!document.getElementById('pane-work').hidden) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const puts = window.__gh.calls.filter((c) => c.method === 'PUT');
    const cat = puts.find((c) => /products\.json$/.test(c.url));
    const list = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(cat.body.content), (c) => c.charCodeAt(0))));
    const slug = document.getElementById('f-slug').value;
    return {
      imagePaths: puts.filter((c) => /\.jpg$/.test(c.url))
        .map((c) => new URL(c.url).pathname.split('/').pop()),
      product: list.find((p) => p.slug === slug),
    };
  `);
  check('each new photo is committed to a path of its own',
    saved.imagePaths.length === 2
    && new Set(saved.imagePaths).size === 2, JSON.stringify(saved.imagePaths));
  // Adding a photo must not overwrite one the product already has.
  check('and never over a path this product already uses',
    !saved.imagePaths.includes((saved.product.image || '').split('/').pop()),
    JSON.stringify({ wrote: saved.imagePaths, main: saved.product.image }));
  check('the extra photos are saved as the gallery',
    Array.isArray(saved.product.gallery) && saved.product.gallery.length === 2,
    JSON.stringify(saved.product.gallery));
  check('the main photo is not repeated in the gallery',
    !saved.product.gallery.includes(saved.product.image),
    JSON.stringify({ image: saved.product.image, gallery: saved.product.gallery }));

  // Reordering changes which URL is which. It must not re-upload anything:
  // the files are already in the repository.
  const reordered = await page.eval(`
    document.getElementById('edit-back').click();
    document.querySelector('#list [data-edit]').click();
    const wasMain = document.querySelector('#f-shots .shots__img').src;
    document.querySelector('#f-shots [data-shot-main]').click();
    const nowMain = document.querySelector('#f-shots .shots__img').src;
    return { changed: wasMain !== nowMain,
             mains: document.querySelectorAll('#f-shots .shots__item.is-main').length };
  `);
  check('"Set main" moves a photo to the front', reordered.changed === true,
    JSON.stringify(reordered));
  check('and there is still exactly one main photo', reordered.mains === 1);

  const removed = await page.eval(`
    const before = document.querySelectorAll('#f-shots .shots__item').length;
    document.querySelector('#f-shots [data-shot-remove]').click();
    return { before, after: document.querySelectorAll('#f-shots .shots__item').length };
  `);
  check('Remove takes one photo off the product',
    removed.after === removed.before - 1, JSON.stringify(removed));

  const none = await page.eval(`
    let guard = 0;
    while (document.querySelector('#f-shots [data-shot-remove]') && guard++ < 20) {
      document.querySelector('#f-shots [data-shot-remove]').click();
    }
    document.getElementById('edit-form')
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    return { shots: document.querySelectorAll('#f-shots .shots__item').length,
             msg: document.getElementById('edit-msg').textContent };
  `);
  check('a product with every photo removed is refused, not saved blank',
    none.shots === 0 && /add a photo/i.test(none.msg), JSON.stringify(none));
}

console.log('\nSigning out');
{
  const r = await page.eval(`
    document.getElementById('sign-out').click();
    return {
      auth: !document.getElementById('pane-auth').hidden,
      stored: localStorage.getItem('pk-admin-token'),
      rates: localStorage.getItem('pk-price-book'),
    };
  `);
  check('signing out returns to the sign-in pane', r.auth);
  check('signing out deletes the stored token', r.stored === null, String(r.stored));
  // A device that is no longer signed in keeps no rate card either.
  check('and takes the saved rates off the device with it',
    r.rates === null, String(r.rates).slice(0, 60));
}

console.log('\nThe counter with no signal');
{
  // A shop with a dead connection is exactly when somebody is standing there
  // asking a price. Losing the signal must not throw away a working token —
  // and must not take the rates with it.
  await page.eval(`
    localStorage.setItem('pk-admin-token', 'github_pat_TESTTOKEN');
    localStorage.setItem('pk-price-book', JSON.stringify({
      at: Date.now(),
      rows: [{ id: 901, name: 'Saved On This Device', brand: 'PK', category: 'Speakers',
               sku: 'SD1', packSize: '20', pricePiece: 500, priceCarton: 480,
               tags: '', available: true }],
    }));
    sessionStorage.setItem('__keep', '1');
    sessionStorage.setItem('__offline', '1');
    return 1;
  `);
  await page.goto(`${BASE}/admin/`);
  await page.eval(`return new Promise((r) => setTimeout(r, 400));`);

  const off = await page.eval(`return {
    work: !document.getElementById('pane-work').hidden,
    auth: !document.getElementById('pane-auth').hidden,
    rows: document.querySelectorAll('#price-list .pb').length,
    money: (document.querySelector('#price-list .pb__money') || {}).textContent || '',
    note: document.getElementById('price-note').textContent,
    noteShown: !document.getElementById('price-note').hidden,
    tabs: {
      products: document.getElementById('tab-products').hidden,
      categories: document.getElementById('tab-categories').hidden,
    },
    token: localStorage.getItem('pk-admin-token'),
  };`);
  check('a lost connection still opens the price book',
    off.work && !off.auth && off.rows === 1, JSON.stringify(off).slice(0, 160));
  check('with the rates saved on the device', off.money === 'Rs. 500', off.money);
  check('and says plainly that they may be out of date',
    off.noteShown && /saved on this device/i.test(off.note), off.note);
  check('editing is not offered against a catalogue that never arrived',
    off.tabs.products && off.tabs.categories, JSON.stringify(off.tabs));
  // The bug this guards: treating any failure as a bad token and signing out.
  check('and the token is not thrown away over a dropped signal',
    off.token === 'github_pat_TESTTOKEN', String(off.token));

  await page.eval(`
    sessionStorage.removeItem('__keep');
    sessionStorage.removeItem('__offline');
    return 1;
  `);
}

console.log('\n' + '-'.repeat(56));
console.log(fails.length ? `  ${pass} passed, ${fails.length} FAILED` : `  All ${pass} admin checks passed`);
fails.forEach((f) => console.log(`  ✗ ${f}`));

await page.close();
proc.kill();
process.exit(fails.length ? 1 : 0);
