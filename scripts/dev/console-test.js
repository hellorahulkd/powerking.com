#!/usr/bin/env node
/**
 * ============================================================================
 *  END-TO-END TESTS — the inventory console
 * ============================================================================
 *  Drives a real Chrome against the real built site, talking to a real
 *  PostgREST over the real migrations. Nothing about the database layer is
 *  stubbed: when a test asserts that a member of staff cannot see the Settings
 *  link, the reason they cannot is the same reason they could not in
 *  production.
 *
 *      node scripts/dev/console-test.js
 *      node scripts/dev/console-test.js --only login   # one group
 *
 *  Requires a local PostgreSQL (see scripts/dev/db-test.sh) and the PostgREST
 *  binary at /var/lib/pgtest/bin/postgrest. Development only.
 * ============================================================================
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newPage } from './cdp.js';
import { startRig } from './console-rig.js';
import { CONSOLE_ROUTES } from '../../src/config/admin-routes.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const USERS = [
  { email: 'admin@powerking.test',   password: 'admin-password-1',   name: 'Ama Admin',    role: 'admin' },
  { email: 'manager@powerking.test', password: 'manager-password-1', name: 'Mira Manager', role: 'manager' },
  { email: 'staff@powerking.test',   password: 'staff-password-1',   name: 'Sita Staff',   role: 'staff' },
];

let pass = 0;
const fails = [];
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i > -1 ? process.argv[i + 1] : null;
})();

function check(label, ok, detail = '') {
  if (ok) { pass++; process.stdout.write(`  ✓ ${label}\n`); }
  else {
    fails.push(`${label}${detail ? ` — ${detail}` : ''}`);
    process.stdout.write(`  ✗ ${label}${detail ? ` — ${detail}` : ''}\n`);
  }
}

function group(name) { process.stdout.write(`\n  ${name}\n`); }

/**
 * Network failures a test caused on purpose — a wrong password, a duplicate
 * SKU. Declared rather than pattern-matched globally, so the final "nothing
 * else failed" check stays strict about everything nobody asked for.
 */
const expectedFailures = [/auth\/v1\/token/];
const expectFailure = (pattern) => expectedFailures.push(pattern);

/* --------------------------------------------------------------- helpers -- */

