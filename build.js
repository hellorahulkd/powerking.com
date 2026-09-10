#!/usr/bin/env node
/**
 * ============================================================================
 *  POWERKING NEPAL — STATIC SITE BUILD
 * ============================================================================
 *  Renders every page to plain HTML in dist/ and copies public/ over the top.
 *  Zero npm dependencies — `node build.js` is the entire toolchain.
 *
 *  Why pre-render instead of a single-page app?
 *  WhatsApp, Facebook and Messenger link crawlers do not run JavaScript. A
 *  real HTML file per product is the only way each product link gets its own
 *  title, description and preview image when it is shared — which is how most
 *  of this site's traffic will be passed around.
 * ============================================================================
 */

import { mkdir, writeFile, readFile, rm, cp, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { siteConfig } from './src/config/site.config.js';
import { loadCatalogue } from './src/data/catalogue.js';
import { slugifyCategory } from './src/templates/components.js';
import { homePage } from './src/pages/home.js';
import { cataloguePage, categoryPage, PAGE_SIZE } from './src/pages/catalogue.js';
import { productPage } from './src/pages/product.js';
import { aboutPage } from './src/pages/about.js';
import { contactPage } from './src/pages/contact.js';
import { brandsPage, privacyPage, notFoundPage } from './src/pages/misc.js';
import { adminPage } from './src/pages/admin.js';
import { consolePage, loginPage } from './src/templates/console.js';
import { CONSOLE_ROUTES } from './src/config/admin-routes.js';
import { supabaseConfig, envModule, serviceRoleKeyMisplaced } from './src/config/supabase.config.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

const log = (msg) => process.stdout.write(`${msg}\n`);
const warnings = [];
const errors = [];

/* ----------------------------------------------------------- validation -- */

/**
 * Catch the mistakes that are easy to make when adding a product by hand,
 * before they reach production.
 */
function validate(products, categories) {
  const seenIds = new Set();
  const seenSlugs = new Set();
  const categoryNames = new Set(categories.map((c) => c.name));

  for (const p of products) {
    const where = `product "${p.name || p.slug || p.id}"`;
    for (const field of ['id', 'name', 'slug', 'brand', 'category', 'description', 'image']) {
      if (!p[field] && p[field] !== 0) errors.push(`${where}: missing required field "${field}"`);
    }
    if (seenIds.has(p.id)) errors.push(`${where}: duplicate id ${p.id}`);
    seenIds.add(p.id);
    if (seenSlugs.has(p.slug)) errors.push(`${where}: duplicate slug "${p.slug}"`);
    seenSlugs.add(p.slug);
    if (p.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) {
      errors.push(`${where}: slug "${p.slug}" must be lowercase letters, numbers and hyphens only`);
    }
    if (p.category && !categoryNames.has(p.category)) {
      errors.push(`${where}: category "${p.category}" is not one of the known categories`);
    }
    // Reserved: a product slug that collides with a category slug would
    // overwrite the category page, since both live under /products/.
    if (categories.some((c) => c.slug === p.slug)) {
      errors.push(`${where}: slug "${p.slug}" collides with a category page URL`);
    }
    // Two kinds of image are legitimate. A path into public/ is a photo
    // committed to this repository; an https URL is one uploaded through
    // /admin/ and served from Supabase Storage. Anything else is a mistake
    // that would render as a broken image.
    if (p.image && !p.image.startsWith('/') && !/^https:\/\//.test(p.image)) {
      errors.push(
        `${where}: image "${p.image}" must start with "/" or be an https URL`);
    }
    if (p.image && p.image.startsWith('/') && !existsSync(path.join(ROOT, 'public', p.image))) {
      warnings.push(`${where}: image not found at public${p.image} — the card shows a fallback`);
    }
  }

  const catSlugs = new Set();
  for (const c of categories) {
    if (catSlugs.has(c.slug)) errors.push(`category "${c.name}": duplicate slug "${c.slug}"`);
    catSlugs.add(c.slug);
  }
}

/** Report anything the owner still needs to fill in. */
function configChecklist() {
  const missing = [];
  if (!/^\d{8,15}$/.test(String(siteConfig.whatsappNumber || '').trim())) {
    missing.push('whatsappNumber — WhatsApp buttons currently link to /contact/');
  }
  if (!siteConfig.phone) missing.push('phone — the "Call us" button is hidden');
  if (!siteConfig.email) missing.push('email');
  if (!siteConfig.address.city) missing.push('address');
  if (!siteConfig.googleAnalyticsId) {
    missing.push('googleAnalyticsId — no analytics script is being injected');
  }
  if (!Object.values(siteConfig.social).some(Boolean)) missing.push('social links');
  return missing;
}

/* ------------------------------------------------------------- emitting -- */

/**
 * The stylesheet is heavily commented because the next person to change it
 * needs the reasoning. A visitor on a phone in Kathmandu does not, and was
 * downloading roughly nine kilobytes of it on every page.
 *
 * Comments and blank lines only — no minifier, no dependency, every rule and
 * every value untouched, so what ships is still readable if anyone views
 * source. It walks the file rather than running a regex over it, because a
 * quoted value can contain the characters that open a comment and a regex
 * cannot tell the two apart.
 */
function stripCssComments(css) {
  let out = '';
  let quote = '';                 // the quote character we are inside, if any
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += css[++i] ?? ''; continue; }   // escaped char
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      i = close === -1 ? css.length : close + 1;
      continue;
    }
    out += c;
  }
  return out
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .join('\n') + '\n';
}

