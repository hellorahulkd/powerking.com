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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from '../src/data/products.js';

const run = promisify(execFile);
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

/** Screenshot an SVG file at an exact pixel size. */
async function rasterize(chrome, svgPath, outPath, width, height) {
  const svg = await readFile(svgPath, 'utf8');
  const tmpDir = path.join(os.tmpdir(), 'pk-raster');
  await mkdir(tmpDir, { recursive: true });
  const htmlPath = path.join(tmpDir, `${path.basename(outPath)}.html`);

  // A wrapper page pins the SVG to exactly width x height with no margin,
  // so the screenshot has no white gutter.
  await writeFile(
    htmlPath,
    `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:transparent}
  svg{display:block;width:${width}px;height:${height}px}
</style>${svg}`,
    'utf8',
  );

  await run(chrome, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${width},${height}`,
    `--screenshot=${outPath}`,
    `file://${htmlPath}`,
  ]).catch((e) => {
    // Chrome writes noise to stderr even on success; only a missing file is fatal.
    if (!existsSync(outPath)) throw e;
  });

  await rm(htmlPath, { force: true });
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    process.stderr.write(
      '  ✗ No Chrome/Chromium found. Set CHROME_BIN=/path/to/chrome and re-run.\n' +
        '    (The committed PNGs are still valid — this step is only needed after\n' +
        '     you change the SVG artwork.)\n',
    );
    process.exitCode = 1;
    return;
  }

  const img = (p) => path.join(ROOT, 'public/images', p);
  const jobs = [
    // Open Graph / Twitter card — 1200x630 is the format every platform accepts.
    [img('hero/og-default.svg'), img('hero/og-default.png'), 1200, 630],
    // PWA + Apple touch icons.
    [path.join(ROOT, 'public/favicon.svg'), img('brands/icon-192.png'), 192, 192],
    [path.join(ROOT, 'public/favicon.svg'), img('brands/icon-512.png'), 512, 512],
    [path.join(ROOT, 'public/favicon.svg'), img('brands/apple-touch-icon.png'), 180, 180],
  ];

  // A PNG twin for each sample product tile, so shared product links preview.
  for (const p of products) {
    if (!p.sample || !p.image.endsWith('.svg')) continue;
    const svg = path.join(ROOT, 'public', p.image);
    if (!existsSync(svg)) continue;
    // 600px is comfortably above every platform's preview requirement and
    // keeps these placeholder files small in the repository.
    jobs.push([svg, svg.replace(/\.svg$/, '.png'), 600, 600]);
  }

  for (const [from, to, w, h] of jobs) {
    await mkdir(path.dirname(to), { recursive: true });
    await rasterize(chrome, from, to, w, h);
    process.stdout.write(`  ✓ ${path.relative(ROOT, to)}  (${w}x${h})\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