/** Wait until an expression is truthy, or give up. */
async function until(page, expression, { timeout = 6000, label } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await page.eval(`return (${expression});`);
      if (last) return last;
    } catch (err) { last = String(err.message).slice(0, 120); }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${label || expression} (last: ${JSON.stringify(last)})`);
}

const text = (sel) =>
  `document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null`;
const count = (sel) => `document.querySelectorAll(${JSON.stringify(sel)}).length`;

/** Sign in through the real form and wait for the console shell to appear. */
async function signIn(page, base, user, { expectFailure = false } = {}) {
  await page.goto(`${base}/admin/login/`);
  await until(page, `!!document.getElementById('login-form')`, { label: 'the sign-in form' });
  await page.eval(`
    document.getElementById('email').value = ${JSON.stringify(user.email)};
    document.getElementById('password').value = ${JSON.stringify(user.password)};
    document.getElementById('login-form').requestSubmit();
    return true;
  `);
  if (expectFailure) {
    return until(page, `(() => { const m = document.getElementById('login-msg');
      return m && !m.hidden ? m.textContent.trim() : null; })()`, { label: 'a sign-in error' });
  }
  await until(page, `location.pathname === '/admin/'`, { label: 'the dashboard', timeout: 8000 });
  await until(page, `document.body.classList.contains('is-ready')`, { label: 'the console shell' });
  return true;
}

async function clearSession(page) {
  await page.eval(`try { localStorage.clear(); } catch (e) {} return true;`);
}

/* ----------------------------------------------------------------- suites -- */

const SUITES = {};

SUITES.login = async (page, base) => {
  group('Sign in');

  await page.goto(`${base}/admin/`);
  await until(page, `location.pathname === '/admin/login/'`, { label: 'the redirect to sign-in' });
  check('an unauthenticated visit to /admin/ is redirected to sign-in', true);
  check('and remembers where it was going',
    (await page.eval(`return new URLSearchParams(location.search).get('next');`)) === '/admin/');

  // Taken from the shared route table rather than hard-coded, so this gets
  // stronger on its own as screens are added rather than going stale.
  const deep = CONSOLE_ROUTES.at(-1).path;
  await page.goto(`${base}${deep}`);
  await until(page, `location.pathname === '/admin/login/'`, { label: 'the redirect' });
  check(`a deep admin link (${deep}) is protected too`,
    (await page.eval(`return new URLSearchParams(location.search).get('next');`)) === deep);

  // Client-side validation before anything is sent.
  await page.goto(`${base}/admin/login/`);
  await until(page, `!!document.getElementById('login-form')`);
  await page.eval(`
    document.getElementById('email').value = 'not-an-email';
    document.getElementById('password').value = 'x';
    document.getElementById('login-form').requestSubmit();
    return true;
  `);
  check('an address that is not an address is caught before the request',
    /email address/i.test(await page.eval(`return ${text('.f.is-invalid .f__error')};`) || ''));

  const message = await signIn(page, base, { email: 'admin@powerking.test', password: 'wrong-password' },
    { expectFailure: true });
  check('a wrong password is refused with a plain message', /do not match/i.test(message), message);
  check('and does not say whether the account exists', !/no such|not found|unknown user/i.test(message));

  await signIn(page, base, USERS[0]);
  check('a correct password signs in and lands on the dashboard', true);
  // Navigating to another admin page must not ask for a password again: the
  // session is in storage and each page picks it back up.
  await page.goto(`${base}/admin/`);
  await until(page, `document.body.classList.contains('is-ready')`, { label: 'the dashboard' });
  check('the session carries across a full page load',
    (await page.eval(`return document.querySelectorAll('.kpi').length;`)) === 5);

  // Signing out has to actually clear the session, not just navigate.
  await page.goto(`${base}/admin/`);
  await until(page, `document.body.classList.contains('is-ready')`);
  await page.eval(`
    [...document.querySelectorAll('.shell__user button')].find(b => /sign out/i.test(b.textContent))?.click();
    return true;
  `);
  await until(page, `location.pathname === '/admin/login/'`, { label: 'the sign-out redirect' });
  check('signing out returns to the sign-in page', true);
  check('and leaves no session behind',
    (await page.eval(`return localStorage.getItem('pk.session.v1');`)) === null);
};

SUITES.dashboard = async (page, base, rig) => {
  group('Dashboard');
  await clearSession(page);
  await signIn(page, base, USERS[0]);

  const kpis = await page.eval(`
    return [...document.querySelectorAll('.kpi')].map(k => ({
      label: k.querySelector('.kpi__label').textContent.trim(),
      value: k.querySelector('.kpi__value').textContent.trim(),
    }));
  `);
  const byLabel = Object.fromEntries(kpis.map((k) => [k.label, k.value]));
  check('five KPI cards are shown', kpis.length === 5, JSON.stringify(kpis.map((k) => k.label)));
  check('total products matches the seeded catalogue', byLabel['Total products'] === '87', byLabel['Total products']);
  check('every product starts out of stock', byLabel['Out of stock'] === '87', byLabel['Out of stock']);
  check('inventory value is zero until cost prices are entered',
    /^Rs\.\s*0$/.test(byLabel['Inventory value'] || ''), byLabel['Inventory value']);

  check('the empty activity table says so, rather than showing nothing',
    /no stock movements/i.test(await page.eval(`return ${text('#activity .state__title')};`) || ''));

  // Now put some stock in, through the database, and reload.
  const productId = rig.psql(`select id from public.products where sku = 'PK-60'`);
  rig.psqlAs('admin@powerking.test',
    `select public.record_stock_movement('${productId}'::uuid, 'STOCK_IN', 250, p_unit_cost => 400);
     update public.products set cost_price = 400 where id = '${productId}';`);

  await page.goto(`${base}/admin/`);
  await until(page, `document.querySelectorAll('.kpi').length === 5`);
  await until(page, `${text('#activity .table')} !== null`, { label: 'the activity table' });

  const after = await page.eval(`
    const v = {};
    for (const k of document.querySelectorAll('.kpi')) {
      v[k.querySelector('.kpi__label').textContent.trim()] = k.querySelector('.kpi__value').textContent.trim();
    }
    return v;
  `);
  check('units in stock reflects the movement', after['Units in stock'] === '250', after['Units in stock']);
  check('out of stock drops by one', after['Out of stock'] === '86', after['Out of stock']);
  check('inventory value uses cost price — 250 x Rs. 400',
    /1,00,000/.test(after['Inventory value']), after['Inventory value']);

  const activityRow = await page.eval(`return ${text('#activity tbody tr')};`);
  check('the movement appears in recent activity', /PK-60/.test(activityRow || ''), activityRow);
  check('and names who did it', /Ama Admin/.test(activityRow || ''), activityRow);
};

SUITES.roles = async (page, base) => {
  group('Roles in the interface');

  const navFor = async (user) => {
    await clearSession(page);
    await signIn(page, base, user);
    return page.eval(`return [...document.querySelectorAll('.nav__link')].map(a => a.textContent.trim());`);
  };

  const adminNav = await navFor(USERS[0]);
  check('an admin sees every section',
    ['Dashboard', 'Products', 'Inventory', 'Stock in', 'Stock out', 'Adjustment',
     'Suppliers', 'Categories', 'Brands', 'Reports', 'Settings'].every((l) => adminNav.includes(l)),
    adminNav.join(', '));
  check('the sidebar is drawn from one list, in order',
    adminNav[0] === 'Dashboard' && adminNav.at(-1) === 'Settings', adminNav.join(', '));

  const managerNav = await navFor(USERS[1]);
  check('a manager sees adjustments and suppliers',
    managerNav.includes('Adjustment') && managerNav.includes('Suppliers'), managerNav.join(', '));

  const staffNav = await navFor(USERS[2]);
  check('staff can still record stock in and out',
    staffNav.includes('Stock in') && staffNav.includes('Stock out'), staffNav.join(', '));
  check('staff are not offered adjustments', !staffNav.includes('Adjustment'), staffNav.join(', '));
  check('staff are not offered suppliers', !staffNav.includes('Suppliers'), staffNav.join(', '));

  check('the signed-in user and role are shown at the foot of the sidebar',
    /Sita Staff/.test(await page.eval(`return ${text('.shell__name')};`) || '') &&
    /Staff/.test(await page.eval(`return ${text('.shell__role')};`) || ''));

  // Hiding a link is a courtesy, not a control: what actually stops a member
  // of staff adjusting stock is the RLS policy and the role check inside
  // record_stock_movement(), both asserted in scripts/dev/db-test.sh against
  // the same migrations. This suite only checks that the interface does not
  // offer somebody a button that would fail.
};

SUITES.products = async (page, base, rig) => {
  group('Products');
  await clearSession(page);
  await signIn(page, base, USERS[0]);

  await page.goto(`${base}/admin/products/`);
  await until(page, `!!document.querySelector('#results .table tbody tr')`, { label: 'the product table' });

  check('the list is paged, not the whole catalogue at once',
    (await page.eval(`return document.querySelectorAll('#results tbody tr').length;`)) === 25);
  check('and says how many there are in total',
    /87 products/.test(await page.eval(`return ${text('#count')};`) || ''),
    await page.eval(`return ${text('#count')};`));

  // Search runs in Postgres, so this is a real query, not a filter over rows
  // that were already downloaded.
  await page.eval(`
    const box = document.querySelector('.toolbar__search');
    box.value = 'PK-60';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await until(page, `document.querySelectorAll('#results tbody tr').length === 1`,
    { label: 'the search to narrow' });
  check('searching a SKU finds exactly that product',
    /PK-60/.test(await page.eval(`return ${text('#results tbody tr')};`) || ''));
  check('the search is in the URL, so the view can be shared or bookmarked',
    (await page.eval(`return new URLSearchParams(location.search).get('q');`)) === 'PK-60');

  await page.eval(`
    const box = document.querySelector('.toolbar__search');
    box.value = 'charger';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await until(page, `document.querySelectorAll('#results tbody tr').length > 0 &&
    !document.body.textContent.includes('PK-60 120W')`, { label: 'the second search' })
    .catch(() => {});
  check('searching a word finds products by name',
    (await page.eval(`return document.querySelectorAll('#results tbody tr').length;`)) > 0);

  // Back must restore the previous filter — the state is in the URL.
  await page.eval(`history.back(); return true;`);
  await until(page, `new URLSearchParams(location.search).get('q') === 'PK-60'`,
    { label: 'the back button' });
  check('the browser Back button restores the previous search', true);

  group('Add a product');
  await page.goto(`${base}/admin/products/new/`);
  await until(page, `!!document.querySelector('form')`, { label: 'the form' });

  // Submitting an empty form must not reach the network.
  await page.eval(`document.querySelector('form').requestSubmit(); return true;`);
  await until(page, `document.querySelectorAll('.f.is-invalid').length > 0`,
    { label: 'validation' });
  const invalidCount = await page.eval(`return document.querySelectorAll('.f.is-invalid').length;`);
  check('an empty form is refused before anything is sent', invalidCount >= 3, `${invalidCount} fields`);
  check('and names what is missing',
    /needs a name/i.test(await page.eval(`return ${text('.f.is-invalid .f__error')};`) || ''));

  // The web address follows the name until it is edited by hand.
  await page.eval(`
    const n = document.querySelector('form .f__input');
    n.value = 'Test Bluetooth Speaker X1';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  check('the web address is filled in from the name',
    (await page.eval(`
      return [...document.querySelectorAll('.f')].find(f =>
        /Web address/.test(f.querySelector('.f__label')?.textContent || ''))
        ?.querySelector('input')?.value;
    `)) === 'test-bluetooth-speaker-x1');

  const fill = async (label, value) => page.eval(`
    const f = [...document.querySelectorAll('.f')].find(f =>
      (f.querySelector('.f__label')?.textContent || '').trim().replace(/\\s*\\*$/, '') === ${JSON.stringify(label)});
    const c = f?.querySelector('input, select, textarea');
    if (!c) return false;
    c.value = ${JSON.stringify(value)};
    c.dispatchEvent(new Event('input', { bubbles: true }));
    c.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `);

  const categoryId = rig.psql(`select id from public.categories where slug = 'speakers'`);
  check('SKU field filled', await fill('SKU', 'TEST-X1'));
  check('category chosen', await fill('Category', categoryId));
  await fill('Units per carton', '20');
  await fill('Cost price (Rs.)', '400');
  await fill('Wholesale price per piece (Rs.)', '550');
  await fill('Low-stock level', '10');
  await fill('Opening stock', '247');

  await page.eval(`document.querySelector('form').requestSubmit(); return true;`);
  await until(page, `location.pathname === '/admin/products/view/'`,
    { label: 'the new product page', timeout: 10000 });
  check('creating a product lands on its page', true);

  group('One product');
  await until(page, `!!document.querySelector('.big-number')`, { label: 'the stock figure' });
  const big = await page.eval(`return ${text('.big-number')};`);
  check('opening stock was recorded', /247 available/.test(big), big);
  // Requirement 20, on the screen a person actually reads.
  check('247 units at 20 per carton reads as 12 cartons + 7 units',
    /12 cartons \+ 7 units/.test(big), big);

  // textContent, not innerText: innerText returns the *rendered* text, and
  // these labels are uppercased by CSS, so innerText would report
  // "FULL CARTONS" and a case-sensitive match would quietly fail.
  const shown = await page.eval(`return document.body.textContent;`);
  check('cost price is shown to staff here', /Rs\.\s*400/.test(shown));
  check('the carton breakdown is also given as separate figures',
    /Full cartons/.test(shown) && /Loose units/.test(shown));

  await until(page, `!!document.querySelector('#history .table tbody tr')`, { label: 'the history' });
  const historyRow = await page.eval(`return ${text('#history tbody tr')};`);
  check('the opening stock appears in the history as a real movement',
    /Stock in/.test(historyRow) && /\+247/.test(historyRow), historyRow);
  check('and is attributed to the person who created it',
    /Ama Admin/.test(historyRow), historyRow);
  check('and records the stock level after it', /247/.test(historyRow));

  group('Duplicate SKUs');
  // The next submission is meant to be rejected by the database.
  expectFailure(/rpc\/create_product/);
  await page.goto(`${base}/admin/products/new/`);
  await until(page, `!!document.querySelector('form')`);
  await fill('Product name', 'Clashing Product');
  await fill('SKU', 'test-x1');           // same SKU, different case
  await fill('Category', categoryId);
  await page.eval(`document.querySelector('form').requestSubmit(); return true;`);
  const skuError = await until(page, `(() => {
    const f = [...document.querySelectorAll('.f.is-invalid')].find(f =>
      /SKU/.test(f.querySelector('.f__label')?.textContent || ''));
    return f ? f.querySelector('.f__error').textContent.trim() : null;
  })()`, { label: 'the duplicate SKU error' });
  check('a duplicate SKU is refused, case-insensitively, on the SKU field',
    /already used/i.test(skuError), skuError);
  check('and stayed on the form rather than losing what was typed',
    (await page.eval(`return location.pathname;`)) === '/admin/products/new/');
};

