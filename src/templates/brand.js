/**
 * ============================================================================
 *  POWERKING NEPAL — BRAND MARKS
 * ============================================================================
 *
 *  The pwrkng wordmark is drawn as geometry, not set in a typeface.
 *
 *  Why: a logo built from a licensed font is only ever as ownable as that
 *  font's licence, and it needs the font present to render — in Canva, in a
 *  print file, on a supplier's packaging artwork. These letterforms are plain
 *  SVG rectangles and polygons, so the mark is genuinely PowerKing's and
 *  renders identically everywhere with nothing to download.
 *
 *  ── METRICS ───────────────────────────────────────────────────────────────
 *  Lowercase, on a 128-unit em:
 *      y=0    ascender top (the k)
 *      y=28   x-height top
 *      y=100  baseline
 *      y=128  descender bottom (the p and g)
 *  Stems are a uniform 22 units. Terminals are flat; there are no curves.
 *
 *  ── THE GLITCH ────────────────────────────────────────────────────────────
 *  The signature treatment slices the wordmark into horizontal bands and
 *  displaces them, with a few torn streaks thrown clear of the letters.
 *
 *  The displacement table is HARD-CODED, never random. A logo that reshuffles
 *  itself on every build is not a logo — this way the mark is byte-identical
 *  in every render, print file and cached asset.
 *
 *  Amplitude scales with size (see glitchWordmark). Below roughly 20px the
 *  slices stop reading as an effect and start reading as blur, so the small
 *  sizes use the clean cut: same letterforms, no displacement.
 *
 *  ── THE K ─────────────────────────────────────────────────────────────────
 *  The k is the standalone symbol. Its arms are held off the stem by a gap —
 *  a spark gap, implying current jumping a contact without drawing the
 *  lightning bolt every electronics brand already owns.
 * ============================================================================
 */

const ASC = 0;      // ascender top
const XTOP = 28;    // x-height top
const BASE = 100;   // baseline
const DESC = 128;   // descender bottom
const STEM = 29;   // heavy cut — the mark is set at display weight
const TRACK = 5;    // very tight, so the word reads as a single solid block

const r = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const poly = (pts) => `<polygon points="${pts.map(([a, b]) => `${a},${b}`).join(' ')}"/>`;

/* --------------------------------------------------------------- glyphs -- */

const GLYPHS = {
  // stem drops to the descender; squared bowl sits on the baseline
  p: (x) => ({
    w: 82,
    svg: [
      r(x, XTOP, STEM, DESC - XTOP),
      r(x + 29, XTOP, 53, 29),        // bowl top
      r(x + 53, 57, 29, 14),          // bowl right wall
      r(x + 29, 71, 53, 29),          // bowl floor
    ].join(''),
  }),

  w: (x) => ({
    w: 112,
    svg: poly([
      [x, XTOP], [x + 31, XTOP], [x + 42, 76], [x + 49, 44], [x + 63, 44],
      [x + 70, 76], [x + 81, XTOP], [x + 112, XTOP], [x + 90, BASE],
      [x + 64, BASE], [x + 56, 66], [x + 48, BASE], [x + 22, BASE],
    ]),
  }),

  r: (x) => ({
    w: 58,
    svg: [
      r(x, XTOP, STEM, BASE - XTOP),
      r(x + 29, XTOP, 29, 29),        // shoulder
    ].join(''),
  }),

  // the signature glyph — full ascender, arms detached from the stem
  k: (x) => ({
    w: 84,
    svg:
      r(x, ASC, STEM, BASE - ASC) +
      `<path d="M ${x + 74} 40 L ${x + 46} 71 L ${x + 74} 100" fill="none"
         stroke="currentColor" stroke-width="${STEM}"
         stroke-linecap="butt" stroke-linejoin="miter"/>`,
  }),

  n: (x) => ({
    w: 82,
    svg: [
      r(x, XTOP, STEM, BASE - XTOP),
      r(x + 29, XTOP, 24, 29),        // shoulder
      r(x + 53, XTOP, STEM, BASE - XTOP),
    ].join(''),
  }),

  // single-storey g: bowl on the baseline, straight descender, tail to the left
  g: (x) => ({
    w: 82,
    svg: [
      r(x, XTOP, 82, 29),             // bowl top
      r(x, 57, STEM, 14),             // bowl left wall
      r(x + 53, 57, 29, 14),          // bowl right wall
      r(x, 71, 82, 29),               // bowl floor
      r(x + 53, 100, 29, 6),          // descender
      r(x + 10, 106, 72, 22),         // tail
    ].join(''),
  }),
};

/**
 * Wordmark outlines, undistorted.
 * @returns {{ width, height, svg }} in a 0..width × 0..128 box, `currentColor`.
 */
export function wordmarkGeometry(letters = 'pwrkng') {
  let x = 0;
  const parts = [];
  for (const ch of letters) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    const { w, svg } = glyph(x);
    parts.push(svg);
    x += w + TRACK;
  }
  return { width: x - TRACK, height: DESC, svg: parts.join('') };
}

