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
 * - Spend bytes a crop has not earned. Re-encoding costs weight — flat vector
 *   art rendered to PNG cost seven times its original size to gain a tenth of
 *   its scale — and a catalogue read on Nepali mobile data cannot pay that.
 * - Change any file name, so nothing in data/products.json has to move. That
 *   also means it must re-encode in the format the name promises: writing
 *   JPEG bytes into a .png leaves the server sending image/png for a JPEG,
 *   which browsers sniff past but stricter clients are entitled to reject.
 */
import { writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newPage } from './dev/cdp.js';
import { products } from '../src/data/products.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(ROOT, 'public');

/**
 * How far a pixel has to be from the backdrop colour to count as the product.
 *
 * "Near-white" was too narrow a definition of backdrop and the first pass
 * proved it: a speaker photographed on a grey gradient has no white in it at
 * all, so the scan found content in every corner and cropped nothing, while
 * the card still showed a small product in a large empty frame. The backdrop
 * is now whatever the four corners agree on — white, grey, a soft gradient —
 * and only a photograph whose corners disagree (a real shop shelf) is left
 * alone, which is the right answer for those.
 */
const TOLERANCE = 26;
/** How much the corners may differ from each other and still be a backdrop. */
const CORNER_AGREEMENT = 30;
/**
 * How much bigger the product has to end up before the file is rewritten.
 *
 * Fraction-of-frame is the wrong test and the first run proved it: a wide
 * product already filling 73% of a wide frame "fills" only 62% of a square,
 * so squaring it made the product smaller while the number said otherwise.
 * What matters is the scale the product is drawn at. Below this, re-encoding
 * would cost quality and win nothing.
 */
const MIN_GAIN = 1.03;
/** Below this, the scan found nothing sensible — a blank or near-blank file. */
const FILL_MIN = 0.002;
/** Above this the scan found the whole frame, so there was no margin to cut. */
const FILL_MAX = 0.995;
/** Breathing room left around the product, as a fraction of the square. */
const MARGIN = 0.02;
const SIZE = 600;
/**
 * JPEG quality. Cropping enlarges the product, so a re-encode costs bytes
 * even as it removes pixels; at 0.9 the worst photograph doubled in weight.
 * 0.85 is indistinguishable on a product photograph and gives most of that
 * back — this catalogue is read on phones on Nepali mobile data.
 */
const QUALITY = 0.85;

/**
 * How much bigger the file may get, per unit of scale the product gains.
 *
 * A crop that makes the product 70% bigger has earned some weight; one that
 * makes it 10% bigger has not earned seven times the bytes. Written as an
 * allowance rather than a flat cap so a photograph with a genuinely huge
 * margin still gets cropped.
 */
const BYTES_PER_GAIN = 4;

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
  // Re-encode as whatever the file name says it is. A PNG kept as a PNG
  // costs more bytes for a photograph, but the alternative is a file whose
  // contents and Content-Type disagree.
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';

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
    const at = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i+1], d[i+2]]; };
    const dist = (a, b) => Math.max(
      Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

    // The backdrop, taken from the four corners rather than assumed to be
    // white. A patch, not a pixel, so one stray speck cannot define it.
    const patch = (x0, y0) => {
      let r = 0, gg = 0, b = 0, n = 0;
      for (let y = y0; y < y0 + 6; y++) {
        for (let x = x0; x < x0 + 6; x++) {
          const p = at(x, y); r += p[0]; gg += p[1]; b += p[2]; n++;
        }
      }
      return [r / n, gg / n, b / n];
    };
    const corners = [
      patch(0, 0), patch(c.width - 6, 0),
      patch(0, c.height - 6), patch(c.width - 6, c.height - 6),
    ];
    const spread = Math.max(...corners.map((a) => Math.max(...corners.map((b) => dist(a, b)))));
    if (spread > ${CORNER_AGREEMENT}) {
      return { skip: 'photographed against a real scene, not a backdrop' };
    }
    const bg = [0, 1, 2].map((k) => corners.reduce((t, p) => t + p[k], 0) / 4);

    let top = c.height, left = c.width, right = -1, bottom = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (dist(at(x, y), bg) <= ${TOLERANCE}) continue;
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
    // Paint the backdrop the photograph's own colour, so the margin left
    // around the product matches the picture instead of banding against it.
    o.fillStyle = 'rgb(' + bg.map(Math.round).join(',') + ')';
    o.fillRect(0, 0, ${SIZE}, ${SIZE});
    o.imageSmoothingQuality = 'high';
    const w = cw * scale, h = ch * scale;
    o.drawImage(img, left, top, cw, ch, (${SIZE} - w) / 2, (${SIZE} - h) / 2, w, h);
    return {
      fill, gain,
      data: out.toDataURL(${JSON.stringify(mime)}, ${QUALITY}),
    };
  `);

  if (result.error) { failures.push(`${url} — ${result.error}`); continue; }
  if (result.skip) {
    skipped++;
    continue;
  }

  const bytes = Buffer.from(result.data.split(',')[1], 'base64');
  const before = statSync(file).size;
  const growth = bytes.length / before;
  const allowed = 1 + (result.gain - 1) * BYTES_PER_GAIN;
  if (growth > allowed) {
    skipped++;
    process.stdout.write(
      `  skipped   ${url}\n`
      + `            ${result.gain.toFixed(1)}x bigger would cost `
      + `${growth.toFixed(1)}x the bytes\n`);
    continue;
  }

  process.stdout.write(
    `  ${result.gain.toFixed(1)}x bigger  ${url}  `
    + `(${(before / 1024).toFixed(0)}KB → ${(bytes.length / 1024).toFixed(0)}KB)\n`);
  trimmed++;

  if (write) await writeFile(file, bytes);
}

proc.kill();

process.stdout.write(`\n  ${trimmed} to trim, ${skipped} already close to filling`);
process.stdout.write(write ? ' — written.\n' : ' — dry run, pass --write.\n');
if (failures.length) {
  process.stdout.write(`\n  ${failures.length} could not be read:\n`);
  for (const f of failures) process.stdout.write(`      • ${f}\n`);
}
