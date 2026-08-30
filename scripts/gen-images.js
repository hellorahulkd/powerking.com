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
import { icons } from '../src/templates/icons.js';
import { wordmarkGeometry, glitchGeometry, markKGeometry } from '../src/templates/brand.js';

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

/** Render a 24x24 icon from icons.js at an arbitrary size and colour. */
function bigIcon(name, { x, y, size, color = '#ffffff', width = 1.5 }) {
  const body = icons[name];
  if (!body) return '';
  const k = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${k})" color="${color}"
     stroke-width="${width}" opacity=".95">${body}</g>`;
}

const FONT = 'Space Grotesk, Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

function productTile(product) {
  const cat = categories.find((c) => c.name === product.category);
  const base = cat?.color || VOLT;
  const lines = wrap(product.name);
  const kScale = 34 / 100;

  const text = lines
    .map(
      (l, i) =>
        `<text x="400" y="${606 + i * 44}" text-anchor="middle" font-size="33"
       font-weight="700" fill="#fff">${esc(l)}</text>`,
    )
    .join('');

  // Flat by design: it reads as product signage, and flat colour is what lets
  // the PNG twin used for link previews stay a few KB instead of a few hundred.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${esc(
    product.name,
  )} — sample product image">
  <rect width="800" height="800" fill="${INK}"/>
  <rect width="800" height="800" fill="${base}" fill-opacity=".10"/>
  <rect y="0" width="800" height="10" fill="${base}"/>
  <circle cx="400" cy="330" r="188" fill="${base}" fill-opacity=".16"/>
  <circle cx="400" cy="330" r="188" fill="none" stroke="${base}" stroke-opacity=".55" stroke-width="3"/>
  <circle cx="400" cy="330" r="150" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="2"
          stroke-dasharray="10 14"/>
  ${bigIcon(cat?.icon || 'bolt', { x: 280, y: 210, size: 240, color: '#ffffff', width: 1.35 })}
  <g transform="translate(24 736) scale(${kScale})" fill="${VOLT}" color="${VOLT}">${KM.svg}</g>
  <text x="70" y="768" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        font-size="19" letter-spacing="4" fill="#6E7687">SAMPLE IMAGE</text>
  <g font-family="${FONT}">${text}</g>
</svg>
`;
}

/* --------------------------------------------------------------- hero ----- */
/** Product glyphs orbiting the K. */
function heroSvg() {
  const orbit = [
    { icon: 'speaker', color: '#00C2FF', x: 92, y: 96, r: 46 },
    { icon: 'earbuds', color: '#FF3D8B', x: 470, y: 74, r: 40 },
    { icon: 'charger', color: '#FF7A1A', x: 534, y: 300, r: 44 },
    { icon: 'cable', color: '#00D68F', x: 400, y: 470, r: 40 },
    { icon: 'plug', color: '#FFC400', x: 118, y: 420, r: 42 },
    { icon: 'headphone', color: '#A855F7', x: 28, y: 258, r: 40 },
  ];

  const nodes = orbit
    .map(
      (o) => `<g>
    <circle cx="${o.x + o.r}" cy="${o.y + o.r}" r="${o.r}" fill="${o.color}" fill-opacity=".14"/>
    <circle cx="${o.x + o.r}" cy="${o.y + o.r}" r="${o.r}" fill="none"
            stroke="${o.color}" stroke-opacity=".62" stroke-width="2"/>
    ${bigIcon(o.icon, {
      x: o.x + o.r * 0.42,
      y: o.y + o.r * 0.42,
      size: o.r * 1.16,
      color: o.color,
      width: 1.7,
    })}
  </g>`,
    )
    .join('\n');

  const kScale = 116 / 100;
  const kx = 320 - (KM.width * kScale) / 2;
  const ky = 278 - 58;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 560" width="640" height="560" role="img" aria-label="Illustration of wholesale consumer electronics: speakers, earbuds, chargers, cables and multiplugs">
  <defs>
    <radialGradient id="halo" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${VOLT}" stop-opacity=".38"/>
      <stop offset="1" stop-color="${VOLT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="320" cy="278" r="230" fill="url(#halo)"/>
  <circle cx="320" cy="278" r="176" fill="none" stroke="#fff" stroke-opacity=".13"
          stroke-width="1.5" stroke-dasharray="5 9"/>
  <circle cx="320" cy="278" r="232" fill="none" stroke="#fff" stroke-opacity=".08"
          stroke-width="1.5" stroke-dasharray="5 9"/>
  ${nodes}
  <g>
    <rect x="230" y="188" width="180" height="180" rx="38" fill="${VOLT}"/>
    <g transform="translate(${kx} ${ky}) scale(${kScale})" fill="${INK}" color="${INK}">${KM.svg}</g>
  </g>
</svg>
`;
}

/* -------------------------------------------------------------- brand ----- */
const WORD = wordmarkGeometry();
const GLITCH = glitchGeometry({ amount: 1, id: 'lg' });
const GLITCH_OG = glitchGeometry({ amount: 1, id: 'og' });
const KM = markKGeometry();
const KBASE = 100; // baseline of the k within the 128-unit em

/** The k in a volt tile — favicon and app icon. Always the clean cut. */
const faviconSvg = (() => {
  const box = 140;
  const scale = 86 / KBASE;
  const gx = (box - KM.width * scale) / 2;
  const gy = (box - KBASE * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}">
  <rect width="${box}" height="${box}" rx="25" fill="${VOLT}"/>
  <g transform="translate(${gx} ${gy}) scale(${scale})" fill="${INK}" color="${INK}">${KM.svg}</g>
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

  await writeFile(path.join(OUT, 'hero/hero-electronics.svg'), heroSvg(), 'utf8');
  await writeFile(path.join(OUT, 'hero/og-default.svg'), ogSvg, 'utf8');
  await writeFile(path.join(OUT, 'brands/powerking-nepal-logo.svg'), logoSvg, 'utf8');
  await writeFile(path.join(ROOT, 'public/favicon.svg'), faviconSvg, 'utf8');

  process.stdout.write(`  ✓ ${n} product tiles + hero, logo, OG card, favicon\n`);
}

main();
