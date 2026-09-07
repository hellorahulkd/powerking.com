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
// A previous run may have left a token in this origin's storage, and the panel
// would sign itself back in with it. Start signed out, always.
try { localStorage.removeItem('pk-admin-token'); } catch (e) {}
window.__gh = {
  calls: [],
  nextStatus: null,          // force one response to fail, for the conflict path
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

console.log('\nSearching and opening a product');
{
  const r = await page.eval(`
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
  check('the picker offers iPhone photos as well as JPEG and PNG',
    /heic/i.test(r.accepts || '') && /jpeg/i.test(r.accepts || ''), r.accepts);

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
    return new Promise(function (done) {
      setTimeout(function () {
        const img = document.getElementById('f-image-preview');
        done({
          msg: document.getElementById('edit-msg').textContent,
          shown: !img.hidden && img.src.startsWith('data:image/jpeg'),
          here: location.pathname,
        });
      }, 500);
    });
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
    const puts = window.__gh.calls.filter(c => c.method === 'PUT').slice(-2);
    const read = b => JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b), c => c.charCodeAt(0))));
    return {
      paths: puts.map(p => new URL(p.url).pathname.split('/contents/')[1]),
      cats: read(puts[0].body.content),
      prods: read(puts[1].body.content),
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

console.log('\nSigning out');
{
  const r = await page.eval(`
    document.getElementById('sign-out').click();
    return {
      auth: !document.getElementById('pane-auth').hidden,
      stored: localStorage.getItem('pk-admin-token'),
    };
  `);
  check('signing out returns to the sign-in pane', r.auth);
  check('signing out deletes the stored token', r.stored === null, String(r.stored));
}

console.log('\n' + '-'.repeat(56));
console.log(fails.length ? `  ${pass} passed, ${fails.length} FAILED` : `  All ${pass} admin checks passed`);
fails.forEach((f) => console.log(`  ✗ ${f}`));

await page.close();
proc.kill();
process.exit(fails.length ? 1 : 0);
