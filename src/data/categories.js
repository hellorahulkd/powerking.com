/**
 * ============================================================================
 *  PRODUCT CATEGORIES — PowerKing Nepal (consumer electronics wholesale)
 * ============================================================================
 *  Categories are defined here once and drive: the homepage category grid,
 *  the catalogue filters, the category pages and the sitemap.
 *
 *  To add a category:
 *    1. Add an object below.
 *    2. Use its `name` as the `category` value on your products.
 *  To remove one, delete the object (and re-assign any products using it).
 *
 *  `icon`  must be a key in src/templates/icons.js.
 *  `color` is the accent used on the category tile and its placeholder
 *          artwork. Any CSS colour works — these are what give the homepage
 *          its colour, so keep them bright and distinct from one another.
 * ============================================================================
 */

export const categories = [
  {
    name: 'Speakers',
    slug: 'speakers',
    icon: 'speaker',
    color: '#00C2FF',
    description:
      'Bluetooth, portable and party speakers supplied by the carton for retail counters.',
  },
  {
    name: 'Headphones',
    slug: 'headphones',
    icon: 'headphone',
    color: '#7C5CFF',
    description:
      'Wired and wireless over-ear and on-ear headphones for everyday retail.',
  },
  {
    name: 'Earbuds',
    slug: 'earbuds',
    icon: 'earbuds',
    color: '#FF3D8B',
    description:
      'TWS earbuds, neckbands and in-ear earphones — the fastest-moving lines we carry.',
  },
  {
    name: 'Chargers & Adapters',
    slug: 'chargers-adapters',
    icon: 'charger',
    color: '#FF7A1A',
    description:
      'Fast chargers, wall adapters, car chargers and power delivery bricks.',
  },
  {
    name: 'Data Cables',
    slug: 'data-cables',
    icon: 'cable',
    color: '#00D68F',
    description:
      'USB-C, Lightning and micro-USB charging and data cables in retail packs.',
  },
  {
    name: 'Power & Multiplugs',
    slug: 'power-multiplugs',
    icon: 'plug',
    color: '#FFC400',
    description:
      'Multiplugs, extension boards, surge protectors and universal sockets.',
  },
  {
    name: 'Phone Coolers',
    slug: 'phone-coolers',
    icon: 'cooler',
    color: '#22C1DC',
    description:
      'Magnetic and clip-on phone cooling fans for gaming and heavy use.',
  },
  {
    name: 'Mobile Accessories',
    slug: 'mobile-accessories',
    icon: 'mobile',
    color: '#A855F7',
    description:
      'Holders, power banks, screen protectors, cases and everyday phone add-ons.',
  },
];

export default categories;
