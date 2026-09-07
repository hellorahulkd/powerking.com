#!/usr/bin/env node
/**
 * Browser checks for the multi-product enquiry list. Development-only.
 *
 *   node build.js && node serve.js &
 *   node scripts/dev/enquiry-test.js
 *
 * The feature ends in a wa.me link, so most of these assertions are about the
 * message that link carries: the products actually chosen, their quantities,
 * and the unit each quantity is in. Everything else is state that has to
 * survive a page change, because a buyer picks products across several pages.
 */
import { launch, newPage } from './cdp.js';
import { products } from '../../src/data/products.js';
import { siteConfig, whatsappMessages, ENQUIRY_MAX } from '../../src/config/site.config.js';

const BASE = process.env.BASE || 'http://localhost:4321';

let pass = 0;
const fails = [];
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fails.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

const { proc, port } = await launch();
const page = await newPage(port);
await page.setViewport(1280, 900, false);

/** Every test starts from an empty list, whatever the last one left behind. */
async function fresh(path = '/products/') {
  await page.goto(BASE + path);
  await page.eval(`localStorage.removeItem('pk-enquiry'); return 1;`);
  await page.goto(BASE + path);
}

const message = () => page.eval(`
  const href = document.getElementById('enq-send').href;
  return decodeURIComponent((href.split('?text=')[1] || ''));
`);

console.log('\nSelecting products');
{
  await fresh();
  const r = await page.eval(`
    const btns = [...document.querySelectorAll('[data-enq-add]')];
    const hiddenBefore = btns.filter(b => b.hidden).length;
    return { count: btns.length, hiddenBefore,
             bar: document.getElementById('enq-bar').hidden };
  `);
  check('every card offers an add control', r.count > 0, `${r.count}`);
  check('the controls are revealed by JavaScript, not shipped visible',
    r.hiddenBefore === 0, `${r.hiddenBefore} still hidden`);
  check('the bar stays out of the way until something is selected', r.bar === true);

  const added = await page.eval(`
    const b = [...document.querySelectorAll('[data-enq-add]')];
    b[0].click(); b[2].click();
    return {
      bar: !document.getElementById('enq-bar').hidden,
      count: document.getElementById('enq-count').textContent,
      pressed: b[0].getAttribute('aria-pressed'),
      label: b[0].getAttribute('aria-label'),
      stored: JSON.parse(localStorage.getItem('pk-enquiry') || '[]'),
    };
  `);
  check('the bar appears with a running count',
    added.bar && /2 products on your enquiry/.test(added.count),
    added.count);
  check('a selected control reports itself pressed', added.pressed === 'true');
  check('a selected control offers to remove, not add again',
    /^Remove /.test(added.label), added.label);
  check('the selection is stored with a default quantity of one carton',
    added.stored.length === 2
    && added.stored.every((i) => i.qty === 1 && i.unit === 'cartons'),
    JSON.stringify(added.stored));

  const toggled = await page.eval(`
    const b = document.querySelectorAll('[data-enq-add]')[0];
    b.click();
    return { stored: JSON.parse(localStorage.getItem('pk-enquiry') || '[]').length,
             pressed: b.getAttribute('aria-pressed') };
  `);
  check('pressing it again removes the product',
    toggled.stored === 1 && toggled.pressed === 'false', JSON.stringify(toggled));
}

