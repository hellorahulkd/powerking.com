/**
 * ============================================================================
 *  POWERKING NEPAL — BRAND MARK
 * ============================================================================
 *  Implements the brand system supplied as a Claude Design canvas
 *  ("Powerking Nepal — Brand system: One plate, one mark"):
 *
 *    The whole identity is a six-sided cut-corner plate holding a perforated
 *    faceplate grille and the wordmark. Nothing else — no tagline, no rule,
 *    no seal.
 *
 *  Every figure below is taken from that canvas rather than re-invented.
 *
 *  ── THE PLATE ─────────────────────────────────────────────────────────────
 *  A rectangle with two opposite corners chamfered — top-right and
 *  bottom-left. The canvas expresses it as a clip-path; the same six points
 *  drive the SVG version here, so the CSS lockup and the rasterised icons cut
 *  identically.
 *
 *  ── THE GRILLE ────────────────────────────────────────────────────────────
 *  A 3x3 grid of square cells. The canvas gives three sizes — cell/gap of
 *  11/5, 16/7 and 26/12 — and in all three the lit cell sits in row 2,
 *  column 3. That is the whole rule: the grille is not decorative noise, it
 *  is a faceplate with one indicator live.
 *
 *  ── COLOUR ────────────────────────────────────────────────────────────────
 *  Safety Yellow #F4C400, Ink #101010, White #FFFFFF. Three, no more.
 * ==========================================================================*/

export const BRAND = {
  yellow: '#F4C400',
  ink: '#101010',
  paper: '#FFFFFF',
};

/** The plate's chamfer as a fraction of its shorter side. */
const CUT_RATIO = 22 / 130;   // measured from the canvas icon plate

/** Cell-to-gap ratio of the grille, from the canvas (11/5, 16/7, 26/12). */
const GAP_RATIO = 7 / 16;

/**
 * Advance width of each setting as a multiple of the font size, measured
 * in-browser in Archivo 800 at -0.02em tracking — the exact setting the
 * lockup renders at. Guessing these is what made the previous mark drift, so
 * re-measure (scripts/dev, render the word and read getBoundingClientRect)
 * rather than adjusting by eye if the face or tracking ever changes.
 */
const ADVANCE = {
  powerking: 5.132,
  pwrkng: 3.650,
};

/** Rendered width of a wordmark setting at a given font size, in px. */
export function wordWidth(word, fontSize) {
  return (ADVANCE[word] || ADVANCE.powerking) * fontSize;
}

/**
 * The six points of the cut-corner plate, as an SVG path.
 * Cuts the top-right and bottom-left corners, matching the canvas clip-path.
 */
export function platePath(w, h, cut) {
  return `M0 0 H${w - cut} L${w} ${cut} V${h} H${cut} L0 ${h - cut} Z`;
}

/**
 * CSS clip-path for the same shape, for elements that must size to content.
 * `cut` is any CSS length — px for fixed chrome, em where the whole plate
 * scales from one custom property.
 */
export function plateClip(cut) {
  const c = typeof cut === 'number' ? `${cut}px` : cut;
  return `polygon(0 0, calc(100% - ${c}) 0, 100% ${c}, `
       + `100% 100%, ${c} 100%, 0 calc(100% - ${c}))`;
}

/**
 * The perforated faceplate grille: 3x3 cells, the middle-right one live.
 *
 * @param {object} o
 *   size  overall square size in user units
 *   cell  colour of the nine cells (the holes)
 *   live  colour of the single lit cell
 *   x, y  top-left placement
 */
export function grille({ size, cell, live, x = 0, y = 0 }) {
  // size = 3*sq + 2*gap, with gap = GAP_RATIO * sq
  const sq = size / (3 + 2 * GAP_RATIO);
  const gap = sq * GAP_RATIO;
  const step = sq + gap;

  let out = '';
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      // Row 2, column 3 is the live indicator — the one constant across
      // every size in the brand canvas.
      const isLive = row === 1 && col === 2;
      out += `<rect x="${(x + col * step).toFixed(2)}" y="${(y + row * step).toFixed(2)}" `
           + `width="${sq.toFixed(2)}" height="${sq.toFixed(2)}" `
           + `fill="${isLive ? live : cell}"/>`;
    }
  }
  return out;
}

/**
 * The square icon: plate + grille, nothing else. This is what becomes the
 * favicon, the app icons and any square format.
 *
 * @param {object} o
 *   size     rendered px
 *   variant  'primary'  ink plate, white cells, yellow live cell
 *            'reversed' yellow plate, ink cells, white live cell
 *            'coarse'   as primary but a larger grille — for 32px and under,
 *                       where the fine grid silts up into a grey square
 */
export function icon({ size = 130, variant = 'primary' } = {}) {
  const box = 130;                      // the canvas draws the icon at 130
  const cut = box * CUT_RATIO;
  const coarse = variant === 'coarse';
  const g = coarse ? 102 : 62;          // grille size, from the canvas
  const inset = (box - g) / 2;

  const reversed = variant === 'reversed';
  const plate = reversed ? BRAND.yellow : BRAND.ink;
  const cell = reversed ? BRAND.ink : BRAND.paper;
  const live = reversed ? BRAND.paper : BRAND.yellow;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
     viewBox="0 0 ${box} ${box}" role="img" aria-label="PowerKing Nepal">
  <path d="${platePath(box, box, cut)}" fill="${plate}"/>
  ${grille({ size: g, cell, live, x: inset, y: inset })}
</svg>`;
}

/**
 * The horizontal lockup as HTML — plate, grille, wordmark.
 *
 * HTML rather than SVG because the plate has to size itself to the width of
 * the word, and the word is live text in the site's own Archivo. An SVG would
 * need the advance widths measured and hard-coded, which is what the previous
 * mark did and what broke whenever the face changed.
 *
 * @param {object} o
 *   height   wordmark cap height in px; everything else scales from it
 *   variant  'primary' | 'reversed'
 *   word     'powerking' (default) or 'pwrkng' — both are settings of the
 *            same plate in the brand canvas; only the lettering changes
 */
export function lockup({ height = 26, variant = 'primary', word = 'powerking' } = {}) {
  // Every dimension is a ratio of the wordmark height, expressed in `em`
  // against the plate's own font-size, so the whole lockup rescales from the
  // single --mark-h custom property. That is what lets a media query shrink
  // it on a narrow phone: sizing each part in px instead left the mark a
  // fixed 187px wide, which overflowed a 320px viewport.
  // Ratios are the brand canvas's own figures over its 40px wordmark.
  const reversed = variant === 'reversed';
  const plate = reversed ? BRAND.yellow : BRAND.ink;
  const cell = reversed ? BRAND.ink : BRAND.paper;
  const live = reversed ? BRAND.paper : BRAND.yellow;
  const type = reversed ? BRAND.ink : BRAND.paper;

  const g = 43;   // grille viewBox; the SVG scales to its em width

  return `<span class="mark" style="--mark-h:${height}px;background:${plate};`
    + `clip-path:${plateClip('0.45em')}">`
    + `<svg class="mark__grille" viewBox="0 0 ${g} ${g}" aria-hidden="true" focusable="false">`
    + `${grille({ size: g, cell, live })}</svg>`
    + `<span class="mark__word" style="color:${type}">${word}</span>`
    + `</span>`;
}

export default { BRAND, icon, lockup, grille, platePath, plateClip };
