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
 *  Categories carry no colour of their own. The palette is one accent, used
 *  on primary buttons; category is communicated by the word, not a hue.
 * ============================================================================
 */

export const categories = [
  {
    name: 'Speakers',
    slug: 'speakers',
    description:
      'Bluetooth, portable and party speakers supplied by the carton for retail counters.',
  },
  {
    name: 'Headphones',
    slug: 'headphones',
    description:
      'Wired and wireless over-ear and on-ear headphones for everyday retail.',
  },
  {
    name: 'Earbuds',
    slug: 'earbuds',
    description:
      'TWS earbuds, neckbands and in-ear earphones — the fastest-moving lines we carry.',
  },
  {
    name: 'Chargers & Adapters',
    slug: 'chargers-adapters',
    description:
      'Fast chargers, wall adapters, car chargers and power delivery bricks.',
  },
  {
    name: 'Data Cables',
    slug: 'data-cables',
    description:
      'USB-C, Lightning and micro-USB charging and data cables in retail packs.',
  },
  {
    name: 'Power & Multiplugs',
    slug: 'power-multiplugs',
    description:
      'Multiplugs, extension boards, surge protectors and universal sockets.',
  },
  {
    name: 'Phone Coolers',
    slug: 'phone-coolers',
    description:
      'Magnetic and clip-on phone cooling fans for gaming and heavy use.',
  },
  {
    name: 'Mobile Accessories',
    slug: 'mobile-accessories',
    description:
      'Holders, stands, tripods, power banks, cases and everyday phone add-ons.',
  },
  {
    name: 'Grooming',
    slug: 'grooming',
    description:
      'Hair trimmers, clippers and grooming kits — cord and cordless, USB charged.',
  },
  {
    name: 'Networking',
    slug: 'networking',
    description:
      'Wi-Fi repeaters, range extenders and access points for home and shop coverage.',
  },
];

export default categories;