console.log('\nThe message that reaches WhatsApp');
{
  await fresh();
  const built = await page.eval(`
    const b = [...document.querySelectorAll('[data-enq-add]')];
    b[0].click(); b[1].click();
    const names = [b[0], b[1]].map(x => x.getAttribute('data-enq-name'));
    document.getElementById('enq-open').click();
    const rows = [...document.querySelectorAll('.enq__row')];
    const q = rows[0].querySelector('[data-qty]');
    q.value = '12'; q.dispatchEvent(new Event('input', { bubbles: true }));
    const u = rows[1].querySelector('[data-unit]');
    u.value = 'pieces'; u.dispatchEvent(new Event('input', { bubbles: true }));
    const href = document.getElementById('enq-send').href;
    return { names, rows: rows.length, href,
             text: decodeURIComponent(href.split('?text=')[1] || '') };
  `);
  check('the panel lists exactly what was selected', built.rows === 2, `${built.rows}`);
  check('the link goes to the configured WhatsApp number',
    built.href.startsWith(`https://wa.me/${siteConfig.whatsappNumber}?text=`),
    built.href.slice(0, 40));
  check('the message opens with the configured greeting',
    built.text.startsWith(whatsappMessages.list.greeting));
  check('the message closes with the configured sign-off',
    built.text.trim().endsWith(whatsappMessages.list.closing));
  check('every selected product is named in the message',
    built.names.every((n) => built.text.includes(n)), built.names.join(' | '));
  check('quantities carry the unit they were given in',
    /\(12 cartons\)/.test(built.text) && /\(1 piece\)/.test(built.text),
    built.text);
  check('the list is numbered in the order it was built',
    built.text.indexOf('1. ' + built.names[0]) !== -1
    && built.text.indexOf('2. ' + built.names[1]) !== -1);

  // "1 cartons" is the kind of thing a buyer notices and a shop does not.
  const singular = await page.eval(`
    const q = document.querySelector('.enq__row [data-qty]');
    q.value = '1'; q.dispatchEvent(new Event('input', { bubbles: true }));
    return decodeURIComponent(document.getElementById('enq-send').href.split('?text=')[1]);
  `);
  check('a quantity of one reads as a singular unit',
    /\(1 carton\)/.test(singular) && !/\(1 cartons\)/.test(singular));
}

console.log('\nGuarding the quantity');
{
  const guarded = await page.eval(`
    const q = document.querySelector('.enq__row [data-qty]');
    const out = {};
    for (const bad of ['0', '-5', 'abc', '']) {
      q.value = bad;
      q.dispatchEvent(new Event('input', { bubbles: true }));
      out[bad || '(empty)'] = JSON.parse(localStorage.getItem('pk-enquiry'))[0].qty;
    }
    q.value = '999999';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    out.huge = JSON.parse(localStorage.getItem('pk-enquiry'))[0].qty;
    return out;
  `);
  check('zero, negative, empty and non-numeric quantities fall back to one',
    ['0', '-5', 'abc', '(empty)'].every((k) => guarded[k] === 1),
    JSON.stringify(guarded));
  check('an absurd quantity is capped rather than sent as typed',
    guarded.huge === 9999, String(guarded.huge));
}

console.log('\nMoving between pages');
{
  await fresh();
  const name = await page.eval(`
    const b = document.querySelectorAll('[data-enq-add]')[0];
    b.click();
    return b.getAttribute('data-enq-name');
  `);
  await page.goto(`${BASE}/`);
  const kept = await page.eval(`
    return { bar: !document.getElementById('enq-bar').hidden,
             count: document.getElementById('enq-count').textContent,
             stored: JSON.parse(localStorage.getItem('pk-enquiry') || '[]')[0].name };
  `);
  check('the selection survives moving to another page',
    kept.bar && kept.stored === name, JSON.stringify(kept));
  check('the count follows it', /1 product on your enquiry/.test(kept.count), kept.count);

  // A product page is where someone lands from search, so the control has to
  // work there too — and agree with what the catalogue already knows.
  const product = products.find((p) => p.slug !== undefined);
  await page.goto(`${BASE}/products/${product.slug}/`);
  const onProduct = await page.eval(`
    const b = document.querySelector('[data-enq-add]');
    return { present: !!b, hidden: b.hidden, label: b.textContent.trim(),
             pressed: b.getAttribute('aria-pressed') };
  `);
  check('the product page offers the same control', onProduct.present && !onProduct.hidden);
  check('on a product page it is a labelled button, not an icon',
    /enquiry list/i.test(onProduct.label), onProduct.label);
  check('it reflects whether this product is already in the list',
    onProduct.pressed === (product.name === kept.stored ? 'true' : 'false'),
    JSON.stringify({ pressed: onProduct.pressed, page: product.name, inList: kept.stored }));
}

