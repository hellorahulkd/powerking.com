import { writeFileSync, readFileSync } from 'node:fs';
const FACE = (() => {
  // The artboard iframe has no dependable network, and a fallback face would
  // render the wordmark wrong — so the site's own Archivo rides along inline.
  const woff2 = readFileSync(new URL('../public/fonts/archivo-latin.woff2', import.meta.url));
  return `    @font-face { font-family: 'Archivo'; font-style: normal; font-weight: 600 900;
      font-display: block;
      src: url(data:font/woff2;base64,${woff2.toString('base64')}) format('woff2'); }`;
})();
const INK = '#1A1A1C', VOLT = '#F3D74B', WA = '#25D366';

/**
 * Everything below is read off the packaging in the supplied photographs.
 * Nothing here is inferred: fields the boxes do not carry are marked as gaps,
 * not filled with plausible numbers.
 */
const PRODUCTS = [
  {
    cat: 'Chargers & Adapters', brand: 'PowerKing',
    name: 'Turbo Power PK-60 120W Fast Charger',
    model: 'PK-60',
    specs: [
      ['Input', '110–220V'],
      ['Output', '5V⎓3A · 9V⎓2.77A · 12V⎓2.08A'],
      ['Total power', '120W'],
      ['In the box', '100cm USB-A to Type-C cable, 1 USB port'],
    ],
    tags: ['Turbo Charge', 'Super Fast', 'Dash', 'Flash Charge', 'Warp', 'SuperVOOC', 'QC 4.0'],
    barcode: '6938473487001',
  },
  {
    cat: 'Chargers & Adapters', brand: 'PowerKing',
    name: '1USB Multi Protocol Fast Charger 120W',
    model: '[MODEL NOT ON BOX FACE]',
    specs: [
      ['Total power', '120W'],
      ['In the box', 'Charger + USB data cable, 2-in-1'],
      ['Function', 'Data transfer and high-speed charging'],
      ['Output', '[NOT LEGIBLE IN PHOTO]'],
    ],
    tags: ['Multi protocol', 'Fast charge'],
    barcode: '',
  },
  {
    cat: 'Grooming — NEW CATEGORY', brand: 'VGR',
    name: 'V-071 Professional Hair Trimmer',
    model: 'V-071',
    specs: [
      ['Power', 'Cord and cordless use'],
      ['Charging', 'USB 5V⎓1A'],
      ['Guide combs', '1mm · 2mm · 3mm'],
      ['In the box', 'Cleaning brush, oil bottle, USB-C cable, pouch'],
    ],
    tags: ['Cord & cordless', 'USB charging'],
    barcode: '8973224080711',
  },
  {
    cat: 'Grooming — NEW CATEGORY', brand: 'VGR',
    name: 'Super Trim 14-in-1 Grooming Kit',
    model: '[NOT LEGIBLE IN PHOTO]',
    specs: [
      ['Attachments', '14-in-1: clipper, nose trimmer, shaver heads'],
      ['Water rating', 'IPX6'],
      ['Display', 'LED'],
      ['In the box', 'Charging dock, 4 guide combs, USB cable, brush'],
    ],
    tags: ['IPX6', 'LED display', 'Charging dock'],
    barcode: '',
  },
];

const gap = (t) => `<span style="display: inline-block; padding: 1px 6px; border-radius: 4px;
  background: #FDF1D6; color: #7A5B00; font-weight: 700; font-size: 10px;
  letter-spacing: .02em">${t}</span>`;

