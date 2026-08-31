/**
 * ============================================================================
 *  POWERKING NEPAL — PRODUCT CATALOGUE DATA
 * ============================================================================
 *
 *  ⚠️  EVERY PRODUCT BELOW IS A SAMPLE PLACEHOLDER.
 *      They show the kinds of lines PowerKing Nepal supplies so the site can
 *      be reviewed, but the brand names are generic stand-ins and the pack
 *      sizes and SKUs are illustrative. Replace them with your real catalogue.
 *
 *  ── HOW TO ADD A PRODUCT ──────────────────────────────────────────────────
 *  1. Put the product photo in  public/images/products/  (jpg/png/webp).
 *  2. Copy one object below, paste it into the array and edit the fields.
 *  3. Commit and push to `main`. GitHub Actions rebuilds and deploys the site.
 *
 *  ── OR, FOR A LARGE CATALOGUE ─────────────────────────────────────────────
 *  Keeping hundreds of products in this file by hand is not practical. Put
 *  them in a spreadsheet instead, export it to data/products.csv, and run:
 *
 *      node scripts/import-products.js && node build.js
 *
 *  That REPLACES this file with the spreadsheet's contents. See
 *  data/products.example.csv for the format — it is this catalogue, exported.
 *  Use one method or the other; do not edit both.
 *
 *  ── FIELDS ────────────────────────────────────────────────────────────────
 *  id          number   Unique. Never reuse an id.
 *  name        string   Shown as the product H1 and in the WhatsApp message.
 *  slug        string   URL segment → /products/<slug>/  (lowercase, hyphens).
 *  brand       string   Brand name. Also searchable and filterable.
 *  category    string   MUST match a `name` in src/data/categories.js.
 *  description string   1–3 sentences. Used for the page and meta description.
 *  image       string   Path from the site root, e.g. '/images/products/x.jpg'.
 *                       Use a real photo (jpg/png/webp). The sample entries
 *                       point at generated .png placeholders.
 *  gallery     string[] Optional extra images. Omit or leave [] if none.
 *  packSize    string   e.g. '20 pcs per carton'. Use '' if not known.
 *  unit        string   Optional: how it is sold, e.g. 'Per carton'.
 *  sku         string   Optional internal code. Searchable. Use '' if none.
 *  featured    boolean  true → appears in the homepage Featured Products row.
 *  available   boolean  false → shown as "Currently unavailable", still listed.
 *  sample      boolean  true → shows a "SAMPLE" badge. Remove for real products.
 *  tags        string[] Optional extra search keywords.
 * ==========================================================================
 */