console.log('\nThe Enquire buttons ask how many first');
{
  // Every button that names a product now opens the list with a quantity
  // waiting, instead of jumping to a message with no quantity in it — which
  // only started a conversation the shop then had to have anyway.
  for (const [where, path, selector] of [
    ['product page', `/products/${products[0].slug}/`, '.enquiry [data-enq-open]'],
    ['catalogue card', '/products/', '.card [data-enq-open]'],
    ['hero slide', '/', '.slide [data-enq-open]'],
  ]) {
    await fresh(path);
    const r = await page.eval(`
      const b = document.querySelector('${selector}');
      if (!b) return { missing: true };
      const href = b.getAttribute('href');
      b.click();
      await new Promise(r => setTimeout(r, 250));
      return {
        href,
        open: document.getElementById('enq-dialog').open,
        rows: document.querySelectorAll('.enq__row').length,
        onQty: document.activeElement.hasAttribute('data-qty'),
        name: (document.querySelector('.enq__name') || {}).textContent,
        matches: b.getAttribute('data-enq-name'),
      };
    `);
    check(`the ${where} Enquire button opens the list, not WhatsApp`,
      !r.missing && r.open === true && r.rows === 1, JSON.stringify(r));
    check(`the ${where} button puts its own product on the list`,
      r.name === r.matches, JSON.stringify({ got: r.name, want: r.matches }));
    check(`the ${where} button lands on the quantity box`, r.onQty === true);
    check(`without JavaScript the ${where} button is still a WhatsApp link`,
      /^https:\/\/wa\.me\//.test(r.href || ''), r.href);
  }
}

console.log('\nThe floating button, with nothing on the list');
{
  await fresh('/about/');
  const r = await page.eval(`
    document.querySelector('.wa-float').click();
    await new Promise(r => setTimeout(r, 250));
    return {
      open: document.getElementById('enq-dialog').open,
      empty: !document.getElementById('enq-empty').hidden,
      sendHidden: document.getElementById('enq-send').hidden,
      browse: !!document.querySelector('.enq__empty a[href="/products/"]'),
      orMessage: (document.querySelector('.enq__empty-or a') || {}).href || '',
    };
  `);
  check('it opens the list rather than a blank message', r.open === true);
  check('an empty list explains what to do instead of showing nothing',
    r.empty === true && r.browse === true, JSON.stringify(r));
  check('the send button is not offered with nothing to send', r.sendHidden === true);
  check('someone who just wants to message us can still do that',
    /^https:\/\/wa\.me\//.test(r.orMessage), r.orMessage);
}

console.log('\nSaying what the buttons do, in words');
{
  await fresh();
  const words = await page.eval(`
    const pin = document.querySelector('.enq-add--pin');
    const on = pin.querySelector('.enq-add__on').textContent.trim();
    const off = pin.querySelector('.enq-add__off').textContent.trim();
    return { on, off, bar: null };
  `);
  check('the card control says "Add", not just a plus sign',
    /add/i.test(words.on) && /added/i.test(words.off), JSON.stringify(words));

  const bar = await page.eval(`
    document.querySelector('.enq-add--pin').click();
    return { count: document.getElementById('enq-count').textContent,
             open: document.getElementById('enq-open').textContent.trim() };
  `);
  check('the bar names the list in plain words',
    /on your enquiry/i.test(bar.count), bar.count);
  check('and its button says what pressing it does',
    /quantit/i.test(bar.open), bar.open);
}

console.log('\nThe cap on one message');
{
  await fresh();
  const capped = await page.eval(`
    const b = [...document.querySelectorAll('[data-enq-add]')];
    for (let i = 0; i < b.length; i++) b[i].click();
    const flash = document.getElementById('enq-flash');
    return {
      stored: JSON.parse(localStorage.getItem('pk-enquiry') || '[]').length,
      clicked: b.length,
      flashed: !!flash && /full/i.test(flash.textContent),
      note: document.getElementById('enq-note') ? '' : 'missing',
    };
  `);
  check(`no more than ${ENQUIRY_MAX} products go into one enquiry`,
    capped.stored === ENQUIRY_MAX, `${capped.stored} of ${capped.clicked} clicked`);
  check('trying to add past the cap says so rather than failing silently',
    capped.flashed);

  const len = await page.eval(`
    document.getElementById('enq-open').click();
    return { url: document.getElementById('enq-send').href.length,
             note: document.getElementById('enq-note').textContent };
  `);
  // The whole message travels in the URL; past roughly 4k a phone may hand
  // WhatsApp a truncated one, which is why the cap exists at all.
  check('a full enquiry still produces a URL a phone will carry',
    len.url < 4000, `${len.url} chars`);
  check('a full list explains why nothing more can be added',
    /most one message can carry/i.test(len.note), len.note);
}

console.log('\nClearing and removing');
{
  const removed = await page.eval(`
    const before = JSON.parse(localStorage.getItem('pk-enquiry')).length;
    document.querySelector('.enq__row [data-remove]').click();
    return { before, after: JSON.parse(localStorage.getItem('pk-enquiry')).length,
             rows: document.querySelectorAll('.enq__row').length };
  `);
  check('removing a row drops it from the list and the panel',
    removed.after === removed.before - 1 && removed.rows === removed.after,
    JSON.stringify(removed));

  const cleared = await page.eval(`
    window.confirm = () => true;
    document.getElementById('enq-clear').click();
    return { stored: localStorage.getItem('pk-enquiry'),
             bar: document.getElementById('enq-bar').hidden,
             on: document.querySelectorAll('[data-enq-add].is-on').length };
  `);
  check('clearing empties the list and hides the bar',
    JSON.parse(cleared.stored).length === 0 && cleared.bar === true && cleared.on === 0,
    JSON.stringify(cleared));
}

console.log('\nWithout JavaScript, and alongside the rest of the page');
{
  await fresh();
  const html = await (await fetch(`${BASE}/products/`)).text();
  // The controls ship hidden and are revealed by the script, so a reader
  // without JS is never shown a button that cannot do anything.
  const hiddenInHtml = (html.match(/data-enq-add/g) || []).length;
  const withHidden = (html.match(/hidden\s+data-enq-add/g) || []).length;
  check('add controls are served hidden for anyone without JavaScript',
    hiddenInHtml > 0 && withHidden === hiddenInHtml, `${withHidden} of ${hiddenInHtml}`);
  check('the per-product WhatsApp link is still a plain link that works without JS',
    /href="https:\/\/wa\.me\/[^"]+"/.test(html));

  const corner = await page.eval(`
    const b = [...document.querySelectorAll('[data-enq-add]')];
    b[0].click();
    // The bubble fades rather than vanishing, so let the transition finish
    // before reading it — otherwise this samples a value on its way down.
    await new Promise(r => setTimeout(r, 400));
    const bar = document.getElementById('enq-bar').getBoundingClientRect();
    const float = document.querySelector('.wa-float');
    const cs = float ? getComputedStyle(float) : null;
    return { barVisible: bar.height > 0,
             floatOpacity: cs ? cs.opacity : 'none',
             bodyClass: document.body.classList.contains('has-enquiry') };
  `);
  check('the bar and the floating bubble never occupy the corner together',
    corner.barVisible && corner.bodyClass && corner.floatOpacity === '0',
    JSON.stringify(corner));

  check('no console errors anywhere in the flow',
    page.problems().length === 0, page.problems().join(' | '));
}

console.log('\n' + '-'.repeat(56));
console.log(fails.length ? `  ${pass} passed, ${fails.length} FAILED` : `  All ${pass} enquiry checks passed`);
fails.forEach((f) => console.log(`  ✗ ${f}`));

await page.close();
proc.kill();
process.exit(fails.length ? 1 : 0);
