/**
 * ============================================================================
 *  POWERKING NEPAL — PRODUCT CATALOGUE DATA
 * ============================================================================
 *
 *  ⚠️  EVERY PRODUCT BELOW IS A SAMPLE PLACEHOLDER.
 *      They exist only so you can see how the website behaves. The brands and
 *      products are invented for demonstration and are NOT real PowerKing
 *      Nepal lines. Delete them all and add your own.
 *
 *  ── HOW TO ADD A PRODUCT ──────────────────────────────────────────────────
 *  1. Put the product photo in  public/images/products/  (jpg/png/webp/svg).
 *  2. Copy one object below, paste it into the array and edit the fields.
 *  3. Commit and push to `main`. GitHub Actions rebuilds and deploys the site.
 *
 *  ── FIELDS ────────────────────────────────────────────────────────────────
 *  id          number   Unique. Never reuse an id.
 *  name        string   Shown as the product H1 and in the WhatsApp message.
 *  slug        string   URL segment → /products/<slug>/  (lowercase, hyphens).
 *  brand       string   Brand name. Also searchable and filterable.
 *  category    string   MUST match a `name` in src/data/categories.js.
 *  description string   1–3 sentences. Used for the page and meta description.
 *  image       string   Path from the site root, e.g. '/images/products/x.jpg'.
 *  gallery     string[] Optional extra images. Omit or leave [] if none.
 *  packSize    string   e.g. '12 x 500ml', '24 x 100g'. Use '' if not known.
 *  unit        string   Optional: how it is sold, e.g. 'Per case'.
 *  sku         string   Optional internal code. Searchable. Use '' if none.
 *  featured    boolean  true → appears in the homepage Featured Products row.
 *  available   boolean  false → shown as "Currently unavailable", still listed.
 *  sample      boolean  true → shows a "SAMPLE" badge. Remove for real products.
 *  tags        string[] Optional extra search keywords.
 * ==========================================================================
 */

