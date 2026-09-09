#!/usr/bin/env node
/**
 * Crop the empty white margin out of product photographs.
 *
 *   node scripts/trim-images.js          # report what it would do
 *   node scripts/trim-images.js --write  # do it
 *
 * WHY
 *
 * A supplier's photograph is a product floating in a large white frame. Saved
 * as-is, the catalogue card shows a small product surrounded by white — the
 * card looks empty and the product looks cheap. Measured across the catalogue,
 * a third of the photographs used less than 70% of their own frame and the
 * worst used 14%.
 *
 * `object-fit: cover` cannot fix this: the white is inside the picture, not
 * around it, so cropping the box crops white either way. The margin has to
 * come out of the file.
 *
 * HOW
 *
 * Headless Chrome does the pixel work — there is no image library in this
 * project and there is not going to be one. Each photograph is drawn to a
 * canvas, scanned for the bounding box of everything that is not near-white,
 * then redrawn to fill a square with a small margin left around it.
 *
 * WHAT IT WILL NOT DO
 *
 * - Touch a photograph that already fills its frame (>= FILL_OK). Re-encoding
 *   a JPEG costs quality every time, so this is safe to run repeatedly.
 * - Touch one where the scan finds almost nothing, or nearly everything. Both
 *   mean the scan failed rather than that the picture is unusual, and a bad
 *   crop is worse than a wide margin.
 * - Change any file name, so nothing in data/products.json has to move.
 */
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newPage } from './dev/cdp.js';
import { products } from '../src/data/products.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(ROOT, 'public');

/** Anything lighter than this on all three channels counts as background. */
const WHITE = 246;
/**
 * How much bigger the product has to end up before the file is rewritten.
 *
 * Fraction-of-frame is the wrong test and the first run proved it: a wide
 * product already filling 73% of a wide frame "fills" only 62% of a square,
 * so squaring it made the product smaller while the number said otherwise.
 * What matters is the scale the product is drawn at. Below this, re-encoding
 * would cost quality and win nothing.
 */
const MIN_GAIN = 1.15;
/** Below this, the scan found nothing sensible — a blank or near-blank file. */
const FILL_MIN = 0.002;
/** Above this the scan found the whole frame, so there was no margin to cut. */
const FILL_MAX = 0.995;
/** Breathing room left around the product, as a fraction of the square. */
const MARGIN = 0.04;
const SIZE = 600;
const QUALITY = 0.9;

const write = process.argv.includes('--write');

const wanted = [...new Set(products.map((p) => p.image).filter(Boolean))];

const { proc, port } = await launch();
const page = await newPage(port);
await page.goto(`http://localhost:${process.env.PORT || 4321}/`);

let trimmed = 0;
let skipped = 0;
const failures = [];

for (const url of wanted) {
  const file = path.join(PUBLIC, url.replace(/^\//, ''));
  if (!existsSync(file)) { failures.push(`${url} — no such file`); continue; }

  // Loaded from the dev server by its own URL rather than shipped in as a
  // data URL: a 70KB photograph becomes a 95KB string inside the expression,
  // and doing that 87 times over the debugging protocol stalls the run.
  const result = await page.eval(`
    const img = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      // Nothing here can be allowed to hang: the caller awaits this promise,
      // and an image event that never fires waits for ever.
      setTimeout(() => res(null), 8000);
      i.src = ${JSON.stringify(url)};
    });
    if (!img || !img.width) return { error: 'could not be decoded' };

    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    // Flatten onto white first: a PNG with transparency reads as (0,0,0,0),
    // which is not near-white and would defeat the scan entirely.
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);

    const d = g.getImageData(0, 0, c.width, c.height).data;
    let top = c.height, left = c.width, right = -1, bottom = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] > ${WHITE} && d[i+1] > ${WHITE} && d[i+2] > ${WHITE}) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    if (bottom < 0) return { error: 'is blank' };

    const cw = right - left + 1, ch = bottom - top + 1;
    const fill = (cw * ch) / (c.width * c.height);
    if (fill < ${FILL_MIN}) return { skip: 'almost nothing found', fill };
    if (fill > ${FILL_MAX}) return { skip: 'already edge to edge', fill };

    // How much bigger the product ends up, measured against the size it is
    // drawn at now rather than against the frame it sits in.
    const box = ${SIZE} * (1 - ${MARGIN} * 2);
    const scale = Math.min(box / cw, box / ch);
    const now = Math.min(${SIZE} / c.width, ${SIZE} / c.height);
    const gain = scale / now;
    if (gain < ${MIN_GAIN}) return { skip: 'already close to filling', fill, gain };

    const out = document.createElement('canvas');
    out.width = ${SIZE}; out.height = ${SIZE};
    const o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, ${SIZE}, ${SIZE});
    o.imageSmoothingQuality = 'high';
    const w = cw * scale, h = ch * scale;
    o.drawImage(img, left, top, cw, ch, (${SIZE} - w) / 2, (${SIZE} - h) / 2, w, h);
    return {
      fill, gain,
      data: out.toDataURL('image/jpeg', ${QUALITY}),
    };
  `);

  if (result.error) { failures.push(`${url} — ${result.error}`); continue; }
  if (result.skip) {
    skipped++;
    continue;
  }

  process.stdout.write(
    `  ${result.gain.toFixed(1)}x bigger  ${url}\n`);
  trimmed++;

  if (write) {
    const b64 = result.data.split(',')[1];
    await writeFile(file, Buffer.from(b64, 'base64'));
  }
}

proc.kill();

process.stdout.write(`\n  ${trimmed} to trim, ${skipped} already close to filling`);
process.stdout.write(write ? ' — written.\n' : ' — dry run, pass --write.\n');
if (failures.length) {
  process.stdout.write(`\n  ${failures.length} could not be read:\n`);
  for (const f of failures) process.stdout.write(`      • ${f}\n`);
}
