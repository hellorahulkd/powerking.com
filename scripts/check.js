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
import { PAGE_SIZE } from '../src/pages/catalogue.js';
import { CONSOLE_ROUTES } from '../src/config/admin-routes.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const failures = [];
let checks = 0;

/**
 * What the build was made from, written by build.js.
 *
 * Read rather than re-derived: the catalogue may come from Supabase, and
 * re-reading it here would check the site against whatever the database says
 * now, not against what was actually published a second ago.
 */
const manifest = JSON.parse(
  await readFile(path.join(ROOT, '.build/manifest.json'), 'utf8'),
);
const { products, categories } = manifest;

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

  assert('the build recorded where its catalogue came from',
    ['supabase', 'json'].includes(manifest.source), manifest.source);

  /* --------------------------------------------------- required files -- */
  for (const f of ['sitemap.xml', 'robots.txt', '404.html', '.nojekyll', 'CNAME',
                   'assets/styles.css', 'assets/app.js', 'assets/catalogue.js', 'assets/slider.js',
                   'assets/enquiry.js', 'assets/admin.js', 'assets/admin.css',
                   'images/brands/icon-192.png', 'site.webmanifest']) {
    assert(`dist/${f} exists`, existsSync(path.join(DIST, f)));
  }

  /* ---------------------------------------------------- page inventory -- */
  // Listings past PAGE_SIZE products are split across /page/N/ — the path a
  // crawler or a reader without JS follows through the catalogue.
  const pagesFor = (count, base) => {
    const out = [];
    for (let n = 2; n <= Math.ceil(count / PAGE_SIZE); n++) out.push(`${base}page/${n}/`);
    return out;
  };

  // Pages that are built but must never be advertised: tools for the people
  // who run the shop, not content for a search engine. Every one of them is
  // asserted below to carry a noindex and to be absent from the sitemap.
  const NOT_INDEXED = [
    '/admin/login/',
    '/admin/catalogue/',
    ...CONSOLE_ROUTES.map((r) => r.path),
  ];
  // The console screens are drawn by JavaScript after the session has been
  // checked, so their HTML is a shell: no <h1> and no meta description worth
  // the name. They are noindex tools, so the SEO rules below would be
  // measuring the wrong thing — they get their own, stricter, checks instead.
  const isConsoleShell = (route) =>
    route.startsWith('/admin/') && route !== '/admin/catalogue/' && route !== '/admin/login/';

  const expected = [
    // /admin/ is emitted but deliberately kept out of the sitemap, so it is
    // listed here or the file count reports it as a stray. NOT_INDEXED below
    // is what keeps the two facts from drifting apart.
    '/', '/products/', '/about/', '/contact/', '/privacy/', ...NOT_INDEXED,
    ...(siteConfig.features.showBrandsPage ? ['/brands/'] : []),
    ...pagesFor(products.length, '/products/'),
    ...categories.flatMap((c) => [
      `/products/${c.slug}/`,
      ...pagesFor(products.filter((p) => p.category === c.name).length, `/products/${c.slug}/`),
    ]),
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

    if (isConsoleShell(rel)) {
      // What actually matters for a page nobody should find in Google.
      assert(`${rel} is noindex`, /<meta name="robots" content="noindex/.test(doc));
      assert(`${rel} names the module that fills it in`, /<main[^>]+data-page="[a-z-]+"/.test(doc));
      // One <main>, and one id="main". A page that emitted its own nested
      // inside the layout's gave the document two elements with the same id,
      // and document.querySelector('main') then returned the wrong one — the
      // header title rendered blank for a while because of exactly that.
      assert(`${rel} has exactly one <main>`, (doc.match(/<main[\s>]/g) || []).length === 1,
        `${(doc.match(/<main[\s>]/g) || []).length} found`);
      assert(`${rel} has exactly one id="main"`, (doc.match(/id="main"/g) || []).length === 1);
      assert(`${rel} loads the console as a module`,
        /<script type="module" src="\/assets\/console\/app\.js">/.test(doc));
      // The console must not load the public site's stylesheet. It did once,
      // for the design tokens, and silently inherited .card and .toolbar from
      // the marketing pages — a sticky filter bar offset by a header that is
      // not there, and cards that clipped their own dropdowns. The tokens now
      // live in base.css, which both stylesheets are built from.
      assert(`${rel} does not load the public stylesheet`,
        !/href="\/assets\/styles\.css"/.test(doc));
      assert(`${rel} loads the console stylesheet`,
        /href="\/assets\/console\.css"/.test(doc));
      assert(`${rel} says something useful without JavaScript`, /<noscript>/.test(doc));
      // A shell that shipped data would be a shell that leaked it. Everything
      // on these screens arrives from Supabase, authorised per reader.
      assert(`${rel} contains no product data`, !/data-product|"sku"|priceCarton/.test(doc));
      assert(`${rel} loads no marketing chrome`,
        !/class="site-header|class="site-footer|wa-float/.test(doc));
      continue;
    }

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

    assert(`${rel} has exactly one <main>`, (doc.match(/<main[\s>]/g) || []).length === 1,
      `${(doc.match(/<main[\s>]/g) || []).length} found`);

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
    const rel = '/' + path.relative(DIST, file).replace(/index\.html$/, '');
    if (isConsoleShell(rel)) continue;   // no social preview for a private tool
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
  assert('sitemap covers every indexable page',
    locCount === expected.length - NOT_INDEXED.length, `${locCount} entries`);
  for (const route of NOT_INDEXED) {
    assert(`sitemap excludes ${route}`, !sitemap.includes(`${base}${route}`));
    const html = await readFile(path.join(DIST, route, 'index.html'), 'utf8');
    assert(`${route} tells search engines not to index it`,
      /<meta name="robots" content="noindex/.test(html));
  }

  const robots = await readFile(path.join(DIST, 'robots.txt'), 'utf8');
  assert('robots.txt points at the sitemap', robots.includes(`${base}/sitemap.xml`));
  assert('robots.txt asks crawlers to leave /admin/ alone', /Disallow:\s*\/admin\//.test(robots));

  /* ------------------------------------------------ inventory console -- */
  // The console's own assets. A missing module here is a screen that loads
  // and then does nothing, which is the failure mode hardest to notice.
  for (const f of ['assets/console.css', 'assets/console/app.js', 'assets/console/client.js',
                   'assets/console/session.js', 'assets/console/ui.js', 'assets/console/format.js',
                   'assets/console/data.js', 'assets/console/login.js', 'assets/console/env.js']) {
    assert(`dist/${f} exists`, existsSync(path.join(DIST, f)));
  }
  for (const route of CONSOLE_ROUTES) {
    const shell = await readFile(path.join(DIST, route.path, 'index.html'), 'utf8');
    assert(`${route.path} names its module`, shell.includes(`data-page="${route.page}"`));
    const modulePath = path.join(DIST, 'assets/console/pages', `${route.page}.js`);
    assert(`the module for ${route.path} was published`, existsSync(modulePath),
      `assets/console/pages/${route.page}.js`);
  }

  // THE ONE THAT MATTERS MOST. A service-role key bypasses Row Level Security
  // completely, so it must never be in anything served to a browser. This
  // checks the built output rather than trusting the code that wrote it.
  const envJs = await readFile(path.join(DIST, 'assets/console/env.js'), 'utf8');
  // Checked against the exported values rather than the file's text: the file
  // explains in a comment that it never carries a service-role key, and a
  // search for the phrase would match the explanation. What matters is what
  // is assigned, so that is what is read.
  const exported = Object.fromEntries(
    [...envJs.matchAll(/export const (\w+) = ("([^"]*)"|true|false);/g)]
      .map((m) => [m[1], m[3] ?? m[2]]),
  );
  assert('the published Supabase config exports only the expected names',
    Object.keys(exported).sort().join(',') ===
      'CONFIGURED,SUPABASE_ANON_KEY,SUPABASE_BUCKET,SUPABASE_URL',
    Object.keys(exported).join(','));
  for (const [name, value] of Object.entries(exported)) {
    assert(`${name} holds no credential beyond the public key`,
      !/service[_-]?role|postgres:\/\/|-----BEGIN/i.test(String(value)), name);
  }
  const anonKey = exported.SUPABASE_ANON_KEY || '';
  if (anonKey.split('.').length === 3) {
    let role = '';
    try {
      role = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString('utf8')).role || '';
    } catch { /* not a JWT we can read; the regex above already checked the text */ }
    assert('the published key is not a service-role key', role !== 'service_role', role);
  }
  for (const file of await allHtmlFiles()) {
    const doc = await readFile(file, 'utf8');
    assert(`${path.relative(DIST, file)} carries no service-role key`,
      !/service_role/i.test(doc));
  }

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
  // Both stylesheets are built from base.css, so both must carry the tokens
  // and the button system; neither may carry the other's components.
  const consoleCss = await readFile(path.join(DIST, 'assets/console.css'), 'utf8');
  assert('the console stylesheet carries the design tokens', /--volt:/.test(consoleCss));
  assert('the console stylesheet carries the button system', /\.btn--primary/.test(consoleCss));
  assert('the console stylesheet declares its own fonts', /@font-face/.test(consoleCss));
  assert('the console stylesheet has none of the public site chrome',
    !/\.site-header|\.site-footer|\.wa-float|\.card__media/.test(consoleCss));

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
    // An https image lives in Supabase Storage and is not in dist/ to check.
    if (!p.image || !p.image.startsWith('/')) continue;
    assert(`image exists for "${p.name}"`, existsSync(path.join(DIST, p.image)), p.image);
  }
  const css = await stat(path.join(DIST, 'assets/styles.css'));
  const appJs = await stat(path.join(DIST, 'assets/app.js'));
  const catJs = await stat(path.join(DIST, 'assets/catalogue.js'));
  assert('CSS stays under 60KB', css.size < 60 * 1024, `${(css.size / 1024).toFixed(1)}KB`);
  const sliderJs = await stat(path.join(DIST, 'assets/slider.js'));
  const jsTotal = appJs.size + catJs.size + sliderJs.size;
  assert('JS stays under 24KB total', jsTotal < 24 * 1024, `${(jsTotal / 1024).toFixed(1)}KB`);

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
