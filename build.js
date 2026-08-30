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
import { products as rawProducts } from './src/data/products.js';
import { categories } from './src/data/categories.js';
import { slugifyCategory } from './src/templates/components.js';
import { homePage } from './src/pages/home.js';
import { cataloguePage, categoryPage } from './src/pages/catalogue.js';
import { productPage } from './src/pages/product.js';
import { aboutPage } from './src/pages/about.js';
import { contactPage } from './src/pages/contact.js';
import { brandsPage, privacyPage, notFoundPage } from './src/pages/misc.js';

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
function validate(products) {
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
      errors.push(
        `${where}: category "${p.category}" is not defined in src/data/categories.js`,
      );
    }
    // Reserved: a product slug that collides with a category slug would
    // overwrite the category page, since both live under /products/.
    if (categories.some((c) => c.slug === p.slug)) {
      errors.push(`${where}: slug "${p.slug}" collides with a category page URL`);
    }
    if (p.image && !p.image.startsWith('/')) {
      errors.push(`${where}: image "${p.image}" must start with "/" (e.g. /images/products/x.jpg)`);
    }
    if (p.image && !existsSync(path.join(ROOT, 'public', p.image))) {
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
  return `User-agent: *
Allow: /

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

  const products = [...rawProducts];
  validate(products);
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

  const routes = [];
  const add = (p, priority, changefreq = 'monthly') =>
    routes.push({ path: p, priority, changefreq });

  // --- static pages ---------------------------------------------------------
  await emit('/', homePage({ products, categories, countsByCategory }));
  add('/', '1.0', 'weekly');

  await emit('/products/', cataloguePage({ products, categories, brands }));
  add('/products/', '0.9', 'weekly');

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

  // 404.html is served by GitHub Pages for any unknown path.
  await emit('/404.html', notFoundPage());

  // --- category pages -------------------------------------------------------
  for (const category of categories) {
    const inCategory = products.filter((p) => p.category === category.name);
    await emit(
      `/products/${category.slug}/`,
      categoryPage({ category, products: inCategory, categories, brands }),
    );
    add(`/products/${category.slug}/`, '0.7', 'weekly');
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
  const siteCss = await readFile(path.join(ROOT, 'src/assets/css/styles.css'), 'utf8');
  await writeFile(path.join(DIST, 'assets/styles.css'), `${fontCss}\n${siteCss}`, 'utf8');
  await cp(path.join(ROOT, 'src/assets/js/app.js'), path.join(DIST, 'assets/app.js'));
  await cp(path.join(ROOT, 'src/assets/js/catalogue.js'), path.join(DIST, 'assets/catalogue.js'));
  await cp(path.join(ROOT, 'src/assets/js/slider.js'), path.join(DIST, 'assets/slider.js'));

  // public/ is copied last so anything there (CNAME, favicon, images) wins.
  await copyDir(path.join(ROOT, 'public'), DIST);

  // --- generated files ------------------------------------------------------
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(routes), 'utf8');
  await writeFile(path.join(DIST, 'robots.txt'), robots(), 'utf8');
  await writeFile(path.join(DIST, 'site.webmanifest'), webmanifest(), 'utf8');
  // Tells GitHub Pages to serve the directory as-is rather than run Jekyll.
  await writeFile(path.join(DIST, '.nojekyll'), '', 'utf8');

  /* ------------------------------------------------------------ report -- */
  log(`  ✓ ${routes.length + 1} pages built in ${Date.now() - started}ms`);
  log(`      ${products.length} products · ${categories.length} categories · ${brands.length} brands`);
  log(`      output: dist/`);

  if (warnings.length) {
    log('\n  ! Warnings:');
    for (const w of warnings) log(`      • ${w}`);
  }

  const missing = configChecklist();
  if (missing.length) {
    log('\n  → Still to configure in src/config/site.config.js:');
    for (const m of missing) log(`      • ${m}`);
  }

  const sampleCount = products.filter((p) => p.sample).length;
  if (sampleCount) {
    log(`\n  → ${sampleCount} sample products are still in src/data/products.js.`);
    log('     Replace them with your real catalogue, then set');
    log('     features.showSampleDataNotice to false in the config.');
  }
  log('');
}

build().catch((err) => {
  console.error('\n  ✗ Build error:\n', err);
  process.exitCode = 1;
});
