/**
 * ============================================================================
 *  GENERIC PRODUCT ILLUSTRATIONS
 * ============================================================================
 *  Flat vector drawings standing in for product photography, one per sample
 *  product. They are generic representations of a product *type* — a speaker,
 *  a charger, a cable — not depictions of any real manufacturer's item, and
 *  no brand marks appear on them.
 *
 *  Replace them by pointing a product's `image` at a real photograph; nothing
 *  here is referenced once you do.
 *
 *  All drawings are composed centred in an 800x800 box on white.
 * ============================================================================
 */

const BODY = '#3A3A42';
const DARK = '#26262C';
const LIGHT = '#5A5A64';
const METAL = '#C5C5CD';
const PALE = '#E6E6EB';
const ACCENT = '#F3D74B';
const GLASS = '#8FB9D6';

const r = (x, y, w, h, rx = 0, fill = BODY) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const c = (cx, cy, rr, fill = BODY) =>
  `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}"/>`;
const e = (cx, cy, rx, ry, fill = BODY) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const path = (d, fill = BODY, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stroke = (d, col = BODY, w = 14, cap = 'round') =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;

/** Soft contact shadow so the product sits on the surface. */
const shadow = (cx = 400, cy = 620, rx = 190, ry = 20) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity=".07"/>`;

/** A speaker grille: rows of small holes. */
function grille(x, y, w, h, gap = 22, dot = 4.5, fill = DARK) {
  let out = '';
  for (let gy = y + gap / 2; gy < y + h; gy += gap) {
    for (let gx = x + gap / 2; gx < x + w; gx += gap) {
      out += c(gx, gy, dot, fill);
    }
  }
  return `<g opacity=".55">${out}</g>`;
}

/** Clipper blade teeth: a row of fine metal fingers. */
function teeth(x, y, w, n = 11, h = 14, fill = METAL) {
  let out = '';
  const step = w / n;
  for (let i = 0; i < n; i += 1) out += r(x + i * step + 1, y, Math.max(2, step - 3), h, 1, fill);
  return out;
}

export const ART = {
  /* ------------------------------------------------------------ speakers -- */
  'portable-speaker': () => `
    ${shadow(400, 600, 175, 18)}
    ${r(190, 300, 420, 250, 116, BODY)}
    ${r(212, 322, 376, 206, 96, DARK)}
    ${grille(238, 348, 324, 154, 26, 5, '#4A4A54')}
    ${r(190, 300, 420, 34, 17, LIGHT)}
    ${c(300, 275, 10, METAL)}${c(500, 275, 10, METAL)}
    ${stroke('M300 275 Q400 232 500 275', METAL, 9)}
    ${r(352, 566, 96, 16, 8, PALE)}
    ${c(400, 425, 26, '#2F2F36')}
    ${c(400, 425, 9, ACCENT)}`,

  'party-speaker': () => `
    ${shadow(400, 618, 205, 20)}
    ${r(150, 280, 500, 300, 60, BODY)}
    ${r(172, 302, 456, 256, 44, DARK)}
    ${c(268, 430, 84, '#33333B')}${c(268, 430, 62, '#22222A')}${c(268, 430, 24, LIGHT)}
    ${c(532, 430, 84, '#33333B')}${c(532, 430, 62, '#22222A')}${c(532, 430, 24, LIGHT)}
    ${r(376, 386, 48, 88, 12, '#2A2A32')}
    ${grille(384, 396, 32, 68, 16, 3.5, '#55555F')}
    ${stroke('M300 280 Q400 196 500 280', LIGHT, 22)}
    ${r(150, 552, 500, 28, 14, LIGHT)}
    ${r(196, 560, 408, 10, 5, ACCENT)}`,

  /* ---------------------------------------------------------- headphones -- */
  'headphones': () => `
    ${shadow(400, 618, 165, 18)}
    ${stroke('M214 428 Q214 190 400 190 Q586 190 586 428', BODY, 30)}
    ${r(160, 396, 116, 190, 52, BODY)}
    ${r(524, 396, 116, 190, 52, BODY)}
    ${r(178, 416, 80, 150, 40, '#4E4E58')}
    ${r(542, 416, 80, 150, 40, '#4E4E58')}
    ${e(218, 491, 26, 52, '#2C2C34')}
    ${e(582, 491, 26, 52, '#2C2C34')}
    ${r(370, 176, 60, 16, 8, LIGHT)}`,

  'gaming-headset': () => `
    ${shadow(400, 618, 165, 18)}
    ${stroke('M214 428 Q214 190 400 190 Q586 190 586 428', BODY, 30)}
    ${r(160, 396, 116, 190, 52, BODY)}
    ${r(524, 396, 116, 190, 52, BODY)}
    ${r(178, 416, 80, 150, 40, '#4E4E58')}
    ${r(542, 416, 80, 150, 40, '#4E4E58')}
    ${e(218, 491, 26, 52, ACCENT)}
    ${e(582, 491, 26, 52, ACCENT)}
    ${stroke('M262 552 Q330 604 392 578', DARK, 13)}
    ${e(398, 576, 22, 15, '#2C2C34')}
    ${r(370, 176, 60, 16, 8, LIGHT)}`,

  /* ------------------------------------------------------------- earbuds -- */
  'tws-earbuds': () => `
    ${shadow(400, 606, 168, 18)}
    ${r(236, 372, 328, 210, 46, BODY)}
    ${r(236, 372, 328, 26, 13, LIGHT)}
    ${r(258, 414, 284, 148, 30, DARK)}
    ${e(330, 470, 40, 46, '#F2F2F4')}
    ${e(470, 470, 40, 46, '#F2F2F4')}
    ${r(320, 500, 20, 74, 10, '#F2F2F4')}
    ${r(460, 500, 20, 74, 10, '#F2F2F4')}
    ${c(330, 464, 15, PALE)}${c(470, 464, 15, PALE)}
    ${r(376, 340, 48, 10, 5, ACCENT)}`,

  'neckband': () => `
    ${shadow(400, 610, 175, 18)}
    ${stroke('M250 300 Q188 460 250 560 Q400 640 550 560 Q612 460 550 300', BODY, 26)}
    ${r(228, 274, 46, 74, 22, DARK)}
    ${r(526, 274, 46, 74, 22, DARK)}
    ${stroke('M251 348 Q262 420 300 448', METAL, 7)}
    ${stroke('M549 348 Q538 420 500 448', METAL, 7)}
    ${e(306, 456, 26, 20, '#F2F2F4')}
    ${e(494, 456, 26, 20, '#F2F2F4')}
    ${r(370, 588, 60, 14, 7, ACCENT)}`,

  /* ------------------------------------------------------------ chargers -- */
  'wall-charger': () => `
    ${shadow(400, 616, 130, 16)}
    ${r(268, 268, 264, 300, 54, '#F0F0F3')}
    ${r(268, 268, 264, 300, 54, 'none')}
    ${r(288, 288, 224, 260, 40, '#FAFAFB')}
    ${r(352, 496, 96, 30, 15, DARK)}
    ${r(364, 504, 72, 14, 7, '#4A4A54')}
    ${r(320, 202, 30, 70, 8, METAL)}
    ${r(450, 202, 30, 70, 8, METAL)}
    ${r(356, 330, 88, 12, 6, PALE)}
    ${c(400, 386, 9, ACCENT)}`,

  'car-charger': () => `
    ${shadow(400, 606, 118, 16)}
    ${r(300, 250, 200, 300, 52, BODY)}
    ${r(318, 268, 164, 264, 38, DARK)}
    ${r(340, 300, 120, 34, 17, '#4A4A54')}
    ${r(340, 356, 120, 34, 17, '#4A4A54')}
    ${r(354, 414, 92, 30, 15, '#4A4A54')}
    ${c(400, 496, 22, '#2A2A32')}
    ${c(400, 496, 11, ACCENT)}
    ${r(360, 550, 80, 46, 12, METAL)}
    ${c(400, 604, 16, METAL)}`,

  /* -------------------------------------------------------------- cables -- */
  'usb-c-cable': () => `
    ${shadow(400, 622, 180, 16)}
    ${stroke('M232 300 C300 470 500 400 568 300', BODY, 20)}
    ${stroke('M232 300 C300 470 500 400 568 300', '#4A4A54', 8)}
    ${r(200, 236, 66, 82, 16, DARK)}
    ${r(214, 254, 38, 16, 8, METAL)}
    ${r(534, 236, 66, 82, 16, DARK)}
    ${r(548, 254, 38, 16, 8, METAL)}
    ${r(300, 512, 200, 54, 27, PALE)}
    ${r(324, 530, 152, 18, 9, ACCENT)}`,

  'lightning-cable': () => `
    ${shadow(400, 622, 180, 16)}
    ${stroke('M232 300 C310 460 490 460 568 300', BODY, 20)}
    ${stroke('M232 300 C310 460 490 460 568 300', '#4A4A54', 8)}
    ${r(202, 232, 62, 86, 14, DARK)}
    ${r(216, 250, 34, 14, 7, METAL)}
    ${r(536, 244, 60, 74, 12, METAL)}
    ${r(550, 258, 32, 12, 6, PALE)}
    ${r(300, 512, 200, 54, 27, PALE)}
    ${r(324, 530, 152, 18, 9, ACCENT)}`,

  /* -------------------------------------------------------- power strips -- */
  'multiplug': () => `
    ${shadow(400, 596, 200, 18)}
    ${r(160, 330, 480, 240, 40, '#F0F0F3')}
    ${r(182, 352, 436, 196, 28, '#FAFAFB')}
    ${[0, 1, 2, 3]
      .map((i) => {
        const cx = 250 + i * 100;
        return c(cx, 428, 40, '#E2E2E8') + c(cx - 15, 420, 8, DARK) + c(cx + 15, 420, 8, DARK) + r(cx - 6, 442, 12, 16, 6, DARK);
      })
      .join('')}
    ${r(226, 496, 60, 26, 13, ACCENT)}
    ${r(310, 496, 260, 26, 13, '#E2E2E8')}
    ${r(376, 302, 48, 30, 10, METAL)}`,

  'extension-board': () => `
    ${shadow(400, 586, 205, 18)}
    ${r(180, 336, 440, 216, 34, '#F0F0F3')}
    ${r(200, 356, 400, 176, 24, '#FAFAFB')}
    ${[0, 1, 2]
      .map((i) => {
        const cx = 288 + i * 112;
        return c(cx, 424, 42, '#E2E2E8') + c(cx - 16, 416, 8, DARK) + c(cx + 16, 416, 8, DARK) + r(cx - 6, 438, 12, 17, 6, DARK);
      })
      .join('')}
    ${[0, 1, 2].map((i) => r(266 + i * 112, 486, 44, 22, 11, ACCENT)).join('')}
    ${stroke('M180 444 C110 444 96 540 168 566', BODY, 16)}
    ${r(140, 546, 60, 44, 12, DARK)}`,

  /* --------------------------------------------------------- phone gear -- */
  'phone-cooler': () => `
    ${shadow(400, 606, 150, 18)}
    ${r(268, 268, 264, 264, 46, BODY)}
    ${r(290, 290, 220, 220, 34, DARK)}
    ${c(400, 400, 92, '#33333B')}
    ${[0, 60, 120, 180, 240, 300]
      .map(
        (a) =>
          `<path d="M400 400 L${(400 + 78 * Math.cos(((a - 16) * Math.PI) / 180)).toFixed(1)} ${(400 + 78 * Math.sin(((a - 16) * Math.PI) / 180)).toFixed(1)} A78 78 0 0 1 ${(400 + 78 * Math.cos(((a + 16) * Math.PI) / 180)).toFixed(1)} ${(400 + 78 * Math.sin(((a + 16) * Math.PI) / 180)).toFixed(1)} Z" fill="#4E4E58"/>`,
      )
      .join('')}
    ${c(400, 400, 22, METAL)}
    ${r(268, 512, 264, 20, 10, ACCENT)}
    ${r(360, 236, 80, 34, 12, LIGHT)}
    ${r(516, 356, 34, 88, 12, LIGHT)}`,

  'power-bank': () => `
    ${shadow(400, 616, 140, 16)}
    ${r(280, 214, 240, 386, 44, BODY)}
    ${r(300, 234, 200, 346, 32, DARK)}
    ${[0, 1, 2, 3].map((i) => r(336 + i * 34, 300, 20, 8, 4, i < 3 ? ACCENT : '#4E4E58')).join('')}
    ${r(330, 372, 140, 122, 18, '#33333B')}
    ${r(348, 396, 104, 12, 6, '#55555F')}
    ${r(348, 424, 74, 12, 6, '#55555F')}
    ${r(336, 528, 56, 22, 11, '#4E4E58')}
    ${r(408, 528, 56, 22, 11, '#4E4E58')}`,

  'phone-holder': () => `
    ${shadow(400, 606, 170, 18)}
    ${r(316, 200, 168, 268, 20, '#33333B')}
    ${r(330, 214, 140, 240, 12, GLASS)}
    ${r(330, 214, 140, 240, 12, '#A8CCE3')}
    ${stroke('M400 468 L400 540', METAL, 22)}
    ${r(300, 536, 200, 30, 15, BODY)}
    ${r(250, 560, 300, 26, 13, LIGHT)}
    ${r(376, 178, 48, 14, 7, LIGHT)}`,

  /* ------------------------------------------------------------ grooming -- */
  'hair-trimmer': () => `
    ${shadow(400, 646, 118, 15)}
    ${teeth(354, 158, 92, 11, 20)}
    ${r(350, 176, 100, 28, 6, METAL)}
    ${r(358, 204, 84, 26, 8, LIGHT)}
    ${r(342, 230, 116, 396, 26, BODY)}
    ${r(342, 230, 116, 34, 17, LIGHT)}
    ${r(370, 300, 60, 46, 8, DARK)}
    ${r(380, 316, 40, 15, 3, ACCENT)}
    ${c(400, 404, 23, LIGHT)}
    ${c(400, 404, 13, DARK)}
    ${r(342, 474, 116, 9, 4, LIGHT)}
    ${r(342, 498, 116, 9, 4, LIGHT)}
    ${r(342, 522, 116, 9, 4, LIGHT)}
    ${r(352, 598, 96, 28, 10, DARK)}`,

  'grooming-kit': () => `
    ${shadow(400, 644, 205, 17)}
    ${path('M262 628 L292 546 H508 L538 628 Z', DARK)}
    ${r(256, 612, 288, 22, 10, LIGHT)}
    ${r(368, 258, 66, 300, 20, BODY)}
    ${r(368, 258, 66, 24, 12, LIGHT)}
    ${teeth(374, 236, 54, 8, 22)}
    ${r(384, 306, 34, 32, 6, DARK)}
    ${r(391, 318, 20, 11, 3, ACCENT)}
    ${c(401, 390, 16, LIGHT)}
    ${r(190, 486, 76, 62, 10, DARK)}
    ${teeth(196, 466, 64, 7, 20)}
    ${r(536, 486, 76, 62, 10, DARK)}
    ${teeth(542, 466, 64, 7, 20)}`,

  /* -------------------------------------------------- mobile accessories -- */
  'phone-tripod': () => `
    ${shadow(400, 654, 205, 16)}
    ${stroke('M400 474 L254 640', BODY, 19)}
    ${stroke('M400 474 L546 640', BODY, 19)}
    ${stroke('M400 474 L400 634', LIGHT, 16)}
    ${c(254, 644, 15, DARK)}${c(546, 644, 15, DARK)}${c(400, 638, 15, DARK)}
    ${r(376, 452, 48, 36, 12, DARK)}
    ${r(386, 300, 28, 168, 10, LIGHT)}
    ${r(392, 262, 16, 46, 6, DARK)}
    ${r(328, 146, 144, 122, 12, DARK)}
    ${r(340, 158, 120, 98, 8, GLASS)}
    ${r(328, 132, 144, 16, 6, LIGHT)}`,

  'tablet-stand': () => `
    ${shadow(400, 644, 176, 16)}
    ${e(400, 616, 152, 34, DARK)}
    ${e(400, 602, 152, 34, LIGHT)}
    ${e(400, 600, 56, 13, DARK)}
    ${r(378, 466, 44, 142, 10, METAL)}
    ${c(400, 466, 17, LIGHT)}
    ${r(384, 372, 32, 102, 8, METAL)}
    ${c(400, 372, 15, LIGHT)}
    ${r(244, 168, 312, 216, 14, DARK)}
    ${r(260, 184, 280, 184, 8, GLASS)}`,

  'magnetic-mount': () => `
    ${shadow(400, 642, 126, 15)}
    ${e(400, 612, 114, 30, DARK)}
    ${r(286, 574, 228, 38, 0, LIGHT)}
    ${e(400, 574, 114, 30, BODY)}
    ${r(384, 442, 32, 136, 12, METAL)}
    ${c(400, 442, 21, LIGHT)}
    ${c(400, 330, 118, LIGHT)}
    ${c(400, 330, 100, BODY)}
    ${c(400, 330, 58, GLASS)}
    ${c(400, 330, 46, '#FFFFFF')}`,

  /* ---------------------------------------------------------- networking -- */
  'wifi-repeater': () => `
    ${shadow(400, 624, 138, 17)}
    ${stroke('M320 322 L266 172', METAL, 18)}
    ${stroke('M366 308 L346 154', METAL, 18)}
    ${stroke('M434 308 L454 154', METAL, 18)}
    ${stroke('M480 322 L534 172', METAL, 18)}
    ${r(284, 300, 232, 306, 28, METAL)}
    ${r(292, 308, 216, 290, 22, PALE)}
    ${stroke('M352 402 a68 68 0 0 1 96 0', LIGHT, 16)}
    ${stroke('M376 430 a34 34 0 0 1 48 0', LIGHT, 16)}
    ${c(400, 464, 11, LIGHT)}
    ${r(338, 512, 124, 36, 18, '#FFFFFF')}
    ${c(360, 530, 7, ACCENT)}${c(384, 530, 7, LIGHT)}
    ${c(416, 530, 7, LIGHT)}${c(440, 530, 7, LIGHT)}`,
};

/** Which drawing each sample product uses. */
export const ART_BY_SLUG = {
  'sample-portable-bluetooth-speaker-10w': 'portable-speaker',
  'sample-party-speaker-40w-rgb': 'party-speaker',
  'sample-wireless-over-ear-headphones': 'headphones',
  'sample-wired-gaming-headset': 'gaming-headset',
  'sample-tws-wireless-earbuds': 'tws-earbuds',
  'sample-bluetooth-neckband-earphones': 'neckband',
  'sample-20w-usb-c-fast-charger': 'wall-charger',
  'sample-3-port-car-charger': 'car-charger',
  'sample-usb-c-fast-charging-cable-1m': 'usb-c-cable',
  'sample-lightning-charging-cable-1m': 'lightning-cable',
  'sample-4-socket-multiplug-with-usb': 'multiplug',
  'sample-extension-board-2m-cord': 'extension-board',
  'sample-magnetic-phone-cooling-fan': 'phone-cooler',
  'sample-10000mah-power-bank': 'power-bank',
  'sample-adjustable-phone-holder': 'phone-holder',

  /* Real catalogue — stand-in drawings until the photographs are supplied. */
  'vgr-v-091-professional-hair-trimmer': 'hair-trimmer',
  'vgr-v-071-professional-hair-trimmer': 'hair-trimmer',
  'vgr-super-trim-14-in-1-grooming-kit': 'grooming-kit',
  'neepho-np-888-phone-tripod': 'phone-tripod',
  'foldable-metal-tablet-holder-360': 'tablet-stand',
  'k007-pro-magnetic-suction-phone-mount': 'magnetic-mount',
  'wifi-repeater-300mbps': 'wifi-repeater',
};

/** Fallback by category, so a new sample product still gets a drawing. */
export const ART_BY_CATEGORY = {
  Speakers: 'portable-speaker',
  Headphones: 'headphones',
  Earbuds: 'tws-earbuds',
  'Chargers & Adapters': 'wall-charger',
  'Data Cables': 'usb-c-cable',
  'Power & Multiplugs': 'multiplug',
  'Phone Coolers': 'phone-cooler',
  'Mobile Accessories': 'power-bank',
  Grooming: 'hair-trimmer',
  Networking: 'wifi-repeater',
};

export function artFor(product) {
  const key = ART_BY_SLUG[product.slug] || ART_BY_CATEGORY[product.category];
  return ART[key] ? ART[key]() : '';
}
