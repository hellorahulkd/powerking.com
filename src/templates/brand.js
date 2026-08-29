/**
 * ============================================================================
 *  POWERKING NEPAL — BRAND MARKS
 * ============================================================================
 *
 *  The PWRKNG wordmark is drawn as geometry, not set in a typeface.
 *
 *  Why: a logo built from a licensed font is only ever as ownable as the
 *  licence behind it, and it needs that font present to render. These
 *  letterforms are pure SVG rectangles and polygons on a 100-unit cap height,
 *  so the mark is genuinely PowerKing's, renders identically in every browser,
 *  email client and print file, and needs nothing downloaded.
 *
 *  The construction is a squared industrial grotesk: uniform 22-unit stems,
 *  flat terminals, no curves. It reads as engineered hardware rather than
 *  software, which is the point.
 *
 *  ── THE K ─────────────────────────────────────────────────────────────────
 *  The K is the standalone symbol. Its arms are detached from the stem by an
 *  11-unit gap — a spark gap. It implies current jumping a contact without
 *  drawing a lightning bolt, which every electronics brand already owns.
 *  Use markK() alone on stickers, cartons, the favicon and social avatars.
 * ============================================================================
 */

const CAP = 100;   // cap height — all geometry is expressed against this
const STEM = 22;   // uniform stroke weight
const TRACK = 10;  // letter spacing (tight, so the word reads as one block)

const r = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const poly = (pts) => `<polygon points="${pts.map(([a, b]) => `${a},${b}`).join(' ')}"/>`;

/* --------------------------------------------------------------- glyphs -- */
/* Each returns { w, svg } where svg is filled shapes in a 0..w × 0..100 box. */

const GLYPHS = {
  P: (x) => ({
    w: 74,
    svg: [
      r(x, 0, STEM, CAP),          // stem
      r(x + 22, 0, 52, 22),        // top bar
      r(x + 52, 22, 22, 18),       // right wall (counter is 18 deep)
      r(x + 22, 40, 52, 20),       // bowl floor
    ].join(''),
  }),

  W: (x) => ({
    w: 112,
    svg: poly([
      [x, 0], [x + 24, 0], [x + 40, 62], [x + 50, 18], [x + 62, 18],
      [x + 72, 62], [x + 88, 0], [x + 112, 0], [x + 92, 100], [x + 72, 100],
      [x + 56, 48], [x + 40, 100], [x + 20, 100],
    ]),
  }),

  R: (x) => ({
    w: 80,
    svg: [
      r(x, 0, STEM, CAP),
      r(x + 22, 0, 52, 22),
      r(x + 52, 22, 22, 18),
      r(x + 22, 40, 52, 20),
      poly([[x + 42, 60], [x + 64, 60], [x + 80, 100], [x + 58, 100]]), // leg
    ].join(''),
  }),

  // The signature glyph. Arms are a single mitred stroke, held off the stem.
  K: (x) => ({
    w: 91,
    svg:
      r(x, 0, STEM, CAP) +
      `<path d="M ${x + 82} 0 L ${x + 42} 50 L ${x + 82} 100" fill="none"
         stroke="currentColor" stroke-width="${STEM}"
         stroke-linecap="butt" stroke-linejoin="miter"/>`,
  }),

  N: (x) => ({
    w: 78,
    svg: [
      r(x, 0, STEM, CAP),
      r(x + 56, 0, STEM, CAP),
      poly([[x, 0], [x + 22, 0], [x + 78, 100], [x + 56, 100]]), // diagonal
    ].join(''),
  }),

  G: (x) => ({
    w: 80,
    svg: [
      r(x, 0, STEM, CAP),        // left wall
      r(x + 22, 0, 58, 22),      // top bar
      r(x + 22, 78, 58, 22),     // bottom bar
      r(x + 58, 44, 22, 34),     // right wall, lower half only
      r(x + 40, 44, 18, 12),     // spur into the counter
    ].join(''),
  }),
};

/**
 * The PWRKNG wordmark.
 * @returns {{ width: number, height: number, svg: string }} geometry in a
 *          0..width × 0..100 box, filled with `currentColor`.
 */
export function wordmarkGeometry(letters = 'PWRKNG') {
  let x = 0;
  const parts = [];
  for (const ch of letters) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    const { w, svg } = glyph(x);
    parts.push(svg);
    x += w + TRACK;
  }
  return { width: x - TRACK, height: CAP, svg: parts.join('') };
}

/** The K, on its own, as the brand symbol. */
export function markKGeometry() {
  const { svg } = GLYPHS.K(0);
  return { width: 91, height: CAP, svg };
}

/**
 * Standalone K symbol as a complete <svg>.
 * @param {object} o { size, color, pad }
 */
export function markK({ size = 40, color = 'currentColor', pad = 14 } = {}) {
  const g = markKGeometry();
  const vbW = g.width + pad * 2;
  const vbH = g.height + pad * 2;
  return `<svg viewBox="0 0 ${vbW} ${vbH}" width="${size}" height="${Math.round(
    (size * vbH) / vbW,
  )}" fill="${color}" color="${color}" aria-hidden="true"><g transform="translate(${pad} ${pad})">${g.svg}</g></svg>`;
}

/**
 * The K locked into a filled tile — the app-icon / sticker form.
 */
export function markTile({ size = 40, bg = '#0A0B0F', fg = '#FFE01A', radius = 0.22 } = {}) {
  const g = markKGeometry();
  const box = 140;
  const scale = 74 / g.height;
  const gx = (box - g.width * scale) / 2;
  const gy = (box - g.height * scale) / 2;
  return `<svg viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" aria-hidden="true">
  <rect width="${box}" height="${box}" rx="${Math.round(box * radius)}" fill="${bg}"/>
  <g transform="translate(${gx} ${gy}) scale(${scale})" fill="${fg}" color="${fg}">${g.svg}</g>
</svg>`;
}

/**
 * Full PWRKNG wordmark as a complete <svg>.
 */
export function wordmark({ height = 28, color = 'currentColor', letters = 'PWRKNG' } = {}) {
  const g = wordmarkGeometry(letters);
  return `<svg viewBox="0 0 ${g.width} ${g.height}"
   width="${Math.round((height * g.width) / g.height)}" height="${height}"
   fill="${color}" color="${color}" aria-hidden="true">${g.svg}</svg>`;
}

export const BRAND = { CAP, STEM, TRACK };