export const products = [
  /* ==========================================================================
   *  REAL CATALOGUE — transcribed from the product photographs supplied.
   *
   *  Every value below is read off the packaging. Where a box does not state
   *  something, the field is left empty or carries a [BRACKETED] placeholder
   *  rather than a plausible-looking guess — pack size and MOQ in particular
   *  appear on no box and are the numbers a wholesale buyer actually asks for.
   *
   *  `image` points at the filename each photo should be saved as. Until the
   *  file exists the card shows "Image coming soon" and the build warns.
   * ======================================================================== */

  /* --------------------------------------------- Chargers & Adapters -- */
  {
    id: 101,
    name: 'PowerKing Turbo Power PK-60 120W Fast Charger',
    slug: 'powerking-turbo-power-pk-60-120w',
    brand: 'PowerKing',
    category: 'Chargers & Adapters',
    description:
      'All-protocol 120W wall charger with a single USB-A port, supplied with a 100cm USB-A to Type-C cable. Input 110-220V; output 5V/3A, 9V/2.77A or 12V/2.08A. Carries overcurrent, overvoltage, short-circuit and temperature protection, and supports Turbo Charge, Super Fast, Dash, Flash Charge, Warp, SuperVOOC and Quick Charge 4.0 handsets.',
    image: '/images/products/powerking-turbo-power-pk-60-120w.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: 'PK-60',
    featured: true,
    available: true,
    sample: false,
    tags: ['fast charger', '120w', 'usb a', 'type c', 'turbo', 'quick charge', 'all protocol', '6938473487001'],
  },
  {
    id: 102,
    name: 'PowerKing 1USB Multi Protocol Fast Charger 120W',
    slug: 'powerking-1usb-multi-protocol-fast-charger-120w',
    brand: 'PowerKing',
    category: 'Chargers & Adapters',
    description:
      'Single-port 120W multi-protocol fast charger sold as a 2-in-1 pack with a USB data cable, combining data transfer and high-speed charging. Full output table is not printed on the box face photographed.',
    image: '/images/products/powerking-1usb-multi-protocol-fast-charger-120w.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: '',
    featured: true,
    available: true,
    sample: false,
    tags: ['fast charger', '120w', 'multi protocol', '2 in 1', 'data cable'],
  },

  /* ------------------------------------------------------- Grooming -- */
  {
    id: 103,
    name: 'VGR V-091 Professional Hair Trimmer',
    slug: 'vgr-v-091-professional-hair-trimmer',
    brand: 'VGR',
    category: 'Grooming',
    description:
      'Metal-bodied professional T-blade trimmer with an LED charge display and a 600mAh battery, usable corded or cordless and charged over USB. Supplied with guide combs, a cleaning brush, blade oil, a charging cable and a manual.',
    image: '/images/products/vgr-v-091-professional-hair-trimmer.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: 'V-091',
    featured: true,
    available: true,
    sample: false,
    tags: ['hair trimmer', 'clipper', 'vgr', 'voyager', 'led display', '600mah', 'cordless', 'usb charging', 't blade'],
  },
  {
    id: 104,
    name: 'VGR V-071 Professional Hair Trimmer',
    slug: 'vgr-v-071-professional-hair-trimmer',
    brand: 'VGR',
    category: 'Grooming',
    description:
      'Chrome-finish professional hair trimmer for corded or cordless use, charged over USB at 5V/1A. Supplied with 1mm, 2mm and 3mm guide combs, a cleaning brush, blade oil, a USB-C cable and a storage pouch.',
    image: '/images/products/vgr-v-071-professional-hair-trimmer.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: 'V-071',
    featured: true,
    available: true,
    sample: false,
    tags: ['hair trimmer', 'clipper', 'vgr', 'voyager', 'cordless', 'usb charging', '8973224080711'],
  },
  {
    id: 105,
    name: 'VGR Super Trim 14-in-1 Grooming Kit',
    slug: 'vgr-super-trim-14-in-1-grooming-kit',
    brand: 'VGR',
    category: 'Grooming',
    description:
      'Fourteen-piece grooming set built around a rechargeable trimmer with an LED display, rated IPX6 for washing. Includes clipper, nose-trimmer and shaver heads, four guide combs, a charging dock, a USB cable and a cleaning brush. [CONFIRM MODEL NUMBER — not legible in the photograph]',
    image: '/images/products/vgr-super-trim-14-in-1-grooming-kit.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: '',
    featured: true,
    available: true,
    sample: false,
    tags: ['grooming kit', 'trimmer', 'shaver', 'nose trimmer', 'vgr', '14 in 1', 'ipx6', 'led display', 'charging dock'],
  },

  /* --------------------------------------------- Mobile Accessories -- */
  {
    id: 106,
    name: 'NeePho NP-888 2-in-1 Phone Tripod',
    slug: 'neepho-np-888-phone-tripod',
    brand: 'NeePho',
    category: 'Mobile Accessories',
    description:
      'Extendable aluminium tripod with a spring phone clamp, sold as a 2-in-1 that converts between tripod and handheld use. Folding legs with flip locks and a rotating head for portrait or landscape.',
    image: '/images/products/neepho-np-888-phone-tripod.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: 'NP-888',
    featured: true,
    available: true,
    sample: false,
    tags: ['tripod', 'phone stand', 'neepho', '2 in 1', 'aluminium', 'extendable', 'content creation'],
  },
  {
    id: 107,
    name: 'Foldable Metal Tablet Holder with 360° Base',
    slug: 'foldable-metal-tablet-holder-360',
    brand: '[CONFIRM BRAND]',
    category: 'Mobile Accessories',
    description:
      'One-piece all-metal folding stand with a 360-degree rotating base, stated on the box to suit tablets from 4 to 16 inches. Folds flat to carry and opens without assembly.',
    image: '/images/products/foldable-metal-tablet-holder-360.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: '',
    featured: true,
    available: true,
    sample: false,
    tags: ['tablet stand', 'holder', 'foldable', 'metal', '360 rotating', 'desk stand', 'ipad'],
  },
  {
    id: 108,
    name: 'K007 Pro Vacuum Suction Magnetic Phone Mount',
    slug: 'k007-pro-magnetic-suction-phone-mount',
    brand: 'Kathmandu Peripherals',
    category: 'Mobile Accessories',
    description:
      'Aluminium-alloy magnetic phone mount on a vacuum suction base, for one-handed docking and full multi-angle adjustment. Holds on smooth surfaces such as glass, dashboards and desks.',
    image: '/images/products/k007-pro-magnetic-suction-phone-mount.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: 'K007',
    featured: true,
    available: true,
    sample: false,
    tags: ['phone mount', 'magnetic', 'suction', 'car mount', 'desk mount', 'aluminium', 'magsafe'],
  },

  /* ----------------------------------------------------- Networking -- */
  {
    id: 109,
    name: '300Mbps Wi-Fi Repeater, Access Point and Router',
    slug: 'wifi-repeater-300mbps',
    brand: '[CONFIRM BRAND]',
    category: 'Networking',
    description:
      'Wall-plug 300Mbps wireless range extender that also runs as an access point or a router, with WPS pairing, external antennas and a status LED array. An Ethernet cable is included in the box.',
    image: '/images/products/wifi-repeater-300mbps.png',
    gallery: [],
    packSize: '',
    unit: '',
    sku: '',
    featured: true,
    available: true,
    sample: false,
    tags: ['wifi repeater', 'range extender', 'access point', 'router', '300mbps', 'wps', 'wireless', 'networking'],
  },

  /* ==========================================================================
   *  SAMPLE PLACEHOLDERS — delete this whole block once the real catalogue
   *  covers enough of the range. They exist only so the site could be
   *  reviewed before real product data arrived, and every one carries a
   *  "Sample" badge on the card.
   * ======================================================================== */

  /* ------------------------------------------------------------ Speakers -- */
  {
    id: 1,
    name: 'Sample Portable Bluetooth Speaker 10W',
    slug: 'sample-portable-bluetooth-speaker-10w',
    brand: 'SampleAudio',
    category: 'Speakers',
    description:
      'Compact 10W Bluetooth speaker with TWS pairing, TF card slot and around 8 hours of playback. A steady counter line for everyday retail.',
    image: '/images/products/sample-portable-bluetooth-speaker-10w.png',
    gallery: [],
    packSize: '20 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-SPK-001',
    featured: false,
    available: true,
    sample: true,
    tags: ['bluetooth', 'speaker', 'portable', 'tws', 'wireless'],
  },
  {
    id: 2,
    name: 'Sample Party Speaker 40W with RGB',
    slug: 'sample-party-speaker-40w-rgb',
    brand: 'SampleAudio',
    category: 'Speakers',
    description:
      'Large 40W party speaker with RGB lighting, wireless mic input and a rechargeable battery. Sells well through the festival season.',
    image: '/images/products/sample-party-speaker-40w-rgb.png',
    gallery: [],
    packSize: '4 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-SPK-002',
    featured: false,
    available: true,
    sample: true,
    tags: ['party speaker', 'rgb', 'karaoke', 'trolley', 'loud'],
  },

  /* ---------------------------------------------------------- Headphones -- */
  {
    id: 3,
    name: 'Sample Wireless Over-Ear Headphones',
    slug: 'sample-wireless-over-ear-headphones',
    brand: 'SampleAudio',
    category: 'Headphones',
    description:
      'Foldable over-ear Bluetooth headphones with a built-in mic, AUX fallback and roughly 20 hours of playback per charge.',
    image: '/images/products/sample-wireless-over-ear-headphones.png',
    gallery: [],
    packSize: '30 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-HP-001',
    featured: false,
    available: true,
    sample: true,
    tags: ['headphones', 'over ear', 'bluetooth', 'wireless', 'foldable'],
  },
  {
    id: 4,
    name: 'Sample Wired Gaming Headset',
    slug: 'sample-wired-gaming-headset',
    brand: 'SampleGear',
    category: 'Headphones',
    description:
      'Wired 3.5mm gaming headset with boom mic and RGB earcups. Popular with gaming and cyber-cafe customers.',
    image: '/images/products/sample-wired-gaming-headset.png',
    gallery: [],
    packSize: '24 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-HP-002',
    featured: false,
    available: true,
    sample: true,
    tags: ['gaming', 'headset', 'wired', 'microphone', 'rgb'],
  },

  /* ------------------------------------------------------------- Earbuds -- */
  {
    id: 5,
    name: 'Sample TWS Wireless Earbuds',
    slug: 'sample-tws-wireless-earbuds',
    brand: 'SampleAudio',
    category: 'Earbuds',
    description:
      'True wireless earbuds with a charging case, touch controls and a digital battery display. One of the fastest-moving lines in the range.',
    image: '/images/products/sample-tws-wireless-earbuds.png',
    gallery: [],
    packSize: '50 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-EAR-001',
    featured: false,
    available: true,
    sample: true,
    tags: ['tws', 'earbuds', 'wireless', 'bluetooth', 'charging case'],
  },
  {
    id: 6,
    name: 'Sample Bluetooth Neckband Earphones',
    slug: 'sample-bluetooth-neckband-earphones',
    brand: 'SampleAudio',
    category: 'Earbuds',
    description:
      'Magnetic neckband earphones with around 12 hours of playback, sweat resistance and in-line controls.',
    image: '/images/products/sample-bluetooth-neckband-earphones.png',
    gallery: [],
    packSize: '60 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-EAR-002',
    featured: false,
    available: true,
    sample: true,
    tags: ['neckband', 'earphones', 'bluetooth', 'magnetic', 'sports'],
  },

  /* -------------------------------------------- Chargers & Adapters ------ */
  {
    id: 7,
    name: 'Sample 20W USB-C Fast Charger',
    slug: 'sample-20w-usb-c-fast-charger',
    brand: 'SamplePower',
    category: 'Chargers & Adapters',
    description:
      'Single-port 20W USB-C power delivery wall charger with built-in over-current protection. Supplied in retail-ready boxes.',
    image: '/images/products/sample-20w-usb-c-fast-charger.png',
    gallery: [],
    packSize: '100 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-CHG-001',
    featured: false,
    available: true,
    sample: true,
    tags: ['charger', 'usb-c', 'fast charging', 'pd', '20w', 'adapter'],
  },
  {
    id: 8,
    name: 'Sample 3-Port Car Charger',
    slug: 'sample-3-port-car-charger',
    brand: 'SamplePower',
    category: 'Chargers & Adapters',
    description:
      'Dual USB-A plus USB-C car charger with quick-charge support and an LED indicator ring.',
    image: '/images/products/sample-3-port-car-charger.png',
    gallery: [],
    packSize: '80 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-CHG-002',
    featured: false,
    available: true,
    sample: true,
    tags: ['car charger', 'usb', 'quick charge', 'vehicle', 'adapter'],
  },

  /* --------------------------------------------------------- Data Cables -- */
  {
    id: 9,
    name: 'Sample USB-C Fast Charging Cable 1m',
    slug: 'sample-usb-c-fast-charging-cable-1m',
    brand: 'SampleLink',
    category: 'Data Cables',
    description:
      'Braided 1 metre USB-C to USB-A cable rated for 3A fast charging and data transfer. Supplied in hanging retail packs.',
    image: '/images/products/sample-usb-c-fast-charging-cable-1m.png',
    gallery: [],
    packSize: '200 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-CBL-001',
    featured: false,
    available: true,
    sample: true,
    tags: ['cable', 'usb-c', 'type c', 'braided', 'fast charging', 'data'],
  },
  {
    id: 10,
    name: 'Sample Lightning Charging Cable 1m',
    slug: 'sample-lightning-charging-cable-1m',
    brand: 'SampleLink',
    category: 'Data Cables',
    description:
      'One metre Lightning to USB-A charging and sync cable with a reinforced strain relief collar.',
    image: '/images/products/sample-lightning-charging-cable-1m.png',
    gallery: [],
    packSize: '200 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-CBL-002',
    featured: false,
    available: true,
    sample: true,
    tags: ['cable', 'lightning', 'iphone', 'charging', 'data', 'sync'],
  },

  /* ---------------------------------------------------- Power & Multiplugs -- */
  {
    id: 11,
    name: 'Sample 4-Socket Multiplug with USB',
    slug: 'sample-4-socket-multiplug-with-usb',
    brand: 'SamplePower',
    category: 'Power & Multiplugs',
    description:
      'Four universal sockets plus two USB ports, with a master switch and child-safety shutters.',
    image: '/images/products/sample-4-socket-multiplug-with-usb.png',
    gallery: [],
    packSize: '30 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-PWR-001',
    featured: false,
    available: true,
    sample: true,
    tags: ['multiplug', 'extension', 'socket', 'usb', 'power strip'],
  },
  {
    id: 12,
    name: 'Sample Extension Board 2m Cord',
    slug: 'sample-extension-board-2m-cord',
    brand: 'SamplePower',
    category: 'Power & Multiplugs',
    description:
      'Extension board with a 2 metre copper cord, individual switches and surge protection.',
    image: '/images/products/sample-extension-board-2m-cord.png',
    gallery: [],
    packSize: '20 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-PWR-002',
    featured: false,
    available: true,
    sample: true,
    tags: ['extension board', 'power strip', 'surge', 'cord', 'socket'],
  },

  /* -------------------------------------------------------- Phone Coolers -- */
  {
    id: 13,
    name: 'Sample Magnetic Phone Cooling Fan',
    slug: 'sample-magnetic-phone-cooling-fan',
    brand: 'SampleGear',
    category: 'Phone Coolers',
    description:
      'Magnetic semiconductor phone cooler with RGB lighting and a USB-C feed, for gaming and long recording sessions.',
    image: '/images/products/sample-magnetic-phone-cooling-fan.png',
    gallery: [],
    packSize: '40 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-COOL-001',
    featured: false,
    available: true,
    sample: true,
    tags: ['phone cooler', 'cooling fan', 'gaming', 'magnetic', 'radiator'],
  },

  /* --------------------------------------------------- Mobile Accessories -- */
  {
    id: 14,
    name: 'Sample 10000mAh Power Bank',
    slug: 'sample-10000mah-power-bank',
    brand: 'SamplePower',
    category: 'Mobile Accessories',
    description:
      'Slim 10000mAh power bank with dual output, USB-C input and a four-stage LED charge indicator.',
    image: '/images/products/sample-10000mah-power-bank.png',
    gallery: [],
    packSize: '40 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-ACC-001',
    featured: false,
    available: true,
    sample: true,
    tags: ['power bank', 'powerbank', '10000mah', 'portable charger', 'battery'],
  },
  {
    id: 15,
    name: 'Sample Adjustable Phone Holder',
    slug: 'sample-adjustable-phone-holder',
    brand: 'SampleGear',
    category: 'Mobile Accessories',
    description:
      'Foldable aluminium desk and car phone holder with an adjustable arm and non-slip pads.',
    image: '/images/products/sample-adjustable-phone-holder.png',
    gallery: [],
    packSize: '60 pcs per carton',
    unit: 'Per carton',
    sku: 'PK-ACC-002',
    featured: false,
    available: false,
    sample: true,
    tags: ['phone holder', 'stand', 'mount', 'desk', 'car'],
  },
];

export default products;
