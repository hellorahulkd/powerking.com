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
import { BRAND, icon as brandIcon, grille, platePath, LOCKUP, GRILLE_BOX }
  from '../src/templates/brand.js';
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
 * The horizontal lockup in SVG, for the letterhead and the social card.
 * Every offset is one of the brand deck's ratios against the POWERKING size,
 * so this cut and the CSS one in brand.js stay in step by construction.
 *
 * ELECTRONICS uses textLength/lengthAdjust to spread its letters to exactly
 * POWERKING's width — the SVG equivalent of the deck placing each letter by
 * hand, and of the justified run in the HTML lockup.
 */
function lockupSvg(F, { pad = 0 } = {}) {
  const L = LOCKUP;
  const unit = L.cellToFont * F;
  const gw = GRILLE_BOX.w * unit;
  const gh = GRILLE_BOX.h * unit;
  const wordW = L.wordToFont * F;
  const padX = L.padX * F;
  const padY = L.padY * F;

  const plateW = padX * 2 + gw + L.gap * F + wordW;
  const plateH = padY * 2 + gh;
  const cut = plateH * (22 / 130);

  const textX = padX + gw + L.gap * F;
  const sub = L.subScale * F;
  // Cap height of Archivo is ~0.72em; the two lines are centred on the grille.
  const blockH = 0.72 * F + 0.55 * sub + 0.72 * sub;
  const top = padY + (gh - blockH) / 2;
  const wordBase = top + 0.72 * F;
  const subBase = wordBase + 0.55 * sub + 0.72 * sub;

  return {
    w: plateW + pad * 2,
    h: plateH + pad * 2,
    svg: `<g transform="translate(${pad} ${pad})">
    <path d="${platePath(plateW, plateH, cut)}" fill="${BRAND.ink}"/>
    ${grille({ unit, cell: BRAND.paper, live: BRAND.yellow, x: padX, y: padY })}
    <text x="${textX.toFixed(1)}" y="${wordBase.toFixed(1)}"
          font-family="Archivo, Inter, Arial, sans-serif" font-size="${F}" font-weight="800"
          letter-spacing="${(L.tracking * F).toFixed(2)}" fill="${BRAND.paper}">POWERKING</text>
    <text x="${textX.toFixed(1)}" y="${subBase.toFixed(1)}" textLength="${wordW.toFixed(1)}"
          lengthAdjust="spacing"
          font-family="Archivo, Inter, Arial, sans-serif" font-size="${sub.toFixed(1)}"
          font-weight="800" fill="${BRAND.paper}">ELECTRONICS</text>
  </g>`,
  };
}

const faviconSvg = brandIcon({ size: 140, variant: 'coarse' }) + '\n';
const appIconSvg = brandIcon({ size: 512, variant: 'primary' }) + '\n';

/** Horizontal lockup for letterheads, invoices and packaging. */
const logoSvg = (() => {
  const l = lockupSvg(40, { pad: 38 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.w.toFixed(0)} ${l.h.toFixed(0)}"
     width="${l.w.toFixed(0)}" height="${l.h.toFixed(0)}" role="img" aria-label="PowerKing Electronics logo">
  <rect width="${l.w.toFixed(0)}" height="${l.h.toFixed(0)}" fill="${BRAND.paper}"/>
  ${l.svg}
</svg>
`;
})();

/** Open Graph card — what a shared link looks like on WhatsApp and Facebook. */
const ogSvg = (() => {
  const l = lockupSvg(54);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <pattern id="haz" width="45.25" height="45.25" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="22.6" height="45.25" fill="${BRAND.yellow}"/>
      <rect x="22.6" width="22.6" height="45.25" fill="${BRAND.ink}"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="${BRAND.paper}"/>
  <g transform="translate(98 ${(178).toFixed(0)})">${l.svg}</g>
  <text x="98" y="392" font-family="Archivo, Inter, Arial, sans-serif"
        font-size="24" font-weight="800" letter-spacing="4" fill="${BRAND.ink}">WHOLESALE · KATHMANDU, NEPAL</text>
  <text x="98" y="446" font-family="Archivo, Inter, Arial, sans-serif"
        font-size="29" fill="#45454B">Speakers · Earbuds · Chargers · Cables · Multiplugs · Grooming</text>
  <rect y="0" width="1200" height="12" fill="url(#haz)"/>
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
