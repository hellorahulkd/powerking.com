#!/usr/bin/env node
/**
 * Rasterises the generated SVG artwork to PNG.
 *
 * Why PNG is needed: WhatsApp, Facebook and Messenger link-preview crawlers
 * do not render SVG. The Open Graph image and the app icons must therefore be
 * PNG files. Everything the browser displays stays SVG (much smaller).
 *
 * This is a one-off development step — the PNGs it produces are committed to
 * the repository, so the production build (`npm run build`) never needs a
 * browser and stays dependency-free.
 *
 * Requires a local Chrome/Chromium. Point CHROME_BIN at it if it is not on
 * PATH, then run:   node scripts/rasterize.js
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from '../src/data/products.js';
import { launch, newPage } from './dev/cdp.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  'chromium',
  'chromium-browser',
  'google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findChrome() {
  for (const c of CANDIDATES) {
    if (c.includes('/') ? existsSync(c) : true) return c;
  }
  return null;
}

/**
 * Screenshot an SVG file at an exact pixel size.
 *
 * Driven over CDP rather than Chrome's --screenshot flag so we can await
 * document.fonts.ready first. The wordmark is set in type, so a capture that
 * fires before the webfont loads bakes in a fallback face; and the plain flag
 * combined with --virtual-time-budget was also producing short captures with
 * a white band at the foot of the image.
 */
async function rasterize(page, svgPath, outPath, width, height) {
  const svg = await readFile(svgPath, 'utf8');
  const tmpDir = path.join(os.tmpdir(), 'pk-raster');
  await mkdir(tmpDir, { recursive: true });
  const htmlPath = path.join(tmpDir, `${path.basename(outPath)}.html`);

  const fontDir = path.join(ROOT, 'public/fonts');
  const faces = ['archivo-latin', 'inter-latin']
    .filter((f) => existsSync(path.join(fontDir, `${f}.woff2`)))
    .map(
      (f) => `@font-face{font-family:'${f.startsWith('archivo') ? 'Archivo' : 'Inter'}';
        font-weight:400 900;font-style:normal;font-display:block;
        src:url('file://${path.join(fontDir, `${f}.woff2`)}') format('woff2');}`,
    )
    .join('\n');

  await writeFile(
    htmlPath,
    `<!doctype html><meta charset="utf-8">
<style>
  ${faces}
  html,body{margin:0;padding:0;background:transparent;overflow:hidden}
  svg{display:block;width:${width}px;height:${height}px}
</style>${svg}`,
    'utf8',
  );

  await page.setViewport(width, height, false);
  await page.goto(`file://${htmlPath}`);
  await page.eval(`
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return 1;
  `);
  await page.screenshot(outPath);
  await rm(htmlPath, { force: true });
}

async function main() {
  const img = (p) => path.join(ROOT, 'public/images', p);
  const jobs = [
    // Open Graph / Twitter card — 1200x630 is accepted by every platform.
    [img('hero/og-default.svg'), img('hero/og-default.png'), 1200, 630],
    // Brand lockup for letterheads, invoices and packaging.
    [img('brands/powerking-nepal-logo.svg'), img('brands/powerking-nepal-logo.png'), 900, 300],
    // PWA + Apple touch icons + favicon.
    // The brand system reserves the coarse grille for 32px and under, where
    // the fine 3x3 grid silts up into a grey square. Anything larger takes
    // the primary icon.
    [path.join(ROOT, 'public/app-icon.svg'), img('brands/icon-192.png'), 192, 192],
    [path.join(ROOT, 'public/app-icon.svg'), img('brands/icon-512.png'), 512, 512],
    [path.join(ROOT, 'public/app-icon.svg'), img('brands/apple-touch-icon.png'), 180, 180],
    [path.join(ROOT, 'public/favicon.svg'), img('brands/favicon-48.png'), 48, 48],
  ];

  // A PNG for each generated product tile: an <img>-loaded SVG cannot pull in
  // a webfont, so the raster is what the site actually displays. The .svg is
  // only present for generated tiles, so a real photograph is never rasterised
  // over — see the matching note in gen-images.js.
  for (const p of products) {
    const svg = path.join(ROOT, 'public', p.image.replace(/\.(png|jpe?g|webp)$/i, '.svg'));
    if (!existsSync(svg)) continue;
    jobs.push([svg, svg.replace(/\.svg$/, '.png'), 600, 600]);
  }

  const { proc, port } = await launch();
  const page = await newPage(port);
  try {
    for (const [from, to, w, h] of jobs) {
      if (!existsSync(from)) continue;
      await mkdir(path.dirname(to), { recursive: true });
      await rasterize(page, from, to, w, h);
      process.stdout.write(`  ✓ ${path.relative(ROOT, to)}  (${w}x${h})\n`);
    }
  } finally {
    await page.close();
    proc.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
