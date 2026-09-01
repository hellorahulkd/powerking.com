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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from '../src/data/products.js';
import { categories } from '../src/data/categories.js';
import { BRAND, icon as brandIcon, grille, platePath } from '../src/templates/brand.js';
import { artFor } from './product-art.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/images');

const VOLT = '#F3D74B';
const INK = '#1A1A1C';
const PAPER = '#F5F5F7';
const MUTED = '#86868B';

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

const FONT = 'Archivo, Inter, Helvetica, Arial, sans-serif';

function productTile(product) {
  // A generic drawing of the product type, centred on white like a product
  // shot. These are stand-ins: replace a product's `image` with a real
  // photograph and none of this is used for it any more.
  const art = artFor(product);
  if (!art) {
    // No drawing for this type yet — fall back to the category set in type.
    const lines = wrap(product.category, 13, 3);
    const startY = 400 - ((lines.length - 1) * 92) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${esc(
      product.category,
    )} — sample product image">
  <rect width="800" height="800" fill="#FFFFFF"/>
  <g font-family="${FONT}">${lines
    .map(
      (l, i) =>
        `<text x="400" y="${startY + i * 92}" text-anchor="middle" font-size="76"
       font-weight="900" letter-spacing="-2.5" fill="${INK}">${esc(l)}</text>`,
    )
    .join('')}</g>
</svg>
`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="Illustration of ${esc(
    product.name,
  )}">
  <rect width="800" height="800" fill="#FFFFFF"/>
  ${art}
</svg>
`;
}

/* -------------------------------------------------------------- brand ----- */

/**
 * The brand system's icon is the plate and the grille — no letters at all —
 * so the favicon no longer has to fall back to a cut-down initial. At 32px
 * and under the fine 3x3 grid silts up into a grey square, which is exactly
 * what the "Coarse" state in the brand canvas exists for.
 */
const faviconSvg = brandIcon({ size: 140, variant: 'coarse' }) + '\n';
const appIconSvg = brandIcon({ size: 512, variant: 'primary' }) + '\n';

/** Horizontal lockup for letterheads, invoices and packaging. */
const logoSvg = (() => {
  const H = 150, plateH = 104, cut = Math.round(plateH * (22 / 130));
  const g = 44, padX = 34, gap = 22;
  const wordW = 250;                       // Archivo 800 "pwrkng" at 46px
  const plateW = padX * 2 + g + gap + wordW;
  const width = plateW + 76;
  const y = (H - plateH) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img" aria-label="PowerKing Nepal logo">
  <rect width="${width}" height="${H}" fill="${BRAND.paper}"/>
  <g transform="translate(38 ${y})">
    <path d="${platePath(plateW, plateH, cut)}" fill="${BRAND.ink}"/>
    ${grille({ size: g, cell: BRAND.paper, live: BRAND.yellow, x: padX, y: (plateH - g) / 2 })}
    <text x="${padX + g + gap}" y="${plateH / 2 + 16}" font-family="Archivo, Inter, Arial, sans-serif"
          font-size="46" font-weight="800" letter-spacing="-0.92" fill="${BRAND.paper}">pwrkng</text>
  </g>
</svg>
`;
})();

/** Open Graph card — what a shared link looks like on WhatsApp and Facebook. */
const ogSvg = (() => {
  const plateW = 620, plateH = 150, cut = Math.round(plateH * (22 / 130));
  const g = 64, padX = 48, gap = 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${BRAND.paper}"/>
  <g transform="translate(98 150)">
    <path d="${platePath(plateW, plateH, cut)}" fill="${BRAND.ink}"/>
    ${grille({ size: g, cell: BRAND.paper, live: BRAND.yellow, x: padX, y: (plateH - g) / 2 })}
    <text x="${padX + g + gap}" y="${plateH / 2 + 24}" font-family="Archivo, Inter, Arial, sans-serif"
          font-size="68" font-weight="800" letter-spacing="-1.36" fill="${BRAND.paper}">pwrkng</text>
  </g>
  <text x="98" y="392" font-family="Archivo, Inter, Arial, sans-serif"
        font-size="23" font-weight="800" letter-spacing="4" fill="${BRAND.ink}">POWERKING NEPAL · ELECTRONICS WHOLESALE</text>
  <text x="98" y="452" font-family="Archivo, Inter, Arial, sans-serif"
        font-size="29" fill="#45454B">Speakers · Earbuds · Chargers · Cables · Multiplugs · Grooming</text>
  <rect y="0" width="1200" height="12"
        fill="url(#haz)"/>
  <defs>
    <pattern id="haz" width="45.25" height="45.25" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="22.6" height="45.25" fill="${BRAND.yellow}"/>
      <rect x="22.6" width="22.6" height="45.25" fill="${BRAND.ink}"/>
    </pattern>
  </defs>
</svg>
`;
})();

async function main() {
  await mkdir(path.join(OUT, 'products'), { recursive: true });
  await mkdir(path.join(OUT, 'brands'), { recursive: true });
  await mkdir(path.join(OUT, 'hero'), { recursive: true });

  let n = 0;
  for (const p of products) {
    // Products point at the rasterised .png (an <img>-loaded SVG cannot pull
    // in a webfont); the .svg beside it is the source rasterize.js converts.
    // That .svg is therefore the marker of a GENERATED tile: a real photograph
    // is a .png with no .svg next to it, and is never overwritten. Drop a photo
    // in and delete the .svg and this stops regenerating for that product.
    const svgPath = p.image.replace(/\.(png|jpe?g|webp)$/i, '.svg');
    if (!svgPath.endsWith('.svg')) continue;
    if (!p.sample
        && existsSync(path.join(ROOT, 'public', p.image))
        && !existsSync(path.join(ROOT, 'public', svgPath))) continue;
    await writeFile(path.join(ROOT, 'public', svgPath), productTile(p), 'utf8');
    n++;
  }

  await writeFile(path.join(OUT, 'hero/og-default.svg'), ogSvg, 'utf8');
  await writeFile(path.join(OUT, 'brands/powerking-nepal-logo.svg'), logoSvg, 'utf8');
  await writeFile(path.join(ROOT, 'public/favicon.svg'), faviconSvg, 'utf8');
  await writeFile(path.join(ROOT, 'public/app-icon.svg'), appIconSvg, 'utf8');

  process.stdout.write(`  ✓ ${n} product tiles + hero, logo, OG card, favicon\n`);
}

main();
