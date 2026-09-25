#!/usr/bin/env node
/**
 * The link preview.
 *
 * A shared link is often the first thing a buyer sees of the shop, and every
 * chat app frames the card differently: Facebook and Twitter show the full
 * 1200x630, WhatsApp and an Instagram DM pull the middle towards a square and
 * throw the sides away. This measures the card as Chrome actually draws it —
 * webfont and all — and fails if any of the artwork would be lost in that
 * square, which is what used to chop the P off POWERKING.
 *
 * Run:  node scripts/dev/og-test.js
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, openSync, readSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newPage } from './cdp.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CARD_W = 1200;
const CARD_H = 630;
/** The square a DM preview keeps: as tall as the card, centred. */
const SAFE_X0 = (CARD_W - CARD_H) / 2;
const SAFE_X1 = CARD_W - SAFE_X0;

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** Pixel size straight out of a PNG's IHDR chunk. */
function pngSize(file) {
  if (!existsSync(file)) return null;
  const head = Buffer.alloc(24);
  const fd = openSync(file, 'r');
  try {
    if (readSync(fd, head, 0, 24, 0) < 24) return null;
  } finally {
    closeSync(fd);
  }
  if (head.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/** The @font-face block rasterize.js uses, so the measurement matches the render. */
function faces() {
  const dir = path.join(ROOT, 'public/fonts');
  return ['archivo-latin', 'inter-latin']
    .filter((f) => existsSync(path.join(dir, `${f}.woff2`)))
    .map(
      (f) => `@font-face{font-family:'${f.startsWith('archivo') ? 'Archivo' : 'Inter'}';
        font-weight:400 900;font-style:normal;font-display:block;
        src:url('file://${path.join(dir, `${f}.woff2`)}') format('woff2');}`,
    )
    .join('\n');
}

const svgPath = path.join(ROOT, 'public/images/hero/og-default.svg');
const pngPath = path.join(ROOT, 'public/images/hero/og-default.png');

console.log('\nThe card a shared link shows');

const size = pngSize(pngPath);
check('the crawler is served a PNG, not the SVG it cannot read', !!size);
check(
  'at the 1200x630 every platform accepts',
  !!size && size.width === CARD_W && size.height === CARD_H,
  size ? `${size.width}x${size.height}` : 'missing',
);

const { proc, port } = await launch();
const page = await newPage(port);
const tmp = path.join(os.tmpdir(), 'pk-og-test.html');
try {
  await mkdir(path.dirname(tmp), { recursive: true });
  await writeFile(
    tmp,
    `<!doctype html><meta charset="utf-8">
<style>${faces()}
html,body{margin:0;padding:0}
svg{display:block;width:${CARD_W}px;height:${CARD_H}px}</style>
${await readFile(svgPath, 'utf8')}`,
    'utf8',
  );
  await page.setViewport(CARD_W, CARD_H, false);
  await page.goto(`file://${tmp}`);

  const box = await page.eval(`
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const safe = document.querySelector('#safe');
    if (!safe) return null;
    const b = safe.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  `);

  check('the artwork is grouped so it can be measured', !!box);
  if (box) {
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    check(
      'nothing is lost when a DM crops the card square',
      box.x >= SAFE_X0 && right <= SAFE_X1,
      `spans ${box.x.toFixed(0)}..${right.toFixed(0)}, square keeps ${SAFE_X0}..${SAFE_X1}`,
    );
    check(
      'and it sits centred, so neither side is cut first',
      Math.abs((box.x + right) / 2 - CARD_W / 2) <= 6,
      `centre ${((box.x + right) / 2).toFixed(1)}`,
    );
    check(
      'it clears the hazard stripes top and bottom',
      box.y >= 12 && bottom <= CARD_H - 12,
      `spans ${box.y.toFixed(0)}..${bottom.toFixed(0)}`,
    );
    check(
      'and still fills the card rather than floating in it',
      box.w >= 380,
      `${box.w.toFixed(0)}px wide`,
    );
  }

  // The square crop itself, to look at.
  const shot = path.join(os.tmpdir(), 'pk-og-square.png');
  await page.setViewport(CARD_H, CARD_H, false);
  await page.eval(`
    document.querySelector('svg').style.marginLeft = '${-SAFE_X0}px';
    return 1;
  `);
  await page.screenshot(shot);
  console.log(`\n  square crop written to ${shot}`);
} finally {
  await rm(tmp, { force: true });
  await page.close();
  proc.kill();
}

console.log('\n' + '-'.repeat(60));
if (fails.length) {
  console.log(`  ${fails.length} FAILED, ${pass} passed`);
  for (const f of fails) console.log(`    ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log(`  All ${pass} link-preview checks passed`);
}
