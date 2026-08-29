#!/usr/bin/env node
/**
 * Generates the placeholder SVG artwork used while real product photography
 * is not yet available: one tile per sample product, plus the hero graphic
 * and brand marks.
 *
 * These are vector, a couple of KB each, and deliberately look like
 * placeholders — they are not stock photos pretending to be our products.
 *
 * Run:  node scripts/gen-images.js
 * You can delete this script once every product has a real photograph.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from '../src/data/products.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/images');

const PALETTE = {
  Beverages: ['#1B4E8F', '#3D82D1'],
  Snacks: ['#B0500E', '#E8940C'],
  Confectionery: ['#7A2E58', '#C4568F'],
  'Food & Grocery': ['#1E6B47', '#43A375'],
  'Personal Care': ['#245C74', '#4FA0B8'],
  Household: ['#4A3E86', '#8377C7'],
  Other: ['#3A4657', '#6E7E93'],
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Wrap a label onto at most 3 lines of ~15 characters. */
function wrap(text, width = 15, maxLines = 3) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  return lines;
}

function productTile(product) {
  const [dark, light] = PALETTE[product.category] || PALETTE.Other;
  const id = `g${product.id}`;
  const lines = wrap(product.name);
  const text = lines
    .map(
      (l, i) =>
        `<text x="400" y="${455 + i * 52}" text-anchor="middle" font-size="40" font-weight="700" fill="#fff" opacity=".95">${esc(
          l,
        )}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${esc(
    product.name,
  )} — sample product image">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <pattern id="p${id}" width="56" height="56" patternUnits="userSpaceOnUse">
      <path d="M0 0h56v56H0z" fill="none"/>
      <path d="M0 .5h56M.5 0v56" stroke="#fff" stroke-opacity=".07" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="800" height="800" fill="url(#${id})"/>
  <rect width="800" height="800" fill="url(#p${id})"/>
  <g opacity=".9">
    <path d="M400 150 610 258v216L400 582 190 474V258L400 150Z" fill="#fff" fill-opacity=".10"/>
    <path d="M400 150 610 258v216L400 582 190 474V258L400 150Z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="7" stroke-linejoin="round"/>
    <path d="M190 258 400 366l210-108M400 366v216" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="7" stroke-linejoin="round"/>
  </g>
  <text x="400" y="670" text-anchor="middle" font-size="26" font-weight="600" fill="#fff" opacity=".7" letter-spacing="4">SAMPLE IMAGE</text>
  <g font-family="Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif">${text}</g>
</svg>
`;
}

const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 560" width="640" height="560" role="img" aria-label="Illustration of stacked wholesale cartons on a pallet">
  <defs>
    <linearGradient id="box" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F0A93A"/><stop offset="1" stop-color="#D8830A"/>
    </linearGradient>
    <linearGradient id="box2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E3EAF4"/><stop offset="1" stop-color="#B4C2D6"/>
    </linearGradient>
    <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#00000033"/><stop offset="1" stop-color="#00000010"/>
    </linearGradient>
  </defs>
  <ellipse cx="320" cy="500" rx="245" ry="34" fill="#000" opacity=".25"/>
  <!-- pallet -->
  <g fill="#5C4326">
    <rect x="105" y="452" width="430" height="16" rx="3"/>
    <rect x="120" y="468" width="40" height="26" rx="3"/>
    <rect x="300" y="468" width="40" height="26" rx="3"/>
    <rect x="480" y="468" width="40" height="26" rx="3"/>
    <rect x="105" y="494" width="430" height="12" rx="3"/>
  </g>
  <!-- back row -->
  <g opacity=".85">
    <rect x="150" y="250" width="150" height="120" rx="5" fill="url(#box2)"/>
    <rect x="150" y="250" width="150" height="26" rx="5" fill="#fff" opacity=".45"/>
    <rect x="340" y="250" width="150" height="120" rx="5" fill="url(#box2)"/>
    <rect x="340" y="250" width="150" height="26" rx="5" fill="#fff" opacity=".45"/>
  </g>
  <!-- front row -->
  <g>
    <rect x="118" y="336" width="176" height="118" rx="6" fill="url(#box)"/>
    <rect x="118" y="336" width="176" height="118" rx="6" fill="url(#side)"/>
    <rect x="118" y="378" width="176" height="12" fill="#8C5405" opacity=".45"/>
    <rect x="196" y="336" width="20" height="118" fill="#8C5405" opacity=".35"/>
    <rect x="346" y="336" width="176" height="118" rx="6" fill="url(#box)"/>
    <rect x="346" y="336" width="176" height="118" rx="6" fill="url(#side)"/>
    <rect x="346" y="378" width="176" height="12" fill="#8C5405" opacity=".45"/>
    <rect x="424" y="336" width="20" height="118" fill="#8C5405" opacity=".35"/>
  </g>
  <!-- top box -->
  <g>
    <rect x="232" y="196" width="176" height="118" rx="6" fill="url(#box)"/>
    <rect x="232" y="196" width="176" height="118" rx="6" fill="url(#side)"/>
    <rect x="232" y="238" width="176" height="12" fill="#8C5405" opacity=".45"/>
    <rect x="310" y="196" width="20" height="118" fill="#8C5405" opacity=".35"/>
    <path d="M303 224l-24 32h13l-5 26 24-32h-13l5-26Z" fill="#2A1A02" opacity=".55"/>
  </g>
  <!-- bottles -->
  <g opacity=".9">
    <g fill="#7FD4F5">
      <rect x="452" y="252" width="26" height="82" rx="8"/>
      <rect x="484" y="252" width="26" height="82" rx="8"/>
    </g>
    <g fill="#2E4A66">
      <rect x="456" y="238" width="18" height="18" rx="4"/>
      <rect x="488" y="238" width="18" height="18" rx="4"/>
    </g>
    <rect x="452" y="282" width="58" height="20" fill="#E8940C" opacity=".85"/>
  </g>
</svg>
`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="320" height="80" role="img" aria-label="PowerKing Nepal logo">
  <rect width="320" height="80" fill="#0E1726"/>
  <g transform="translate(16 16)">
    <path d="M24 2 44 12.6v22.8L24 46 4 35.4V12.6L24 2Z" fill="#E8940C" fill-opacity=".16"/>
    <path d="M24 2 44 12.6v22.8L24 46 4 35.4V12.6L24 2Z" fill="none" stroke="#E8940C" stroke-width="2.6"/>
    <path d="M27.5 13 18 26h5.4l-2.2 10 9.5-13h-5.4l2.2-10Z" fill="#E8940C"/>
  </g>
  <g font-family="Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif" fill="#fff">
    <text x="76" y="42" font-size="25" font-weight="800" letter-spacing="-.5">PowerKing<tspan fill="#E8940C"> Nepal</tspan></text>
    <text x="77" y="59" font-size="9.5" font-weight="600" letter-spacing="2.6" fill="#8494A8">WHOLESALE DISTRIBUTION &amp; SUPPLY</text>
  </g>
</svg>
`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <rect width="48" height="48" rx="10" fill="#0E1726"/>
  <path d="M24 7 39 15.1v17.8L24 41 9 32.9V15.1L24 7Z" fill="none" stroke="#E8940C" stroke-width="2.4"/>
  <path d="M27 15 18.5 27H24l-2 10 9.5-12.5H26l1-9.5Z" fill="#E8940C"/>
</svg>
`;

/**
 * Open Graph fallback card (1200x630). Used when a page has no product image.
 * Written as SVG; see README for turning it into the PNG some crawlers prefer.
 */
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#16223A"/><stop offset="1" stop-color="#0E1726"/>
    </linearGradient>
    <radialGradient id="glow" cx=".82" cy=".16" r=".55">
      <stop offset="0" stop-color="#E8940C" stop-opacity=".30"/>
      <stop offset="1" stop-color="#E8940C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(88 210)">
    <path d="M30 0 60 15.8v34.4L30 66 0 50.2V15.8L30 0Z" fill="none" stroke="#E8940C" stroke-width="4"/>
    <path d="M34 17 22 34h7l-3 14 12-17h-7l3-14Z" fill="#E8940C"/>
  </g>
  <g font-family="Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif">
    <text x="88" y="356" font-size="82" font-weight="800" fill="#fff" letter-spacing="-2">PowerKing<tspan fill="#E8940C"> Nepal</tspan></text>
    <text x="92" y="410" font-size="28" font-weight="600" fill="#8FA0B6" letter-spacing="5">WHOLESALE DISTRIBUTION &amp; SUPPLY</text>
    <text x="92" y="480" font-size="30" fill="#C3CEDD">Browse the catalogue · Enquire on WhatsApp</text>
  </g>
  <rect x="88" y="524" width="196" height="8" rx="4" fill="#E8940C"/>
</svg>
`;

async function main() {
  await mkdir(path.join(OUT, 'products'), { recursive: true });
  await mkdir(path.join(OUT, 'brands'), { recursive: true });
  await mkdir(path.join(OUT, 'hero'), { recursive: true });

  let n = 0;
  for (const p of products) {
    if (!p.sample) continue; // never overwrite a real product photo
    const file = path.join(ROOT, 'public', p.image);
    if (!file.endsWith('.svg')) continue;
    await writeFile(file, productTile(p), 'utf8');
    n++;
  }

  await writeFile(path.join(OUT, 'hero/hero-crates.svg'), heroSvg, 'utf8');
  await writeFile(path.join(OUT, 'hero/og-default.svg'), ogSvg, 'utf8');
  await writeFile(path.join(OUT, 'brands/powerking-nepal-logo.svg'), logoSvg, 'utf8');
  await writeFile(path.join(ROOT, 'public/favicon.svg'), faviconSvg, 'utf8');

  process.stdout.write(`  ✓ generated ${n} sample product tiles + hero, logo, OG card, favicon\n`);
}

main();