/** The k alone, as the brand symbol. */
export function markKGeometry() {
  const { svg } = GLYPHS.k(0);
  return { width: 78, height: DESC, svg };
}

/* --------------------------------------------------------------- glitch -- */

/**
 * Fixed slice table. Each row is [yTop, height, dx] against the 128-unit em.
 * Hand-tuned, never generated — see the note at the top of this file.
 */
const SLICES = [
  [0, 19, 0], [19, 6, 6], [25, 15, -2], [40, 5, 8], [45, 19, 0],
  [64, 6, -5], [70, 14, 3], [84, 5, 7], [89, 17, -1], [106, 6, -6],
  [112, 16, 4],
];

/** Torn streaks thrown clear of the letters: [x, y, w, h, opacity]. */
const STREAKS = [
  [-22, 22, 30, 4, 0.8], [498, 47, 34, 4, 0.7], [-13, 72, 18, 3, 0.55],
  [506, 91, 24, 4, 0.75], [472, 16, 20, 3, 0.45], [-18, 112, 22, 3, 0.5],
];

/**
 * The wordmark with the static treatment applied.
 *
 * @param {object} o
 * @param {number} o.amount  0 = clean, 1 = full displacement. Scale this down
 *                           at small sizes; below ~20px tall the slices read
 *                           as blur rather than as an effect.
 * @param {string} o.id      unique id — two glitched marks on one page must
 *                           not share clipPath ids.
 */
export function glitchGeometry({ amount = 1, id = 'g', letters = 'pwrkng' } = {}) {
  const base = wordmarkGeometry(letters);
  if (amount <= 0) return base;

  const clips = SLICES.map(
    ([y, h], i) =>
      `<clipPath id="${id}s${i}"><rect x="-80" y="${y}" width="${
        base.width + 160
      }" height="${h}"/></clipPath>`,
  ).join('');

  const bands = SLICES.map(
    ([, , dx], i) =>
      `<g clip-path="url(#${id}s${i})" transform="translate(${(dx * amount).toFixed(
        2,
      )} 0)">${base.svg}</g>`,
  ).join('');

  const streaks = STREAKS.map(
    ([x, y, w, h, o]) =>
      `<rect x="${(x + 0).toFixed(1)}" y="${y}" width="${(w * amount).toFixed(
        1,
      )}" height="${h}" opacity="${(o * amount).toFixed(2)}"/>`,
  ).join('');

  return {
    width: base.width,
    height: base.height,
    svg: `<defs>${clips}</defs>${bands}${streaks}`,
  };
}

/* ------------------------------------------------------------ renderers -- */

/** Clean wordmark as a complete <svg>. */
export function wordmark({ height = 28, color = 'currentColor', letters = 'pwrkng' } = {}) {
  const g = wordmarkGeometry(letters);
  return `<svg viewBox="0 0 ${g.width} ${g.height}"
   width="${Math.round((height * g.width) / g.height)}" height="${height}"
   fill="${color}" color="${color}" aria-hidden="true">${g.svg}</svg>`;
}

/**
 * Glitched wordmark as a complete <svg>. The viewBox is padded so displaced
 * slices and streaks are not clipped at the edges.
 */
export function glitchWordmark({
  height = 40, color = 'currentColor', amount = 1, id = 'gw', letters = 'pwrkng',
} = {}) {
  const g = glitchGeometry({ amount, id, letters });
  const padX = 34;
  const vbW = g.width + padX * 2;
  return `<svg viewBox="${-padX} 0 ${vbW} ${g.height}"
   width="${Math.round((height * vbW) / g.height)}" height="${height}"
   fill="${color}" color="${color}" aria-hidden="true">${g.svg}</svg>`;
}

/** Standalone k symbol. */
export function markK({ size = 40, color = 'currentColor', pad = 14 } = {}) {
  const g = markKGeometry();
  const vbW = g.width + pad * 2;
  const vbH = BASE + pad * 2;
  return `<svg viewBox="0 0 ${vbW} ${vbH}" width="${size}" height="${Math.round(
    (size * vbH) / vbW,
  )}" fill="${color}" color="${color}" aria-hidden="true"><g transform="translate(${pad} ${pad})">${g.svg}</g></svg>`;
}

/** The k in a filled tile — app icon, favicon, sticker. Always the clean cut. */
export function markTile({ size = 40, bg = '#0A0B0F', fg = '#F3D74B', radius = 0.2 } = {}) {
  const g = markKGeometry();
  const box = 140;
  const scale = 82 / BASE;
  const gx = (box - g.width * scale) / 2;
  const gy = (box - BASE * scale) / 2;
  return `<svg viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" aria-hidden="true">
  <rect width="${box}" height="${box}" rx="${Math.round(box * radius)}" fill="${bg}"/>
  <g transform="translate(${gx} ${gy}) scale(${scale})" fill="${fg}" color="${fg}">${g.svg}</g>
</svg>`;
}

export const BRAND = { ASC, XTOP, BASE, DESC, STEM, TRACK };
