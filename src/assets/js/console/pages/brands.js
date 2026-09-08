/** BRANDS — /admin/brands/ */
import { taxonomyPage } from './taxonomy.js';

export default async function brands(ctx) {
  return taxonomyPage(ctx, {
    tableName: 'brands',
    singular: 'brand',
    plural: 'Brands',
    imageLabel: 'Logo',
    imageColumn: 'logo',
    hasDescription: false,
  });
}