export const products = [
  {
    id: 1,
    name: 'Sample Cola 500ml',
    slug: 'sample-cola-500ml',
    brand: 'SampleCo',
    category: 'Beverages',
    description:
      'Carbonated soft drink in a 500ml PET bottle, supplied by the case. Replace this sample entry with a real product from your catalogue.',
    image: '/images/products/sample-cola-500ml.svg',
    gallery: [],
    packSize: '24 x 500ml',
    unit: 'Per case',
    sku: 'PK-SAMPLE-001',
    featured: true,
    available: true,
    sample: true,
    tags: ['soft drink', 'carbonated', 'cola', 'pet bottle'],
  },
  {
    id: 2,
    name: 'Sample Drinking Water 1L',
    slug: 'sample-drinking-water-1l',
    brand: 'SampleCo',
    category: 'Beverages',
    description:
      'Packaged drinking water in a 1 litre bottle, shrink-wrapped for wholesale distribution. Sample entry for demonstration only.',
    image: '/images/products/sample-drinking-water-1l.svg',
    gallery: [],
    packSize: '12 x 1L',
    unit: 'Per shrink pack',
    sku: 'PK-SAMPLE-002',
    featured: true,
    available: true,
    sample: true,
    tags: ['water', 'mineral water', 'drinking water'],
  },
  {
    id: 3,
    name: 'Sample Mango Juice 250ml',
    slug: 'sample-mango-juice-250ml',
    brand: 'Demo Beverages',
    category: 'Beverages',
    description:
      'Mango fruit drink in a 250ml tetra pack, a fast-moving line for retail counters. Sample entry for demonstration only.',
    image: '/images/products/sample-mango-juice-250ml.svg',
    gallery: [],
    packSize: '27 x 250ml',
    unit: 'Per case',
    sku: 'PK-SAMPLE-003',
    featured: true,
    available: true,
    sample: true,
    tags: ['juice', 'mango', 'tetra pack', 'fruit drink'],
  },
  {
    id: 4,
    name: 'Sample Potato Crisps 50g',
    slug: 'sample-potato-crisps-50g',
    brand: 'Demo Snacks',
    category: 'Snacks',
    description:
      'Salted potato crisps in a 50g nitrogen-flushed pack, sold in outer cartons. Sample entry for demonstration only.',
    image: '/images/products/sample-potato-crisps-50g.svg',
    gallery: [],
    packSize: '60 x 50g',
    unit: 'Per carton',
    sku: 'PK-SAMPLE-004',
    featured: true,
    available: true,
    sample: true,
    tags: ['crisps', 'chips', 'potato', 'salted'],
  },
  {
    id: 5,
    name: 'Sample Salted Peanuts 100g',
    slug: 'sample-salted-peanuts-100g',
    brand: 'Demo Snacks',
    category: 'Snacks',
    description:
      'Roasted and salted peanuts in a 100g pack. A steady everyday snack line. Sample entry for demonstration only.',
    image: '/images/products/sample-salted-peanuts-100g.svg',
    gallery: [],
    packSize: '40 x 100g',
    unit: 'Per carton',
    sku: 'PK-SAMPLE-005',
    featured: false,
    available: true,
    sample: true,
    tags: ['peanuts', 'nuts', 'namkeen'],
  },
  {
    id: 6,
    name: 'Sample Milk Chocolate Bar 40g',
    slug: 'sample-milk-chocolate-bar-40g',
    brand: 'Demo Confectionery',
    category: 'Confectionery',
    description:
      'Milk chocolate bar in a 40g wrapper, supplied in counter display boxes. Sample entry for demonstration only.',
    image: '/images/products/sample-milk-chocolate-bar-40g.svg',
    gallery: [],
    packSize: '24 x 40g',
    unit: 'Per display box',
    sku: 'PK-SAMPLE-006',
    featured: true,
    available: true,
    sample: true,
    tags: ['chocolate', 'candy', 'sweets', 'bar'],
  },
  {
    id: 7,
    name: 'Sample Glucose Biscuits 200g',
    slug: 'sample-glucose-biscuits-200g',
    brand: 'Demo Confectionery',
    category: 'Confectionery',
    description:
      'Glucose biscuits in a 200g family pack, a high-turnover grocery staple. Sample entry for demonstration only.',
    image: '/images/products/sample-glucose-biscuits-200g.svg',
    gallery: [],
    packSize: '30 x 200g',
    unit: 'Per carton',
    sku: 'PK-SAMPLE-007',
    featured: true,
    available: true,
    sample: true,
    tags: ['biscuits', 'cookies', 'glucose'],
  },
  {
    id: 8,
    name: 'Sample Sunflower Cooking Oil 1L',
    slug: 'sample-sunflower-cooking-oil-1l',
    brand: 'Demo Foods',
    category: 'Food & Grocery',
    description:
      'Refined sunflower cooking oil in a 1 litre pouch, packed for wholesale distribution. Sample entry for demonstration only.',
    image: '/images/products/sample-sunflower-cooking-oil-1l.svg',
    gallery: [],
    packSize: '12 x 1L',
    unit: 'Per carton',
    sku: 'PK-SAMPLE-008',
    featured: true,
    available: true,
    sample: true,
    tags: ['oil', 'cooking oil', 'sunflower', 'grocery'],
  },
  {
    id: 9,
    name: 'Sample Basmati Rice 5kg',
    slug: 'sample-basmati-rice-5kg',
    brand: 'Demo Foods',
    category: 'Food & Grocery',
    description:
      'Long grain basmati rice in a 5kg woven bag. Sample entry for demonstration only.',
    image: '/images/products/sample-basmati-rice-5kg.svg',
    gallery: [],
    packSize: '5 x 5kg',
    unit: 'Per bale',
    sku: 'PK-SAMPLE-009',
    featured: false,
    available: false,
    sample: true,
    tags: ['rice', 'basmati', 'staple', 'grain'],
  },
  {
    id: 10,
    name: 'Sample Herbal Shampoo 400ml',
    slug: 'sample-herbal-shampoo-400ml',
    brand: 'Demo Care',
    category: 'Personal Care',
    description:
      'Herbal shampoo in a 400ml bottle with a flip-top cap. Sample entry for demonstration only.',
    image: '/images/products/sample-herbal-shampoo-400ml.svg',
    gallery: [],
    packSize: '12 x 400ml',
    unit: 'Per carton',
    sku: 'PK-SAMPLE-010',
    featured: true,
    available: true,
    sample: true,
    tags: ['shampoo', 'hair care', 'herbal'],
  },
  {
    id: 11,
    name: 'Sample Bathing Soap 100g',
    slug: 'sample-bathing-soap-100g',
    brand: 'Demo Care',
    category: 'Personal Care',
    description:
      'Bathing soap bar, 100g, supplied in outer cartons for retail distribution. Sample entry for demonstration only.',
    image: '/images/products/sample-bathing-soap-100g.svg',
    gallery: [],
    packSize: '72 x 100g',
    unit: 'Per carton',
    sku: 'PK-SAMPLE-011',
    featured: false,
    available: true,
    sample: true,
    tags: ['soap', 'bathing', 'hygiene'],
  },
  {
    id: 12,
    name: 'Sample Detergent Powder 1kg',
    slug: 'sample-detergent-powder-1kg',
    brand: 'Demo Home',
    category: 'Household',
    description:
      'Laundry detergent powder in a 1kg pack. Sample entry for demonstration only.',
    image: '/images/products/sample-detergent-powder-1kg.svg',
    gallery: [],
    packSize: '9 x 1kg',
    unit: 'Per carton',
    sku: 'PK-SAMPLE-012',
    featured: false,
    available: true,
    sample: true,
    tags: ['detergent', 'washing powder', 'laundry', 'cleaning'],
  },
];

export default products;
