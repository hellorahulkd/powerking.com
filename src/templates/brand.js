/**
 * ============================================================================
 *  POWERKING NEPAL — BRAND MARK
 * ============================================================================
 *
 *  The mark is the lowercase wordmark "pwrkng", set solid and heavy, with a
 *  horizontal static tear across it.
 *
 *  It is SET IN TYPE, not drawn as polygons. An earlier pass constructed the
 *  letters from rectangles, which produced squared, modular forms — a
 *  different typeface to the reference, which has round bowls on the p and g
 *  and an arched shoulder on the n. Setting it in a heavy geometric grotesque
 *  matches the reference far more closely.
 *
 *  Face: Archivo 900, self-hosted (see scripts/fetch-fonts.js), SIL Open Font
 *  Licence, so commercial use and embedding are covered.
 *
 *  ── THE STATIC ────────────────────────────────────────────────────────────
 *  The word is sliced into horizontal bands which are displaced sideways, with
 *  torn streaks thrown clear of the letters.
 *
 *  The displacement table is HARD-CODED, never random. A logo that reshuffles
 *  itself on every build is not a logo — this way the mark is byte-identical
 *  in every render, print file and cached asset.
 *
 *  `amount` scales it from 0 (clean) to 1 (full). Below roughly 20px tall the
 *  slices read as blur rather than as an effect, so small sizes run reduced.
 * ============================================================================
 */

/** The em box the mark is composed in. */
const BOX_H = 128;
const FONT_SIZE = 116;      // cap-to-descender fills the box
const BASELINE = 102;      // measured: puts the ascender top at y=0
const TRACKING = -7;        // tight, so the word reads as one solid block
const FACE = "'Archivo', 'Archivo Black', 'Inter', Helvetica, Arial, sans-serif";

/**
 * Advance widths measured in the browser at FONT_SIZE with TRACKING applied
 * (scripts/dev/ measurement, Archivo 900). Re-measure if the face changes.
 */
const WIDTHS = { pwrkng: 448, p: 76 };  // measured in-browser, Archivo 900

/** The word as a single <text> run. */
function textRun(letters, { x = 0 } = {}) {
  // Archivo 900 is the heaviest weight available; the stroke fattens it a
  // further ~3 units per side and tightens the counters, which is what makes
  // it read as solid at display size. paint-order keeps the fill crisp.
  return `<text x="${x}" y="${BASELINE}" font-family="${FACE}" font-size="${FONT_SIZE}"
     font-weight="900" letter-spacing="${TRACKING}"
     fill="currentColor" stroke="currentColor" stroke-width="6"
     stroke-linejoin="round" paint-order="stroke"
     xml:space="preserve">${letters}</text>`;
}

/**
 * Undistorted wordmark.
 * @returns {{ width, height, svg }} filled with `currentColor`.
 */
export function wordmarkGeometry(letters = 'pwrkng') {
  return {
    width: WIDTHS[letters] ?? WIDTHS.pwrkng,
    height: BOX_H,
    svg: textRun(letters),
  };
}

/* --------------------------------------------------------------- static -- */

/** Fixed slice table: [yTop, height, dx] against the 128-unit box. */
const SLICES = [
  [0, 22, 0], [22, 6, 6], [28, 18, -2], [46, 5, 7], [51, 22, 0],
  [73, 5, -5], [78, 16, 3], [94, 5, 6], [99, 18, -1], [117, 6, -6],
  [123, 5, 4],
];

/** Torn streaks thrown clear of the letters: [x, y, w, h, opacity]. */
const STREAKS = [
  [-24, 24, 28, 5, 0.85], [430, 50, 34, 5, 0.7], [-14, 76, 17, 4, 0.55],
  [438, 96, 24, 5, 0.8], [404, 17, 20, 4, 0.45], [-19, 116, 21, 4, 0.5],
];

/**
 * The wordmark with the static applied.
 * @param {object} o
 * @param {number} o.amount  0 = clean, 1 = full.
 * @param {string} o.id      unique — two marks on a page must not share clip ids.
 */
export function glitchGeometry({ amount = 1, id = 'g', letters = 'pwrkng' } = {}) {
  const base = wordmarkGeometry(letters);
  if (amount <= 0) return base;

  const clips = SLICES.map(
    ([y, h], i) =>
      `<clipPath id="${id}s${i}"><rect x="-90" y="${y}" width="${
        base.width + 180
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
      `<rect x="${x}" y="${y}" width="${(w * amount).toFixed(1)}" height="${h}"
       opacity="${(o * amount).toFixed(2)}"/>`,
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

/** Wordmark with the static, as a complete <svg>. Padded so nothing clips. */
export function glitchWordmark({
  height = 40, color = 'currentColor', amount = 1, id = 'gw', letters = 'pwrkng',
} = {}) {
  const g = glitchGeometry({ amount, id, letters });
  const padX = 30;
  const vbW = g.width + padX * 2;
  return `<svg viewBox="${-padX} 0 ${vbW} ${g.height}"
   width="${Math.round((height * vbW) / g.height)}" height="${height}"
   fill="${color}" color="${color}" aria-hidden="true">${g.svg}</svg>`;
}

export const BRAND = { BOX_H, FONT_SIZE, BASELINE, TRACKING, FACE };