async function emit(routePath, html) {
  // '/products/x/' -> dist/products/x/index.html ; '/404.html' -> dist/404.html
  const isFile = routePath.endsWith('.html');
  const target = isFile
    ? path.join(DIST, routePath.replace(/^\//, ''))
    : path.join(DIST, routePath.replace(/^\//, ''), 'index.html');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, 'utf8');
  return target;
}

function sitemap(routes) {
  const base = siteConfig.domain.replace(/\/+$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const urls = routes
    .map(
      ({ path: p, priority, changefreq }) => `  <url>
    <loc>${base}${p}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function robots() {
  const base = siteConfig.domain.replace(/\/+$/, '');
  // /admin/ is disallowed to keep the console out of search results, which is
  // tidiness rather than security: robots.txt is a request, and anyone may
  // still open the page. It shows a sign-in form and nothing else until
  // Supabase authorises a session.
  return `User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${base}/sitemap.xml
`;
}

function webmanifest() {
  return JSON.stringify(
    {
      name: siteConfig.businessName,
      short_name: 'PowerKing',
      description: siteConfig.shortDescription,
      start_url: '/',
      display: 'standalone',
      background_color: '#FFFFFF',
      theme_color: siteConfig.themeColor,
      icons: [
        { src: '/images/brands/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/images/brands/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  );
}

/** Copy a directory recursively, reporting the byte total. */
async function copyDir(from, to) {
  if (!existsSync(from)) return 0;
  await cp(from, to, { recursive: true });
  let bytes = 0;
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else bytes += (await stat(full)).size;
    }
  };
  await walk(to);
  return bytes;
}

/* ------------------------------------------------------------------ run -- */

async function build() {
  const started = Date.now();
  log('\n  PowerKing Nepal — building site\n');

  // Supabase if it is configured and reachable, data/*.json otherwise. The
  // pages below cannot tell which, and do not need to.
  const catalogue = await loadCatalogue();
  const products = catalogue.products;
  const categories = catalogue.categories;
  for (const note of catalogue.notes) warnings.push(note);

  validate(products, categories);
  if (errors.length) {
    log('  ✗ Build failed. Fix these problems in src/data/products.js:\n');
    for (const e of errors) log(`      • ${e}`);
    log('');
    process.exitCode = 1;
    return;
  }

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const countsByCategory = {};
  for (const c of categories) {
    countsByCategory[c.name] = products.filter((p) => p.category === c.name).length;
  }
  const brands = [...new Set(products.map((p) => p.brand))].sort((a, b) => a.localeCompare(b));

  // Categories a buyer is offered. An empty category is a dead end — a chip
  // that filters to nothing, a tile reading "0 products" — so it is left out
  // of the navigation until it holds something. Its page is still built, so
  // any link already pointing at it keeps working.
  const listed = categories.filter((c) => countsByCategory[c.name] > 0);

  const routes = [];
  const add = (p, priority, changefreq = 'monthly') =>
    routes.push({ path: p, priority, changefreq });

  // --- static pages ---------------------------------------------------------
  await emit('/', homePage({ products, categories, countsByCategory }));
  add('/', '1.0', 'weekly');

  await emit('/products/', cataloguePage({ products, categories: listed, brands }));
  add('/products/', '0.9', 'weekly');

  // Pages 2..N exist for crawlers and for readers without JavaScript. With JS
  // the listing never leaves page one — "Show more" expands it in place.
  for (let page = 2; page <= Math.ceil(products.length / PAGE_SIZE); page++) {
    await emit(`/products/page/${page}/`, cataloguePage({ products, categories: listed, brands, page }));
    add(`/products/page/${page}/`, '0.4', 'weekly');
  }

  await emit('/about/', aboutPage());
  add('/about/', '0.6');

  await emit('/contact/', contactPage());
  add('/contact/', '0.8');

  await emit('/privacy/', privacyPage());
  add('/privacy/', '0.2', 'yearly');

  if (siteConfig.features.showBrandsPage) {
    await emit('/brands/', brandsPage({ products }));
    add('/brands/', '0.6');
  }

  // --- the private tools ----------------------------------------------------
  // None of these are passed to add(): they are tools for the people who run
  // the shop, so they stay out of the sitemap, carry a noindex and are
  // disallowed in robots.txt. That is not what protects them — a static host
  // cannot hide a file, and hiding is not a permission system. What protects
  // them is that they hold nothing: every byte of data arrives from Supabase,
  // authorised by Row Level Security against the reader's own session.
  await emit('/admin/login/', loginPage());
  for (const route of CONSOLE_ROUTES) {
    await emit(route.path, consolePage(route));
  }

  // The original GitHub-backed catalogue editor, kept and moved rather than
  // replaced. It writes product copy and photographs straight into this
  // repository, which is a different job from stock control and is still the
  // fastest way to do it — and it keeps working if Supabase is ever
  // unreachable, because it does not use it.
  await emit('/admin/catalogue/', adminPage());

  // 404.html is served by GitHub Pages for any unknown path.
  await emit('/404.html', notFoundPage());

  // --- category pages -------------------------------------------------------
  for (const category of categories) {
    const inCategory = products.filter((p) => p.category === category.name);
    await emit(
      `/products/${category.slug}/`,
      categoryPage({ category, products: inCategory, categories: listed, brands }),
    );
    add(`/products/${category.slug}/`, '0.7', 'weekly');
    for (let page = 2; page <= Math.ceil(inCategory.length / PAGE_SIZE); page++) {
      await emit(
        `/products/${category.slug}/page/${page}/`,
        categoryPage({ category, products: inCategory, categories: listed, brands, page }),
      );
      add(`/products/${category.slug}/page/${page}/`, '0.3', 'weekly');
    }
    if (!inCategory.length) {
      warnings.push(`category "${category.name}" has no products — its page shows an empty state`);
    }
  }

  // --- product pages --------------------------------------------------------
  for (const product of products) {
    const related = products
      .filter((p) => p.category === product.category && p.id !== product.id)
      .slice(0, 4);
    await emit(`/products/${product.slug}/`, productPage({ product, related }));
    add(`/products/${product.slug}/`, '0.8');
  }

  // --- assets ---------------------------------------------------------------
  await mkdir(path.join(DIST, 'assets'), { recursive: true });
  // Font declarations are prepended to the stylesheet rather than @import-ed,
  // so the page still needs only one CSS request.
  const fontCss = await readFile(path.join(ROOT, 'src/assets/css/fonts.css'), 'utf8');
  // base.css is the shared foundation — tokens, reset, type, buttons — and is
  // prepended to both stylesheets. Nothing else is shared: see the note at the
  // top of base.css for the bug that splitting it fixed.
  const baseCss = await readFile(path.join(ROOT, 'src/assets/css/base.css'), 'utf8');
  const siteCss = await readFile(path.join(ROOT, 'src/assets/css/styles.css'), 'utf8');
  await writeFile(
    path.join(DIST, 'assets/styles.css'),
    stripCssComments(`${fontCss}\n${baseCss}\n${siteCss}`),
    'utf8',
  );
  await cp(path.join(ROOT, 'src/assets/js/app.js'), path.join(DIST, 'assets/app.js'));
  await cp(path.join(ROOT, 'src/assets/js/catalogue.js'), path.join(DIST, 'assets/catalogue.js'));
  await cp(path.join(ROOT, 'src/assets/js/slider.js'), path.join(DIST, 'assets/slider.js'));
  await cp(path.join(ROOT, 'src/assets/js/admin.js'), path.join(DIST, 'assets/admin.js'));
  await cp(path.join(ROOT, 'src/assets/js/enquiry.js'), path.join(DIST, 'assets/enquiry.js'));
  // Loaded only by /admin/catalogue/, so the shop's own tool costs a shopper
  // nothing.
  await writeFile(
    path.join(DIST, 'assets/admin.css'),
    stripCssComments(await readFile(path.join(ROOT, 'src/assets/css/admin.css'), 'utf8')),
    'utf8',
  );
  // The console's stylesheet is complete on its own: fonts, the shared
  // foundation, then the console. It does NOT include styles.css, which is
  // what keeps the marketing pages' .card and .toolbar out of it.
  await writeFile(
    path.join(DIST, 'assets/console.css'),
    stripCssComments(
      `${fontCss}\n${baseCss}\n` +
      (await readFile(path.join(ROOT, 'src/assets/css/console.css'), 'utf8')),
    ),
    'utf8',
  );

  // The console's modules, copied as-is: they are ES modules the browser
  // imports from each other by relative path, so the directory shape has to
  // survive. No bundling, which also means one changed screen invalidates one
  // cached file rather than all of them.
  await cp(path.join(ROOT, 'src/assets/js/console'), path.join(DIST, 'assets/console'), {
    recursive: true,
  });

  // The Supabase project URL and anon key, written as a module the console
  // imports. Both are public by design; the service-role key is never read.
  // See src/config/supabase.config.js for why that is safe.
  await writeFile(path.join(DIST, 'assets/console/env.js'), envModule(), 'utf8');

  // public/ is copied last so anything there (CNAME, favicon, images) wins.
  await copyDir(path.join(ROOT, 'public'), DIST);

  // What this build was actually made from. scripts/check.js reads it rather
  // than re-reading the catalogue, so it verifies the site that exists rather
  // than a site built from whatever the database says a moment later.
  // Outside dist/, so it is never published.
  await mkdir(path.join(ROOT, '.build'), { recursive: true });
  await writeFile(
    path.join(ROOT, '.build/manifest.json'),
    JSON.stringify({
      builtAt: new Date().toISOString(),
      source: catalogue.source,
      supabaseConfigured: supabaseConfig.configured,
      products,
      categories,
      consoleRoutes: CONSOLE_ROUTES.map((r) => r.path),
    }, null, 2),
    'utf8',
  );

  // --- generated files ------------------------------------------------------
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(routes), 'utf8');
  await writeFile(path.join(DIST, 'robots.txt'), robots(), 'utf8');
  await writeFile(path.join(DIST, 'site.webmanifest'), webmanifest(), 'utf8');
  // Tells GitHub Pages to serve the directory as-is rather than run Jekyll.
  await writeFile(path.join(DIST, '.nojekyll'), '', 'utf8');

  /* ------------------------------------------------------------ report -- */
  log(`  ✓ ${routes.length + CONSOLE_ROUTES.length + 3} pages built in ${Date.now() - started}ms`);
  log(`      ${products.length} products · ${categories.length} categories · ${brands.length} brands`);
  log(catalogue.source === 'supabase'
    ? '      catalogue: read from Supabase'
    : '      catalogue: read from data/*.json');
  log(`      output: dist/`);

  if (warnings.length) {
    log('\n  ! Warnings:');
    for (const w of warnings) log(`      • ${w}`);
  }

  if (serviceRoleKeyMisplaced) {
    log('\n  ! SUPABASE_ANON_KEY looks like a service-role key.');
    log('      It has NOT been written into the build. A service-role key bypasses');
    log('      Row Level Security entirely and must never reach a browser. Use the');
    log('      anon / publishable key from Project Settings → API instead.');
  }
  log(
    supabaseConfig.configured
      ? `      inventory: connected to ${supabaseConfig.url}`
      : '      inventory: not configured — /admin/ explains what is missing,\n' +
        '                 and the public catalogue is running from data/*.json',
  );

  const missing = configChecklist();
  if (missing.length) {
    log('\n  → Still to configure in src/config/site.config.js:');
    for (const m of missing) log(`      • ${m}`);
  }

  log('');
}

build().catch((err) => {
  console.error('\n  ✗ Build error:\n', err);
  process.exitCode = 1;
});
