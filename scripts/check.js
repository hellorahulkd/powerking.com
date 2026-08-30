#!/usr/bin/env node
/**
 * Post-build verification. Runs in CI so a broken build never deploys.
 * Checks the generated HTML rather than trusting the templates.
 *
 *   node build.js && node scripts/check.js
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../src/config/site.config.js';
import { products } from '../src/data/products.js';
import { categories } from '../src/data/categories.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const failures = [];
let checks = 0;

function assert(name, condition, detail = '') {
  checks++;
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function html(route) {
  const file = route.endsWith('.html')
    ? path.join(DIST, route)
    : path.join(DIST, route, 'index.html');
  return readFile(file, 'utf8');
}

async function allHtmlFiles(dir = DIST, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await allHtmlFiles(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

async function main() {
  if (!existsSync(DIST)) {
    process.stderr.write('  ✗ dist/ does not exist — run `node build.js` first.\n');
    process.exitCode = 1;
    return;
  }

  const base = siteConfig.domain.replace(/\/+$/, '');
  const files = await allHtmlFiles();

  /* --------------------------------------------------- required files -- */
  for (const f of ['sitemap.xml', 'robots.txt', '404.html', '.nojekyll', 'CNAME',
                   'assets/styles.css', 'assets/app.js', 'assets/catalogue.js',
                   'images/brands/icon-192.png', 'site.webmanifest']) {
    assert(`dist/${f} exists`, existsSync(path.join(DIST, f)));
  }

  /* ---------------------------------------------------- page inventory -- */
  const expected = [
    '/', '/products/', '/about/', '/contact/', '/privacy/',
    ...(siteConfig.features.showBrandsPage ? ['/brands/'] : []),
    ...categories.map((c) => `/products/${c.slug}/`),
    ...products.map((p) => `/products/${p.slug}/`),
  ];
  for (const route of expected) {
    assert(`page ${route} was generated`, existsSync(path.join(DIST, route, 'index.html')));
  }
  assert('every generated HTML file is accounted for',
    files.length === expected.length + 1, `${files.length} files vs ${expected.length + 1} expected`);

  /* ------------------------------------------------------------- SEO -- */
  const titles = new Set();
  const descriptions = new Set();
  for (const file of files) {
    const rel = '/' + path.relative(DIST, file).replace(/index\.html$/, '');
    const doc = await readFile(file, 'utf8');

    const title = doc.match(/<title>([^<]+)<\/title>/)?.[1];
    assert(`${rel} has a <title>`, Boolean(title));
    const desc = doc.match(/<meta name="description" content="([^"]*)"/)?.[1];
    assert(`${rel} has a meta description`, Boolean(desc) && desc.length > 40, `len ${desc?.length}`);
    assert(`${rel} has a canonical URL`, /<link rel="canonical" href="https:\/\//.test(doc));
    assert(`${rel} has exactly one <h1>`, (doc.match(/<h1[\s>]/g) || []).length === 1,
      `${(doc.match(/<h1[\s>]/g) || []).length} found`);
    assert(`${rel} has Open Graph title/description/image/url`,
      /property="og:title"/.test(doc) && /property="og:description"/.test(doc) &&
      /property="og:image" content="https:\/\//.test(doc) && /property="og:url"/.test(doc));
    assert(`${rel} has a Twitter card`, /name="twitter:card"/.test(doc));
    assert(`${rel} has JSON-LD structured data`, /application\/ld\+json/.test(doc));
    assert(`${rel} declares a viewport`, /name="viewport"/.test(doc));

    // 404 is intentionally noindex and shares its title; everything else must
    // be unique or pages compete with each other in search results.
    if (!file.endsWith('404.html')) {
      assert(`${rel} title is unique`, !titles.has(title), title);
      titles.add(title);
      assert(`${rel} description is unique`, !descriptions.has(desc));
      descriptions.add(desc);
    }

    // No unescaped template leftovers.
    assert(`${rel} has no unrendered template placeholders`,
      !/\$\{|\[object Object\]|undefined<|>undefined/.test(doc));
    // Double-escaped entities mean a string was HTML-encoded twice — it shows
    // up to visitors as literal "&amp;" text.
    assert(`${rel} has no double-escaped entities`,
      !/&amp;(amp|lt|gt|quot|#39);/.test(doc),
      doc.match(/&amp;(amp|lt|gt|quot|#39);/)?.[0]);
  }

  /* --------------------------------------------- Open Graph image type -- */
  // WhatsApp/Facebook crawlers cannot render SVG previews.
  for (const file of files) {
    const doc = await readFile(file, 'utf8');
    const og = doc.match(/property="og:image" content="([^"]+)"/)?.[1] || '';
    assert(`${path.relative(DIST, file)} og:image is a raster format`,
      /\.(png|jpe?g|webp)$/i.test(og), og);
    const local = og.replace(base, '');
    assert(`og:image file exists for ${path.relative(DIST, file)}`,
      existsSync(path.join(DIST, local)), local);
  }

  /* -------------------------------------------------------- sitemap -- */
  const sitemap = await readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
  assert('sitemap uses the configured domain', sitemap.includes(`<loc>${base}/</loc>`));
  for (const p of products) {
    assert(`sitemap lists /products/${p.slug}/`,
      sitemap.includes(`${base}/products/${p.slug}/`));
  }
  assert('sitemap excludes the 404 page', !sitemap.includes('404.html'));
  const locCount = (sitemap.match(/<loc>/g) || []).length;
  assert('sitemap covers every indexable page', locCount === expected.length, `${locCount} entries`);

  const robots = await readFile(path.join(DIST, 'robots.txt'), 'utf8');
  assert('robots.txt points at the sitemap', robots.includes(`${base}/sitemap.xml`));

  /* -------------------------------------------------- internal links -- */
  // Catch typos in hrefs before visitors hit a 404.
  const seen = new Set();
  for (const file of files) {
    const doc = await readFile(file, 'utf8');
    for (const m of doc.matchAll(/href="(\/[^"#?]*)/g)) {
      seen.add(m[1]);
    }
    for (const m of doc.matchAll(/src="(\/[^"#?]*)/g)) {
      seen.add(m[1]);
    }
  }
  for (const link of seen) {
    const target = link.endsWith('/')
      ? path.join(DIST, link, 'index.html')
      : path.join(DIST, link);
    assert(`internal link ${link} resolves`, existsSync(target));
  }

  /* ----------------------------------------------------------- fonts -- */
  // The stylesheet is generated from src/assets/css/fonts.css, but the .woff2
  // files it points at live in public/fonts and are copied separately. If
  // scripts/fetch-fonts.js was never run, the build would still succeed and
  // the site would silently fall back to system fonts — catch that here.
  const builtCss = await readFile(path.join(DIST, 'assets/styles.css'), 'utf8');
  const fontUrls = [...builtCss.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map((m) => m[1]);
  assert('stylesheet declares @font-face rules', /@font-face/.test(builtCss));
  assert('stylesheet references at least two font files', fontUrls.length >= 2,
    `${fontUrls.length} found`);
  for (const f of [...new Set(fontUrls)]) {
    assert(`font file ${f} was published`, existsSync(path.join(DIST, f)));
  }
  // The two faces the pages preload must be the ones actually served.
  for (const preload of ['/fonts/archivo-latin.woff2', '/fonts/inter-latin.woff2']) {
    assert(`preloaded font ${preload} exists`, existsSync(path.join(DIST, preload)));
    assert(`preloaded font ${preload} is declared in CSS`, fontUrls.includes(preload));
  }

  /* -------------------------------------------------------- whatsapp -- */
  const productDoc = await html(`/products/${products[0].slug}/`);
  assert('product page includes WhatsApp CTAs', /data-wa-track/.test(productDoc));
  assert('product page passes the product name to analytics',
    productDoc.includes(`data-wa-product="${products[0].name}"`));
  if (/^\d{8,15}$/.test(String(siteConfig.whatsappNumber || '').trim())) {
    assert('WhatsApp links use wa.me with the configured number',
      productDoc.includes(`https://wa.me/${siteConfig.whatsappNumber}`));
    assert('product enquiry message is pre-filled with the product name',
      productDoc.includes(encodeURIComponent(products[0].name)));
  } else {
    assert('no broken wa.me links while the number is unconfigured',
      !/wa\.me\/(\?|"|\s)/.test(productDoc));
  }

  /* ---------------------------------------------------------- assets -- */
  for (const p of products) {
    assert(`image exists for "${p.name}"`, existsSync(path.join(DIST, p.image)), p.image);
  }
  const css = await stat(path.join(DIST, 'assets/styles.css'));
  const appJs = await stat(path.join(DIST, 'assets/app.js'));
  const catJs = await stat(path.join(DIST, 'assets/catalogue.js'));
  assert('CSS stays under 60KB', css.size < 60 * 1024, `${(css.size / 1024).toFixed(1)}KB`);
  assert('JS stays under 20KB total', appJs.size + catJs.size < 20 * 1024,
    `${((appJs.size + catJs.size) / 1024).toFixed(1)}KB`);

  const homeDoc = await html('/');
  assert('home page loads no third-party scripts when analytics is unset',
    Boolean(siteConfig.googleAnalyticsId) || !/googletagmanager/.test(homeDoc));
  assert('images below the fold are lazy-loaded', /loading="lazy"/.test(await html('/products/')));

  /* ----------------------------------------------------------- report -- */
  if (failures.length) {
    process.stdout.write(`\n  ✗ ${failures.length} of ${checks} checks failed:\n\n`);
    for (const f of failures) process.stdout.write(`      • ${f}\n`);
    process.stdout.write('\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(`\n  ✓ all ${checks} build checks passed\n\n`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
