import { glitchGeometry, wordmarkGeometry } from '../src/templates/brand.js';
import { writeFileSync, readFileSync } from 'node:fs';
const FACE = (() => {
  // The artboard iframe has no dependable network, and a fallback face would
  // render the wordmark wrong — so the site's own Archivo rides along inline.
  const woff2 = readFileSync(new URL('../public/fonts/archivo-latin.woff2', import.meta.url));
  return `    @font-face { font-family: 'Archivo'; font-style: normal; font-weight: 600 900;
      font-display: block;
      src: url(data:font/woff2;base64,${woff2.toString('base64')}) format('woff2'); }`;
})();

const INK = '#1A1A1C', VOLT = '#F3D74B', BLUE_A = '#0B3FCB', BLUE_B = '#22C8F2';

/** The real shipped mark, regenerated per instance so clip ids never collide. */
const glitch = (id) => {
  const g = glitchGeometry({ amount: 1, id });
  return { w: g.width, h: g.height, svg: g.svg };
};
const clean = wordmarkGeometry();

/**
 * The PowerKing swivel from the charger packaging, REDRAWN from the photographs.
 * An S built from one arc drawn twice, the second turned through 180 degrees.
 * The two halves meet just short of the centre, which opens the diagonal split
 * across the waist, and the terminals are cut square rather than rounded —
 * both features of the mark on the box.
 *
 * This is a stand-in until the original vector is supplied.
 */
const ARM = 'M 86 26 C 64 10 26 16 24 37 C 23 48 36 52 52 54';

const swoosh = ({ size = 96, color = INK, id = 'sw', gradient = false, slice = false }) => {
  const fill = gradient ? `url(#${id}grad)` : color;
  // Each half is the same arc; the second is the first turned through 180
  // degrees, which is what opens the diagonal split across the waist.
  const half = (extra = '') =>
    `<path d="${ARM}" fill="none" stroke="${fill}" stroke-width="14"
       stroke-linecap="butt" ${extra}/>`;
  const arms = (dx = [0, 0]) => `
    <g transform="translate(${dx[0]} 0)">${half()}</g>
    <g transform="rotate(180 50 50) translate(${dx[1]} 0)">${half()}</g>`;

  // The same slice-and-displace idea as the wordmark, at a visible amplitude.
  const torn = `
    <g clip-path="url(#${id}c0)">${arms([7, 7])}</g>
    <g clip-path="url(#${id}c1)">${arms([-6, -6])}</g>
    <g clip-path="url(#${id}c2)">${arms([5, 5])}</g>
    <g clip-path="url(#${id}c3)">${arms([-4, -4])}</g>
    <rect x="-8" y="18" width="14" height="4" fill="${fill}" opacity=".7"/>
    <rect x="94" y="76" width="13" height="4" fill="${fill}" opacity=".6"/>`;

  return `
<svg width="${size}" height="${size}" viewBox="-10 0 120 100" aria-hidden="true"
     style="overflow: visible">
  <defs>
    ${gradient ? `<linearGradient id="${id}grad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${BLUE_A}"/><stop offset="1" stop-color="${BLUE_B}"/>
    </linearGradient>` : ''}
    ${slice ? `
      <clipPath id="${id}c0"><rect x="-20" y="0"  width="150" height="26"/></clipPath>
      <clipPath id="${id}c1"><rect x="-20" y="26" width="150" height="22"/></clipPath>
      <clipPath id="${id}c2"><rect x="-20" y="48" width="150" height="24"/></clipPath>
      <clipPath id="${id}c3"><rect x="-20" y="72" width="150" height="28"/></clipPath>` : ''}
  </defs>
  ${slice ? torn : arms()}
</svg>`;
};

/** The wordmark as a sized <svg>, torn or clean. */
const mark = ({ height, color = INK, id, torn = true }) => {
  const g = torn ? glitch(id) : { ...clean, svg: clean.svg };
  const pad = torn ? 30 : 0;
  const w = Math.round((height * (g.w + pad * 2)) / g.h);
  return `<svg width="${w}" height="${height}" viewBox="${-pad} 0 ${g.w + pad * 2} ${g.h}"
     style="color: ${color}; display: block" fill="currentColor" aria-hidden="true">${g.svg}</svg>`;
};

