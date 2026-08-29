/**
 * ============================================================================
 *  PRODUCT CATEGORIES
 * ============================================================================
 *  Categories are defined here once and drive: the homepage category grid,
 *  the catalogue filters, the category pages and the sitemap.
 *
 *  To add a category:
 *    1. Add an object below.
 *    2. Use its `name` as the `category` value on your products.
 *  To remove one, delete the object (and re-assign any products using it).
 *
 *  `icon` must be one of the keys in src/templates/icons.js — add a new SVG
 *  there if you need a different symbol.
 * ============================================================================
 */

export const categories = [
  {
    name: 'Beverages',
    slug: 'beverages',
    icon: 'bottle',
    description:
      'Soft drinks, water, juices and other packaged drinks supplied by the case.',
  },
  {
    name: 'Snacks',
    slug: 'snacks',
    icon: 'snack',
    description: 'Crisps, namkeen, nuts and everyday impulse snack lines.',
  },
  {
    name: 'Confectionery',
    slug: 'confectionery',
    icon: 'candy',
    description: 'Biscuits, chocolate, sweets and counter-top confectionery.',
  },
  {
    name: 'Food & Grocery',
    slug: 'food-grocery',
    icon: 'grocery',
    description: 'Staples, cooking essentials and packaged grocery lines.',
  },
  {
    name: 'Personal Care',
    slug: 'personal-care',
    icon: 'care',
    description: 'Soaps, shampoos, oral care and daily personal hygiene lines.',
  },
  {
    name: 'Household',
    slug: 'household',
    icon: 'home',
    description: 'Cleaning, laundry and general household consumables.',
  },
  {
    name: 'Other',
    slug: 'other',
    icon: 'box',
    description: 'Additional wholesale lines that sit outside the main ranges.',
  },
];

export default categories;
