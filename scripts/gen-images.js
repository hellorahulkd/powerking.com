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

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/images');

const BRAND_CYAN = '#00C2FF';
const BRAND_VIOLET = '#7C5CFF';
const INK = '#0A0E27';

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
  const base = cat?.color || BRAND_CYAN;
  const dark = shade(base, -0.55);
  const mid = shade(base, -0.15);
  const id = `p${product.id}`;
  const lines = wrap(product.name);

  const text = lines
    .map(
      (l, i) =>
        `<text x="400" y="${592 + i * 46}" text-anchor="middle" font-size="34"
       font-weight="700" fill="#fff" opacity=".97">${esc(l)}</text>`,
    )
    .join('');

  // Deliberately flat (no smooth gradients): it reads as clean modern product
  // signage, and flat colour is what lets the PNG twin used for social
  // previews compress to a few KB instead of a couple of hundred.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${esc(
    product.name,
  )} — sample product image">
  <rect width="800" height="800" fill="${mid}"/>
  <path d="M0 470 800 300V800H0Z" fill="${dark}" fill-opacity=".55"/>
  <circle cx="400" cy="322" r="188" fill="${shade(base, 0.16)}" fill-opacity=".18"/>
  <circle cx="400" cy="322" r="188" fill="none" stroke="#fff" stroke-opacity=".30" stroke-width="3"/>
  <circle cx="400" cy="322" r="150" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"
          stroke-dasharray="10 14"/>
  ${bigIcon(cat?.icon || 'bolt', { x: 280, y: 210, size: 240, width: 1.35 })}
  <text x="400" y="700" text-anchor="middle" font-size="22" font-weight="600"
        fill="#fff" opacity=".62" letter-spacing="5" font-family="${FONT}">SAMPLE IMAGE</text>
  <g font-family="${FONT}">${text}</g>
</svg>
`;
}

/* --------------------------------------------------------------- hero ----- */
/** Orbiting product glyphs around a power core. */
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
    <circle cx="${o.x + o.r}" cy="${o.y + o.r}" r="${o.r}" fill="${o.color}" fill-opacity=".16"/>
    <circle cx="${o.x + o.r}" cy="${o.y + o.r}" r="${o.r}" fill="none"
            stroke="${o.color}" stroke-opacity=".65" stroke-width="2"/>
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 560" width="640" height="560" role="img" aria-label="Illustration of wholesale consumer electronics: speakers, earbuds, chargers, cables and multiplugs">
  <defs>
    <linearGradient id="core" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND_CYAN}"/><stop offset="1" stop-color="${BRAND_VIOLET}"/>
    </linearGradient>
    <radialGradient id="halo" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${BRAND_CYAN}" stop-opacity=".45"/>
      <stop offset="1" stop-color="${BRAND_CYAN}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <circle cx="320" cy="278" r="230" fill="url(#halo)"/>
  <circle cx="320" cy="278" r="176" fill="none" stroke="#fff" stroke-opacity=".14"
          stroke-width="1.5" stroke-dasharray="5 9"/>
  <circle cx="320" cy="278" r="232" fill="none" stroke="#fff" stroke-opacity=".09"
          stroke-width="1.5" stroke-dasharray="5 9"/>

  ${nodes}

  <!-- power core -->
  <g>
    <rect x="234" y="192" width="172" height="172" rx="46" fill="url(#core)"/>
    <rect x="234" y="192" width="172" height="172" rx="46" fill="none"
          stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
    <circle cx="320" cy="280" r="52" fill="none" stroke="#fff" stroke-opacity=".45"
            stroke-width="7" stroke-linecap="round" stroke-dasharray="212 115"
            transform="rotate(-115 320 280)"/>
    <path d="M334 224 292 289h23l-10 47 43-67h-23l9-45Z" fill="#fff"/>
  </g>
</svg>
`;
}

/* -------------------------------------------------------------- brand ----- */
const markDefs = `<linearGradient id="m" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND_CYAN}"/><stop offset="1" stop-color="${BRAND_VIOLET}"/>
    </linearGradient>`;

const markGroup = (s) => `<g transform="scale(${s / 40})">
    <rect width="40" height="40" rx="11" fill="url(#m)"/>
    <circle cx="20" cy="20.5" r="11.5" fill="none" stroke="#fff" stroke-opacity=".38"
            stroke-width="2.4" stroke-linecap="round" stroke-dasharray="47 25"
            transform="rotate(-115 20 20.5)"/>
    <path d="M23.4 7.6 14 22.2h5.1l-2.3 10.4 9.6-14.9h-5.2l2.2-10.1Z" fill="#fff"/>
  </g>`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 88" width="340" height="88" role="img" aria-label="PowerKing Nepal logo">
  <defs>${markDefs}
    <linearGradient id="w" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BRAND_CYAN}"/><stop offset="1" stop-color="${BRAND_VIOLET}"/>
    </linearGradient>
  </defs>
  <rect width="340" height="88" fill="${INK}"/>
  <g transform="translate(18 20)">${markGroup(48)}</g>
  <g font-family="${FONT}" fill="#fff">
    <text x="80" y="47" font-size="27" font-weight="700" letter-spacing="-.6">PowerKing<tspan fill="url(#w)"> Nepal</tspan></text>
    <text x="81" y="65" font-size="9.5" font-weight="600" letter-spacing="2.7" fill="#8B93C9">ELECTRONICS WHOLESALE &amp; SUPPLY</text>
  </g>
</svg>
`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <defs>${markDefs}</defs>
  <g transform="translate(4 4)">${markGroup(40)}</g>
</svg>
`;

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>${markDefs}
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141A3D"/><stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <radialGradient id="gc" cx=".86" cy=".12" r=".6">
      <stop offset="0" stop-color="${BRAND_CYAN}" stop-opacity=".42"/>
      <stop offset="1" stop-color="${BRAND_CYAN}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gv" cx=".06" cy=".95" r=".6">
      <stop offset="0" stop-color="${BRAND_VIOLET}" stop-opacity=".40"/>
      <stop offset="1" stop-color="${BRAND_VIOLET}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="w2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BRAND_CYAN}"/><stop offset="1" stop-color="${BRAND_VIOLET}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#gc)"/>
  <rect width="1200" height="630" fill="url(#gv)"/>
  <g transform="translate(88 150)">${markGroup(96)}</g>
  <g font-family="${FONT}">
    <text x="88" y="358" font-size="80" font-weight="700" fill="#fff" letter-spacing="-2">PowerKing<tspan fill="url(#w2)"> Nepal</tspan></text>
    <text x="92" y="410" font-size="27" font-weight="600" fill="#8B93C9" letter-spacing="4.5">ELECTRONICS WHOLESALE &amp; SUPPLY</text>
    <text x="92" y="474" font-size="29" fill="#C6CEEA">Speakers · Earbuds · Chargers · Cables · Multiplugs</text>
  </g>
  <rect x="92" y="516" width="210" height="8" rx="4" fill="url(#w2)"/>
</svg>
`;

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