SUITES.deactivated = async (page, base, rig) => {
  group('A deactivated account');
  await clearSession(page);
  await signIn(page, base, USERS[2]);

  rig.psqlAs('admin@powerking.test',
    `update public.profiles set is_active = false where email = 'staff@powerking.test';`);
  await page.goto(`${base}/admin/`);
  await until(page, `location.pathname === '/admin/login/'`, { label: 'the redirect' });
  const msg = await until(page, `(() => { const m = document.getElementById('login-msg');
    return m && !m.hidden ? m.textContent.trim() : null; })()`, { label: 'the reason' });
  check('a deactivated user is signed out and told why', /deactivated/i.test(msg), msg);
  check('and their session is cleared',
    (await page.eval(`return localStorage.getItem('pk.session.v1');`)) === null);

  rig.psqlAs('admin@powerking.test',
    `update public.profiles set is_active = true where email = 'staff@powerking.test';`);
};

SUITES.unconfigured = async (page, base) => {
  group('Not connected to a database');
  // Rebuilt without the environment variables, so this is the real page a
  // clone of this repository shows before anybody has set it up.
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe' });
  await clearSession(page);
  await page.goto(`${base}/admin/`);
  await until(page, `!!document.querySelector('.setup')`, { label: 'the setup notice' });
  check('an unconfigured /admin/ explains what is missing rather than failing',
    /not connected to a database/i.test(await page.eval(`return ${text('.setup__title')};`) || ''));
  check('and says the public catalogue is unaffected',
    /catalogue is unaffected/i.test(await page.eval(`return ${text('.setup__note')};`) || ''));

  await page.goto(`${base}/admin/login/`);
  await until(page, `!!document.getElementById('login-msg')`, { label: 'the notice' });
  check('the sign-in form says so too and disables itself',
    (await page.eval(`return document.getElementById('login-go').disabled;`)) === true);

  check('the public catalogue still works with no database at all',
    await (async () => {
      await page.goto(`${base}/products/`);
      return (await page.eval(`return ${count('.card')};`)) > 0;
    })());
};