/** "PowerKing Nepal" justified to the wordmark's glyph width, as the header does. */
const subline = (glyphPx, text = 'POWERKING NEPAL') => `
<span style="display: block; width: ${glyphPx}px; font-family: Archivo, system-ui, sans-serif;
  font-weight: 600; font-size: ${Math.max(8, Math.round(glyphPx / 18))}px;
  letter-spacing: .04em; text-align: justify; text-align-last: justify; color: ${INK};
  opacity: .6">${text}</span>`;

const HEAD = (extraCss = '') => `<helmet>
  <style>
${FACE}
    body { margin: 0; font-family: Archivo, system-ui, -apple-system, sans-serif;
           color: ${INK}; -webkit-font-smoothing: antialiased; }
    a { color: #6B5A00; } a:hover { color: ${INK}; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .16em;
               text-transform: uppercase; color: #86868B; margin: 0; }
    .note { font-size: 13px; line-height: 1.5; color: #565660; margin: 0; max-width: 62ch; }
    .rule { height: 1px; background: #E3E3E7; border: 0; margin: 0; }
    ${extraCss}
  </style>
</helmet>`;

const page = (body, { script = '' } = {}) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
${body}
</x-dc>
${script}
</body>
</html>
`;

/* ------------------------------------------------------------------ 1. Main */
writeFileSync('Main.dc.html', page(`${HEAD()}
<div style="width: 880px; height: 560px; background: #FFFFFF; box-sizing: border-box;
     padding: 48px; display: flex; flex-direction: column; gap: 28px">
  <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 16px">
    <p class="eyebrow">Recommended lockup</p>
    <p class="eyebrow" style="color: ${INK}">01</p>
  </div>

  <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;
       background: #F5F5F7; border-radius: 20px; padding: 40px">
    <div style="display: flex; align-items: center; gap: 30px">
      ${swoosh({ size: 104, color: '{{swoosh}}', id: 'm' })}
      <div style="display: flex; flex-direction: column; gap: 9px">
        ${mark({ height: 74, id: 'mg' })}
        <div style="padding-left: 17px">${subline(258)}</div>
      </div>
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: 8px">
    <hr class="rule">
    <p class="note"><strong>The swivel carries the equity, the wordmark carries the
    voice.</strong> Ink keeps the mark to the site's two colours — the packaging blue
    would be a third. Same swivel, two finishes: ink on screen, the blue gradient
    where it already lives on the box.</p>
  </div>
</div>`, {
  script: `<script data-dc-script data-props='{"swoosh":{"editor":"color","default":"${INK}","options":["${INK}","${BLUE_A}","${VOLT}"],"section":"Mark"},"$preview":{"width":880,"height":560}}'>
class Component extends DCLogic {
  renderVals() { return { swoosh: this.props.swoosh ?? '${INK}' }; }
}
</script>`,
}));

/* ------------------------------------------------------- 2. Packaging blue */
writeFileSync('LockupBlue.dc.html', page(`${HEAD()}
<div style="width: 880px; height: 560px; background: #FFFFFF; box-sizing: border-box;
     padding: 48px; display: flex; flex-direction: column; gap: 28px">
  <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 16px">
    <p class="eyebrow">Option — packaging blue</p>
    <p class="eyebrow" style="color: ${INK}">02</p>
  </div>

  <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;
       background: #F5F5F7; border-radius: 20px; padding: 40px">
    <div style="display: flex; align-items: center; gap: 30px">
      ${swoosh({ size: 104, gradient: true, id: 'b' })}
      <div style="display: flex; flex-direction: column; gap: 9px">
        ${mark({ height: 74, id: 'bg' })}
        <div style="padding-left: 17px">${subline(258)}</div>
      </div>
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: 8px">
    <hr class="rule">
    <p class="note">Keeps an exact match to the boxes a shopkeeper already has on the
    shelf. The cost is a third brand colour on a site deliberately cut back to ink,
    white and one yellow — and a gradient that will not survive a one-colour print
    or a small favicon.</p>
  </div>
</div>`));

/* --------------------------------------------------------------- 3. Stacked */
writeFileSync('LockupStacked.dc.html', page(`${HEAD()}
<div style="width: 560px; height: 560px; background: #FFFFFF; box-sizing: border-box;
     padding: 44px; display: flex; flex-direction: column; gap: 24px">
  <p class="eyebrow">Option — stacked / square</p>

  <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;
       background: ${INK}; border-radius: 20px; padding: 36px">
    <div style="display: flex; flex-direction: column; align-items: center; gap: 20px">
      ${swoosh({ size: 92, color: VOLT, id: 's' })}
      ${mark({ height: 56, color: '#FFFFFF', id: 'sg' })}
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: 8px">
    <hr class="rule">
    <p class="note">For avatars, stickers and anywhere the frame is square. Reversed
    out, the swivel takes the yellow so the badge still has one point of colour.</p>
  </div>
