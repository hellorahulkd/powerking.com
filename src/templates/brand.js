/**
 * ============================================================================
 *  POWERKING NEPAL — BRAND MARK
 * ============================================================================
 *  Implements Powerking_Nepal_Brand_System.pptx, which the owner supplied as
 *  the brand system of record. Its own description of the primary lockup:
 *
 *    "A six-sided cut-corner plate holding the perforated faceplate grille,
 *     POWERKING in wide-tracked Archivo caps, and ELECTRONICS letter-justified
 *     beneath."
 *
 *  Every figure below is read out of that deck's shape geometry (EMU offsets
 *  and extents on the PRIMARY LOCKUP slide) rather than eyeballed, and is
 *  expressed as a ratio so the mark holds together at any size.
 *
 *  ── THE PLATE ─────────────────────────────────────────────────────────────
 *  A rectangle with the top-right and bottom-left corners chamfered.
 *
 *  ── THE GRILLE ────────────────────────────────────────────────────────────
 *  Not a plain grid. Three columns of square cells where:
 *    · row 1 runs full width,
 *    · row 2 drops its third cell to make room for the live bar,
 *    · row 3 is a half-height strip,
 *    · one tall bar in column 3, in Safety Yellow, is the single lit element.
 *  It reads as a faceplate with one channel driven — which is why the bar is
 *  taller than a cell rather than being a coloured square.
 *
 *  ── THE TYPE ──────────────────────────────────────────────────────────────
 *  POWERKING: Archivo 800 caps at +0.1em tracking (the deck sets 52.5pt with
 *  5.25pt spacing — exactly a tenth of the size).
 *  ELECTRONICS: 0.329x that size, letter-justified to POWERKING's exact width
 *  (the deck places each letter individually to achieve this).
 *
 *  ── COLOUR ────────────────────────────────────────────────────────────────
 *  Safety Yellow #F4C400, Ink #101010, White #FFFFFF. Three, and no more.
 * ==========================================================================*/

export const BRAND = {
  yellow: '#F4C400',
  ink: '#101010',
  paper: '#FFFFFF',
};

/** The plate's chamfer as a fraction of its shorter side. */
const CUT_RATIO = 22 / 130;

/**
 * Grille geometry in cell units, straight off the deck: cells are 0.303in
 * square on a 0.4315in pitch, so the gap is 0.424 of a cell.
 */
const CELL = 1;
const GAP = 0.424;
const STEP = CELL + GAP;              // 1.424
const ROW3_H = 0.449;                 // the short bottom strip
const BAR = { col: 2, y: 0.502, h: 1.924 };
export const GRILLE_BOX = { w: 2 * STEP + CELL, h: 2 * STEP + ROW3_H };  // 3.848 x 3.300

/** Ratios of the lockup's parts to the POWERKING font size. */
export const LOCKUP = {
  cellToFont: 0.4153,        // one grille cell
  padY: 0.854,
  padX: 0.943,
  gap: 0.628,                // grille to type
  subScale: 0.3286,          // ELECTRONICS relative to POWERKING
  tracking: 0.1,             // POWERKING, in em
  /** POWERKING's advance at +0.1em, measured in-browser in Archivo 800. */
  wordToFont: 7.4194,
};

/** The six points of the cut-corner plate, as an SVG path. */
export function platePath(w, h, cut) {
  return `M0 0 H${w - cut} L${w} ${cut} V${h} H${cut} L0 ${h - cut} Z`;
}

/**
 * CSS clip-path for the same shape. `cut` is any CSS length — px for fixed
 * chrome, em where the whole plate scales from one custom property.
 */
export function plateClip(cut) {
  const c = typeof cut === 'number' ? `${cut}px` : cut;
  return `polygon(0 0, calc(100% - ${c}) 0, 100% ${c}, `
       + `100% 100%, ${c} 100%, 0 calc(100% - ${c}))`;
}

/**
 * The perforated faceplate grille as SVG rects, drawn in cell units and
 * scaled by `unit`.
 *
 * @param {object} o
 *   unit  size of one cell in user units
 *   cell  colour of the perforations
 *   live  colour of the single lit bar
 *   x, y  top-left placement
 */