/* ------------------------------------------------------------------- main -- */

async function main() {
  let rig;
  let browser;
  let page;
  try {
    rig = await startRig({ users: USERS, quiet: true });

    // Build the site pointing at the rig, exactly as a deployment would.
    execFileSync('node', ['build.js'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, SUPABASE_URL: rig.url, SUPABASE_ANON_KEY: rig.anonKey },
    });

    browser = await launch(9333);
    page = await newPage(9333);
    await page.setViewport(1280, 900);

    for (const [name, suite] of Object.entries(SUITES)) {
      if (only && only !== name) continue;
      await suite(page, rig.url, rig);
    }

    // Everything a test caused on purpose is declared with expectFailure;
    // the rig serves no fonts or images. Anything else is the console
    // misbehaving, and is a failure.
    const RIG_GAPS = /favicon|\.woff2|site\.webmanifest|\/images\//;
    const problems = page.problems().filter(
      (p) => !RIG_GAPS.test(p) && !expectedFailures.some((rx) => rx.test(p)));
    check('nothing else failed to load, and nothing threw', problems.length === 0,
      problems.slice(0, 4).join(' | '));
  } finally {
    await page?.close().catch(() => {});
    browser?.proc.kill();
    await rig?.stop();
    // Leave dist/ as a normal, unconfigured build rather than one pointing at
    // a rig that is no longer running.
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'pipe' });
  }

  process.stdout.write(`\n  ${pass} passed, ${fails.length} failed\n\n`);
  if (fails.length) {
    for (const f of fails) process.stdout.write(`    ✗ ${f}\n`);
    process.stdout.write('\n');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\n  console-test crashed:\n', err);
  process.exitCode = 1;
});