</div>`));

/* -------------------------------------------------------------- 4. Glitched */
writeFileSync('LockupGlitched.dc.html', page(`${HEAD(`
    .sliced { position: relative; width: 104px; height: 104px; }
    .sliced > div { position: absolute; inset: 0; }
`)}
<div style="width: 880px; height: 560px; background: #FFFFFF; box-sizing: border-box;
     padding: 48px; display: flex; flex-direction: column; gap: 28px">
  <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 16px">
    <p class="eyebrow">Option — swivel torn to match</p>
    <p class="eyebrow" style="color: ${INK}">03</p>
  </div>

  <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;
       background: #F5F5F7; border-radius: 20px; padding: 40px">
    <div style="display: flex; align-items: center; gap: 30px">
      ${swoosh({ size: 104, id: 'gt', slice: true })}
      <div style="display: flex; flex-direction: column; gap: 9px">
        ${mark({ height: 74, id: 'gg' })}
        <div style="padding-left: 17px">${subline(258)}</div>
      </div>
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: 8px">
    <hr class="rule">
    <p class="note">The tear runs through both parts, so they read as one object rather
    than a symbol standing next to a logotype. It is the most distinctive of the three
    and the most fragile: the swivel is already the smaller element, and slicing a
    15px stroke costs legibility first.</p>
  </div>
</div>`));

/* ----------------------------------------------------------------- 5. Usage */
writeFileSync('Usage.dc.html', page(`${HEAD(`
    .cell { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
    .cap { font-size: 11px; font-weight: 600; color: #86868B; }
`)}
<div style="width: 880px; height: 640px; background: #FFFFFF; box-sizing: border-box;
     padding: 44px; display: flex; flex-direction: column; gap: 22px">
  <p class="eyebrow">Where it has to hold up</p>

  <div style="display: flex; align-items: flex-end; gap: 40px; background: #F5F5F7;
       border-radius: 16px; padding: 28px 30px">
    <div class="cell">
      <div style="display: flex; align-items: center; gap: 9px">
        ${swoosh({ size: 30, id: 'u1' })}${mark({ height: 26, id: 'u1g' })}
      </div>
      <span class="cap">Header — 26px</span>
    </div>
    <div class="cell">
      <div style="display: flex; align-items: center; gap: 6px">
        ${swoosh({ size: 20, id: 'u2' })}${mark({ height: 16, id: 'u2g' })}
      </div>
      <span class="cap">Smallest legible — 16px</span>
    </div>
    <div class="cell">
      <div style="width: 32px; height: 32px; background: ${INK}; border-radius: 7px;
           display: flex; align-items: center; justify-content: center">
        ${swoosh({ size: 26, color: VOLT, id: 'u3' })}
      </div>
      <span class="cap">Favicon — 32px</span>
    </div>
  </div>

  <div style="display: flex; gap: 20px">
    <div style="flex-grow: 1; background: ${INK}; border-radius: 16px; padding: 30px;
         display: flex; align-items: center; gap: 20px">
      ${swoosh({ size: 62, color: '#FFFFFF', id: 'u4' })}
      ${mark({ height: 44, color: '#FFFFFF', id: 'u4g' })}
    </div>
    <div style="flex-grow: 1; background: ${VOLT}; border-radius: 16px; padding: 30px;
         display: flex; align-items: center; gap: 20px">
      ${swoosh({ size: 62, color: INK, id: 'u5' })}
      ${mark({ height: 44, id: 'u5g' })}
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: 8px">
    <hr class="rule">
    <p class="note"><strong>The favicon drops the wordmark.</strong> "pwrkng" torn is
    unreadable at 32px — the swivel alone survives, which is the argument for bringing
    the icon back. Below about 16px the tear reads as blur, so the header already runs
    it at half amplitude.</p>
    <p class="note" style="color: #86868B">The swivel here is redrawn from the charger
    photographs, not the original artwork. Send the vector and every artboard updates
    from it.</p>
  </div>
</div>`));

console.log('wrote 5 lockup artboards');