export function grille({ unit = 1, cell, live, x = 0, y = 0 }) {
  const at = (cx, cy, w, h, fill) =>
    `<rect x="${(x + cx * unit).toFixed(2)}" y="${(y + cy * unit).toFixed(2)}" `
    + `width="${(w * unit).toFixed(2)}" height="${(h * unit).toFixed(2)}" fill="${fill}"/>`;

  let out = '';
  for (let col = 0; col < 3; col += 1) out += at(col * STEP, 0, CELL, CELL, cell);
  for (let col = 0; col < 2; col += 1) out += at(col * STEP, STEP, CELL, CELL, cell);
  for (let col = 0; col < 3; col += 1) out += at(col * STEP, 2 * STEP, CELL, ROW3_H, cell);
  out += at(BAR.col * STEP, BAR.y, CELL, BAR.h, live);
  return out;
}

/**
 * The square icon: plate and grille, no letters. Favicon and app icons.
 *
 * @param {object} o
 *   size     rendered px
 *   variant  'primary'  ink plate, white cells, yellow bar
 *            'reversed' yellow plate, ink cells, white bar
 *            'coarse'   as primary, grille enlarged — for 32px and under,
 *                       where the fine perforations silt into a grey square
 */
export function icon({ size = 130, variant = 'primary' } = {}) {
  const box = 130;
  const cut = box * CUT_RATIO;
  const coarse = variant === 'coarse';
  const unit = (coarse ? 102 : 74) / GRILLE_BOX.w;

  const reversed = variant === 'reversed';
  const plate = reversed ? BRAND.yellow : BRAND.ink;
  const cell = reversed ? BRAND.ink : BRAND.paper;
  const live = reversed ? BRAND.paper : BRAND.yellow;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
     viewBox="0 0 ${box} ${box}" role="img" aria-label="PowerKing Nepal">
  <path d="${platePath(box, box, cut)}" fill="${plate}"/>
  ${grille({
    unit, cell, live,
    x: (box - GRILLE_BOX.w * unit) / 2,
    y: (box - GRILLE_BOX.h * unit) / 2,
  })}
</svg>`;
}

/**
 * The horizontal lockup as HTML.
 *
 * HTML rather than SVG because the plate must size itself to the type, and
 * the type is live text in the site's own Archivo. Every dimension is an `em`
 * ratio against the plate's own font-size, so the whole mark rescales from
 * the single --mark-h property and a narrow viewport can step it down.
 *
 * ELECTRONICS is emitted as spaced letters because CSS `justify` only opens
 * word gaps — a single word has nothing to stretch. It is hidden from
 * assistive tech, which would otherwise spell it out; the surrounding link
 * carries the real name.
 */
export function lockup({ height = 26, variant = 'primary' } = {}) {
  const reversed = variant === 'reversed';
  const plate = reversed ? BRAND.yellow : BRAND.ink;
  const cell = reversed ? BRAND.ink : BRAND.paper;
  const live = reversed ? BRAND.paper : BRAND.yellow;
  const type = reversed ? BRAND.ink : BRAND.paper;

  const vb = `0 0 ${(GRILLE_BOX.w * 100).toFixed(0)} ${(GRILLE_BOX.h * 100).toFixed(0)}`;

  return `<span class="mark" style="--mark-h:${height}px;background:${plate};`
    + `clip-path:${plateClip('0.45em')}">`
    + `<svg class="mark__grille" viewBox="${vb}" aria-hidden="true" focusable="false">`
    + `${grille({ unit: 100, cell, live })}</svg>`
    + `<span class="mark__type" style="color:${type}">`
    + `<span class="mark__word">POWERKING</span>`
    + `<span class="mark__sub" aria-hidden="true">E L E C T R O N I C S</span>`
    + `</span></span>`;
}

export default { BRAND, icon, lockup, grille, platePath, plateClip, LOCKUP, GRILLE_BOX };