const card = (p) => {
  const isNew = p.cat.includes('NEW');
  return `<article style="background: #FFFFFF; border-radius: 16px; border: 1px solid #E3E3E7;
    overflow: hidden; display: flex; flex-direction: column">

  <div style="height: 132px; background: #F5F5F7; display: flex; flex-direction: column;
       align-items: center; justify-content: center; gap: 7px; border-bottom: 1px solid #E3E3E7">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B4B4BC"
         stroke-width="1.6" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <circle cx="9" cy="10" r="1.6"/><path d="M21 15l-5-5-6 6-3-3-4 4"/>
    </svg>
    <span style="font-size: 10px; font-weight: 700; letter-spacing: .1em;
      text-transform: uppercase; color: #86868B">Photo needed</span>
  </div>

  <div style="padding: 14px 15px 12px; display: flex; flex-direction: column; gap: 7px; flex-grow: 1">
    <p style="margin: 0; font-size: 10px; font-weight: 700; letter-spacing: .1em;
       text-transform: uppercase; color: ${isNew ? '#7A5B00' : '#86868B'}">${p.cat}</p>
    <h3 style="margin: 0; font-size: 15px; line-height: 1.25; font-weight: 800;
        letter-spacing: -.01em; text-wrap: pretty">${p.name}</h3>
    <p style="margin: 0; font-size: 12px; color: #565660">${p.brand} · ${
      p.model.startsWith('[') ? gap(p.model) : p.model}</p>

    <dl style="margin: 6px 0 0; display: grid; grid-template-columns: auto 1fr;
        gap: 4px 10px; font-size: 11px; line-height: 1.4">
      ${p.specs.map(([k, v]) => `<dt style="color: #86868B; white-space: nowrap">${k}</dt>
      <dd style="margin: 0; color: ${INK}">${v.startsWith('[') ? gap(v) : v}</dd>`).join('')}
    </dl>

    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px">
      ${p.tags.map((t) => `<span style="font-size: 10px; padding: 2px 7px; border-radius: 20px;
        background: #F5F5F7; color: #565660; font-weight: 600">${t}</span>`).join('')}
    </div>

    <div style="margin-top: auto; padding-top: 12px; display: flex; align-items: center;
         justify-content: space-between; gap: 8px">
      <span style="font-size: 10px; color: #86868B; font-family: ui-monospace, monospace">${
        p.barcode || '—'}</span>
      <div style="display: flex; gap: 6px">
        <span style="width: 30px; height: 30px; border-radius: 20px; border: 1px solid #C9C9CF;
          display: flex; align-items: center; justify-content: center">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"
            fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span style="width: 30px; height: 30px; border-radius: 20px; background: ${WA};
          display: flex; align-items: center; justify-content: center">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="${INK}"
            d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 20Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.5c.1.2 1.7 2.7 4.2 3.7 1.5.6 2.1.7 2.8.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2Z"/></svg>
        </span>
      </div>
    </div>
  </div>
</article>`;
};

writeFileSync('Products.dc.html', `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
${FACE}
    body { margin: 0; font-family: Archivo, system-ui, -apple-system, sans-serif; color: ${INK};
           -webkit-font-smoothing: antialiased; }
    a { color: #6B5A00; } a:hover { color: ${INK}; }
  </style>
</helmet>
<div style="width: 1120px; height: 780px; background: #FFFFFF; box-sizing: border-box;
     padding: 40px; display: flex; flex-direction: column; gap: 20px">

  <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 20px">
    <div style="display: flex; flex-direction: column; gap: 6px">
      <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .16em;
         text-transform: uppercase; color: #86868B">From the photographs you sent</p>
      <h2 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -.03em">
        Four real products, and what is still missing</h2>
    </div>
    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #565660; max-width: 34ch">
      Every specification below is read off the box. Yellow marks a field the packaging
      does not carry — those stay blank rather than being guessed.</p>
  </div>

  <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;
       flex-grow: 1">
    ${PRODUCTS.map(card).join('')}
  </div>

  <div style="display: flex; gap: 16px; background: #F5F5F7; border-radius: 14px; padding: 16px 18px">
    <div style="flex-grow: 1">
      <p style="margin: 0 0 5px; font-size: 12px; font-weight: 800">To publish these I need</p>
      <p style="margin: 0; font-size: 12px; line-height: 1.55; color: #565660">
        The <strong>photo files</strong> — they came through chat, not as files I can read.
        Then <strong>pack size and MOQ</strong> for each (pcs per carton), which is the one
        thing a wholesale buyer actually asks and no box states.</p>
    </div>
    <div style="width: 1px; background: #E3E3E7"></div>
    <div style="flex-grow: 1">
      <p style="margin: 0 0 5px; font-size: 12px; font-weight: 800">One decision</p>
      <p style="margin: 0; font-size: 12px; line-height: 1.55; color: #565660">
        The two VGR trimmers are <strong>grooming</strong>, which none of the eight
        categories covers. Add a ninth, or is personal care a separate line you would
        rather keep off this site?</p>
    </div>
  </div>
</div>
</x-dc>
</body>
</html>
`);
console.log('wrote Products.dc.html');
