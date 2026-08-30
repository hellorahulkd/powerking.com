#!/usr/bin/env node
/**
 * Generates the placeholder artwork used until real product photography is
 * available: one tile per sample product, plus the hero graphic, logo lockup,
 * favicon and Open Graph card.
 *
 * Everything is vector (a few KB each) and deliberately reads as a
 * placeholder — these are not stock photos pretending to be our stock.
 *
 * Product tiles are coloured from their category's `color` in
 * src/data/categories.js, so the catalogue looks alive rather than grey.
 *
 * Run:  node scripts/gen-images.js
 * Delete this script once every product has a real photograph.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from '../src/data/products.js';
import { categories } from '../src/data/categories.js';
import { wordmarkGeometry, glitchGeometry } from '../src/templates/brand.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/images');

const VOLT = '#F3D74B';
const INK = '#000000';
const INK_800 = '#101012';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Mix a hex colour toward black (t<0) or white (t>0). */
function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)),
  );
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Wrap a label onto at most 3 lines. */
function wrap(text, width = 17, maxLines = 3) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width && line) {
      lines.push(line.trim());
      line = w;
    } else line = (line + ' ' + w).trim();
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  return lines;
}

const FONT = 'Space Grotesk, Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

function productTile(product) {
  const cat = categories.find((c) => c.name === product.category);
  const base = cat?.color || VOLT;
  // The card already prints the product name directly beneath the image, so
  // the placeholder carries the category instead — no duplication.
  const lines = wrap(product.category, 12, 3);

  const text = lines
    .map(
      (l, i) =>
        `<text x="64" y="${300 + i * 104}" font-size="92" font-weight="900"
       letter-spacing="-3" fill="#fff">${esc(l)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${esc(
    product.category,
  )} — sample product image">
  <rect width="800" height="800" fill="${INK}"/>
  <rect y="0" width="800" height="26" fill="${base}"/>
  <text x="64" y="150" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="26" letter-spacing="8" fill="${base}">${esc(
    (product.brand || '').toUpperCase(),
  )}</text>
  <g font-family="${FONT}">${text}</g>
  <text x="64" y="726" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="24" letter-spacing="6" fill="#74747E">SAMPLE IMAGE</text>
  <rect x="64" y="748" width="150" height="10" fill="${base}"/>
</svg>
`;
}

/* -------------------------------------------------------------- brand ----- */
const WORD = wordmarkGeometry();
const GLITCH = glitchGeometry({ amount: 1, id: 'lg' });
const GLITCH_OG = glitchGeometry({ amount: 1, id: 'og' });
/**
 * Favicon and app icon: the "p" cut from the wordmark itself. A full
 * "pwrkng" is illegible at 32px, so the logotype's initial stands in — the
 * standard way a wordmark-only brand gets a square mark. No symbol invented.
 */
const P = wordmarkGeometry('p');
const faviconSvg = (() => {
  const box = 140;
  const scale = 116 / 128;
  const gx = (box - P.width * scale) / 2;
  const gy = (box - 128 * scale) / 2 - 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}">
  <rect width="${box}" height="${box}" fill="${VOLT}"/>
  <g transform="translate(${gx} ${gy}) scale(${scale})" fill="${INK}" color="${INK}">${P.svg}</g>
</svg>
`;
})();

/** Horizontal lockup for letterheads, invoices and packaging. */
const logoSvg = (() => {
  const scale = 62 / GLITCH.height;
  const width = Math.round(GLITCH.width * scale + 150);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 150" width="${width}" height="150" role="img" aria-label="PowerKing Nepal logo">
  <rect width="${width}" height="150" fill="${INK}"/>
  <g transform="translate(75 34) scale(${scale})" fill="${VOLT}" color="${VOLT}">${GLITCH.svg}</g>
  <text x="76" y="126" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="11" letter-spacing="3.6" fill="#74747E">POWERKING NEPAL · ELECTRONICS WHOLESALE</text>
</svg>
`;
})();

/** Open Graph card — what a shared link looks like on WhatsApp and Facebook. */
const ogSvg = (() => {
  const scale = 168 / GLITCH_OG.height;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="#fff" fill-opacity=".055"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="${INK}"/>
  <rect width="1200" height="630" fill="url(#scan)"/>
  <g transform="translate(132 176) scale(${scale})" fill="${VOLT}" color="${VOLT}">${GLITCH_OG.svg}</g>
  <text x="98" y="446" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="23" letter-spacing="7" fill="#8A8A94">POWERKING NEPAL · ELECTRONICS WHOLESALE</text>
  <text x="98" y="508" font-family="Space Grotesk, Inter, Arial, sans-serif"
        font-size="29" fill="#D2D2D8">Speakers · Earbuds · Chargers · Cables · Multiplugs</text>
  <rect x="98" y="546" width="230" height="8" fill="${VOLT}"/>
  <rect y="0" width="1200" height="6" fill="${VOLT}"/>
</svg>
`;
})();

async function main() {
  await mkdir(path.join(OUT, 'products'), { recursive: true });
  await mkdir(path.join(OUT, 'brands'), { recursive: true });
  await mkdir(path.join(OUT, 'hero'), { recursive: true });

  let n = 0;
  for (const p of products) {
    if (!p.sample) continue; // never overwrite a real product photo
    if (!p.image.endsWith('.svg')) continue;
    await writeFile(path.join(ROOT, 'public', p.image), productTile(p), 'utf8');
    n++;
  }

  await writeFile(path.join(OUT, 'hero/og-default.svg'), ogSvg, 'utf8');
  await writeFile(path.join(OUT, 'brands/powerking-nepal-logo.svg'), logoSvg, 'utf8');
  await writeFile(path.join(ROOT, 'public/favicon.svg'), faviconSvg, 'utf8');

  process.stdout.write(`  ✓ ${n} product tiles + hero, logo, OG card, favicon\n`);
}

main();
