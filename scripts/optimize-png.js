#!/usr/bin/env node
/**
 * Minimal, dependency-free PNG re-encoder.
 *
 * Chrome's screenshot PNGs are written for speed, not size: always RGBA and
 * lightly compressed. This re-encodes them properly —
 *   • drops the alpha channel when an image is fully opaque (−25% of the data)
 *   • picks the best filter per scanline instead of a fixed one
 *   • deflates at maximum effort
 *   • strips every ancillary chunk
 *
 * Typically 6–12x smaller on flat artwork, pixel-for-pixel identical output.
 *
 * Usage:  node scripts/optimize-png.js [dir-or-file ...]
 *         (defaults to public/images)
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/* ------------------------------------------------------------ CRC32 ----- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/* ------------------------------------------------------------ decode ---- */
function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('no IHDR');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`unsupported PNG (depth ${depth}, colorType ${colorType})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));

  // Undo the per-scanline filters.
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: break;
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, bpp, stride, pixels: out };
}

/* ------------------------------------------------------------ encode ---- */
function encode({ width, height, bpp, stride, pixels }) {
  // Fully opaque RGBA → RGB.
  let outBpp = bpp;
  let data = pixels;
  let outStride = stride;
  if (bpp === 4) {
    let opaque = true;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 255) { opaque = false; break; }
    }
    if (opaque) {
      outBpp = 3;
      outStride = width * 3;
      data = Buffer.alloc(height * outStride);
      for (let p = 0, q = 0; p < pixels.length; p += 4, q += 3) {
        data[q] = pixels[p];
        data[q + 1] = pixels[p + 1];
        data[q + 2] = pixels[p + 2];
      }
    }
  }

  // Filter each scanline with whichever of the five filters yields the
  // smallest sum of absolute differences (the standard PNG heuristic).
  const filtered = Buffer.alloc(height * (outStride + 1));
  const candidate = Buffer.alloc(outStride);
  for (let y = 0; y < height; y++) {
    const cur = data.subarray(y * outStride, (y + 1) * outStride);
    const prev = y > 0 ? data.subarray((y - 1) * outStride, y * outStride) : null;
    let bestType = 0;
    let bestScore = Infinity;
    let best = null;

    for (let type = 0; type <= 4; type++) {
      let score = 0;
      for (let x = 0; x < outStride; x++) {
        const a = x >= outBpp ? cur[x - outBpp] : 0;
        const b = prev ? prev[x] : 0;
        const c = prev && x >= outBpp ? prev[x - outBpp] : 0;
        let v;
        switch (type) {
          case 0: v = cur[x]; break;
          case 1: v = cur[x] - a; break;
          case 2: v = cur[x] - b; break;
          case 3: v = cur[x] - ((a + b) >> 1); break;
          default: {
            const p = a + b - c;
            const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            v = cur[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          }
        }
        v &= 0xff;
        candidate[x] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
        best = Buffer.from(candidate);
      }
    }
    filtered[y * (outStride + 1)] = bestType;
    best.copy(filtered, y * (outStride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = outBpp === 4 ? 6 : 2;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = zlib.deflateSync(filtered, { level: 9, memLevel: 9, windowBits: 15 });
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* --------------------------------------------------------------- run ---- */
async function collect(target, acc) {
  const s = await stat(target);
  if (s.isDirectory()) {
    for (const e of await readdir(target)) await collect(path.join(target, e), acc);
  } else if (target.toLowerCase().endsWith('.png')) {
    acc.push(target);
  }
  return acc;
}

async function main() {
  const targets = process.argv.slice(2);
  const roots = targets.length ? targets : [path.join(ROOT, 'public/images')];
  const files = [];
  for (const r of roots) await collect(path.resolve(r), files);

  let before = 0;
  let after = 0;
  for (const file of files.sort()) {
    const buf = await readFile(file);
    try {
      const out = encode(decode(buf));
      before += buf.length;
      if (out.length < buf.length) {
        await writeFile(file, out);
        after += out.length;
        process.stdout.write(
          `  ✓ ${path.relative(ROOT, file)}  ${kb(buf.length)} → ${kb(out.length)}\n`,
        );
      } else {
        after += buf.length;
      }
    } catch (e) {
      process.stdout.write(`  – ${path.relative(ROOT, file)} skipped (${e.message})\n`);
    }
  }
  if (before) {
    process.stdout.write(
      `\n  Total ${kb(before)} → ${kb(after)}  (${Math.round((1 - after / before) * 100)}% smaller)\n`,
    );
  }
}

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

main().catch((e) => { console.error(e); process.exitCode = 1; });
