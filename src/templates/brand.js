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
 * The six points of the cut-corner plate, as an SVG path.
 * Cuts the top-right and bottom-left corners, matching the canvas clip-path.
 */
export function platePath(w, h, cut) {
  return `M0 0 H${w - cut} L${w} ${cut} V${h} H${cut} L0 ${h - cut} Z`;
}

/** CSS clip-path for the same shape, for elements that must size to content. */
export function plateClip(cut) {
  return `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, `
       + `100% 100%, ${cut}px 100%, 0 calc(100% - ${cut}px))`;
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
 *   word     'pwrkng' (default) or 'powerking' — the canvas's signage alternate
 */
export function lockup({ height = 26, variant = 'primary', word = 'pwrkng' } = {}) {
  // Proportions from the canvas: a 40px wordmark sits on a plate padded
  // 26/34 with a 43px grille and a 22px gap.
  const s = height / 40;
  const padY = Math.round(26 * s);
  const padX = Math.round(34 * s);
  const gap = Math.round(22 * s);
  const g = Math.round(43 * s);
  const cut = Math.round(18 * s);

  const reversed = variant === 'reversed';
  const plate = reversed ? BRAND.yellow : BRAND.ink;
  const cell = reversed ? BRAND.ink : BRAND.paper;
  const live = reversed ? BRAND.paper : BRAND.yellow;
  const type = reversed ? BRAND.ink : BRAND.paper;

  return `<span class="mark" style="background:${plate};padding:${padY}px ${padX}px;gap:${gap}px;`
    + `clip-path:${plateClip(cut)}">`
    + `<svg class="mark__grille" width="${g}" height="${g}" viewBox="0 0 ${g} ${g}"`
    + ` aria-hidden="true" focusable="false">`
    + `${grille({ size: g, cell, live })}</svg>`
    + `<span class="mark__word" style="color:${type};font-size:${height}px">${word}</span>`
    + `</span>`;
}

export default { BRAND, icon, lockup, grille, platePath, plateClip };
